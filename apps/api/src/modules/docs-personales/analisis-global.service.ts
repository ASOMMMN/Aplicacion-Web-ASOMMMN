import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, Types } from 'mongoose';

import { AuditoriaService } from '../auditoria/auditoria.service';
import { AuthUser } from '../auth/strategies/jwt.strategy';
import { DocsPersonalesService } from './docs-personales.service';
import {
  EstadoAnalisisGlobalDto,
  ResultadoAnalisisDocDto,
} from './dto/doc-personal.dto';
import {
  DocPersonal,
  DocPersonalDocument,
} from './schemas/doc-personal.schema';

/**
 * Documentos a procesar: estado "pendiente" o "error", sin fechas
 * verificadas. Los anteriores al campo extraccionEstado se deducen igual
 * que en ia/estado-extraccion.ts (sin análisis y sin fechas = pendiente;
 * análisis con error = error).
 */
export const FILTRO_PENDIENTES_GLOBAL: QueryFilter<DocPersonal> = {
  fechasVerificadas: null,
  $or: [
    { extraccionEstado: { $in: ['pendiente', 'error'] } },
    { extraccionEstado: null, 'analisisIa.error': { $exists: true } },
    {
      extraccionEstado: null,
      analisisIa: null,
      fechaEmision: null,
      fechaInicio: null,
      fechaVencimiento: null,
    },
  ],
};

/** Errores que afectan a todos los documentos: no tiene caso seguir. */
/**
 * Errores que afectan a todos los documentos: no tiene caso seguir.
 * El límite por minuto de OpenAI NO está aquí: ese pausa y continúa.
 */
const ERROR_GLOBAL = /API key|sin saldo/i;

const MAX_RECIENTES = 30;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Progreso = Omit<EstadoAnalisisGlobalDto, 'pendientesAhora'>;

const progresoInicial = (): Progreso => ({
  enCurso: false,
  total: 0,
  procesados: 0,
  correctos: 0,
  sinFechas: 0,
  errores: 0,
  iniciadoEn: null,
  iniciadoPor: null,
  finalizadoEn: null,
  motivoFin: null,
  recientes: [],
  pausa: null,
});

/**
 * Análisis de los documentos pendientes de todos los postulantes, en
 * segundo plano, por lotes y con pausa entre llamadas a OpenAI.
 *
 * El progreso vive en memoria (una sola instancia en Render): si el
 * servicio se reinicia a mitad, lo ya procesado quedó guardado en cada
 * documento y basta con volver a iniciar para seguir con el resto.
 */
@Injectable()
export class AnalisisGlobalService {
  private readonly logger = new Logger(AnalisisGlobalService.name);
  private progreso: Progreso = progresoInicial();
  private detenerSolicitado = false;

  constructor(
    @InjectModel(DocPersonal.name)
    private readonly docModel: Model<DocPersonalDocument>,
    private readonly docs: DocsPersonalesService,
    private readonly auditoria: AuditoriaService,
    private readonly config: ConfigService,
  ) {}

  async obtenerEstado(): Promise<EstadoAnalisisGlobalDto> {
    const pendientesAhora = await this.docModel.countDocuments(
      FILTRO_PENDIENTES_GLOBAL,
    );
    return { ...this.progreso, pendientesAhora };
  }

  async iniciar(actor: AuthUser): Promise<EstadoAnalisisGlobalDto> {
    if (this.progreso.enCurso) {
      throw new ConflictException('Ya hay un análisis global en curso.');
    }
    // Los más antiguos primero: son los que nunca se analizaron.
    const ids = (
      await this.docModel
        .find(FILTRO_PENDIENTES_GLOBAL)
        .select('_id')
        .sort({ subidasEn: 1 })
        .lean()
    ).map((d) => d._id);

    this.detenerSolicitado = false;
    this.progreso = {
      ...progresoInicial(),
      enCurso: ids.length > 0,
      total: ids.length,
      iniciadoEn: new Date(),
      iniciadoPor: actor.email,
      ...(ids.length === 0
        ? {
            finalizadoEn: new Date(),
            motivoFin: 'No había documentos pendientes.',
          }
        : {}),
    };

    if (ids.length > 0) {
      await this.auditoria.registrar({
        actorId: actor.userId,
        actorEmail: actor.email,
        accion: 'doc_personal_analisis_global_iniciar',
        recurso: 'DocPersonal',
        metadata: { total: ids.length },
      });
      // En segundo plano: la petición responde de inmediato.
      void this.procesar(ids, actor).catch((err: Error) => {
        this.logger.error(`Análisis global interrumpido: ${err.message}`);
        this.terminar(actor, `Interrumpido por un error: ${err.message}`);
      });
    }
    return this.obtenerEstado();
  }

  async detener(): Promise<EstadoAnalisisGlobalDto> {
    if (this.progreso.enCurso) this.detenerSolicitado = true;
    return this.obtenerEstado();
  }

  private async procesar(ids: Types.ObjectId[], actor: AuthUser) {
    const num = (clave: string, porDefecto: number) => {
      const n = Number(this.config.get<string>(clave));
      return Number.isFinite(n) && n >= 0 ? n : porDefecto;
    };
    const lote = Math.max(1, num('IA_DOCS_LOTE', 10));
    const pausa = num('IA_DOCS_PAUSA_MS', 1500);
    const pausaLote = num('IA_DOCS_PAUSA_LOTE_MS', 5000);

    // Límite por minuto de OpenAI: pausa y reintenta el MISMO documento,
    // sin contarlo como error. La espera crece si sigue limitado.
    const pausa429 = num('IA_DOCS_PAUSA_429_MS', 60_000);
    const maxPausas429 = Math.max(1, num('IA_DOCS_MAX_PAUSAS_429', 20));
    let pausasSeguidas = 0;

    for (let i = 0; i < ids.length; i++) {
      if (this.detenerSolicitado) {
        return this.terminar(actor, 'Detenido por el usuario.');
      }

      const id = ids[i].toString();
      let r: ResultadoAnalisisDocDto | null = null;
      let error: string | null = null;
      try {
        r = await this.docs.reanalizar(actor, id, 'lote');
        error = r.extraccionEstado === 'error' ? r.extraccionError : null;
      } catch (err) {
        error = (err as Error).message;
      }

      if (r?.limitePorMinuto) {
        pausasSeguidas++;
        if (pausasSeguidas > maxPausas429) {
          return this.terminar(
            actor,
            `Detenido: ${pausasSeguidas - 1} pausas seguidas por límite por minuto de OpenAI. Revisa los límites de la cuenta.`,
          );
        }
        const espera = Math.min(pausa429 * pausasSeguidas, 10 * 60_000);
        this.progreso.pausa = {
          hasta: new Date(Date.now() + espera),
          motivo: r.aviso ?? 'Límite por minuto de OpenAI',
        };
        this.logger.warn(
          `Análisis global en pausa ${Math.round(espera / 1000)} s por límite por minuto de OpenAI (documento ${id}, pausa ${pausasSeguidas}).`,
        );
        await this.esperar(espera);
        this.progreso.pausa = null;
        i--; // mismo documento
        continue;
      }
      pausasSeguidas = 0;

      const p = this.progreso;
      p.procesados++;
      if (r?.extraccionEstado === 'ok') p.correctos++;
      else if (r?.extraccionEstado === 'sin_fechas') p.sinFechas++;
      else p.errores++;
      if (r) p.recientes = [r, ...p.recientes].slice(0, MAX_RECIENTES);

      if (error && ERROR_GLOBAL.test(error)) {
        return this.terminar(actor, `Detenido: ${error}`);
      }

      if (i < ids.length - 1) {
        await dormir((i + 1) % lote === 0 ? pausaLote : pausa);
      }
    }
    this.terminar(actor, 'Completado.');
  }

  /** Espera en tramos de 1 s para que "Detener" responda durante la pausa. */
  private async esperar(ms: number) {
    const fin = Date.now() + ms;
    while (Date.now() < fin && !this.detenerSolicitado) {
      await dormir(Math.min(1000, fin - Date.now()));
    }
  }

  private terminar(actor: AuthUser, motivo: string) {
    const p = this.progreso;
    p.enCurso = false;
    p.pausa = null;
    p.finalizadoEn = new Date();
    p.motivoFin = motivo;
    this.logger.log(
      `Análisis global: ${motivo} ${p.procesados}/${p.total} (ok ${p.correctos}, sin fechas ${p.sinFechas}, error ${p.errores})`,
    );
    void this.auditoria.registrar({
      actorId: actor.userId,
      actorEmail: actor.email,
      accion: 'doc_personal_analisis_global_fin',
      recurso: 'DocPersonal',
      metadata: {
        motivo,
        total: p.total,
        procesados: p.procesados,
        correctos: p.correctos,
        sinFechas: p.sinFechas,
        errores: p.errores,
      },
    });
  }
}
