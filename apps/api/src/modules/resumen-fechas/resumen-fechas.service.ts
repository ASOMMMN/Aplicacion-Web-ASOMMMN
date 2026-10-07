import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  Extraccion,
  ExtraccionDocument,
} from '../ingest-ia/schemas/extraccion.schema';
import {
  Postulante,
  PostulanteDocument,
} from '../postulantes/schemas/postulante.schema';
import { Usuario, UsuarioDocument } from '../usuarios/schemas/usuario.schema';
import { CursosService } from '../cursos/cursos.service';
import { DocsPersonalesService } from '../docs-personales/docs-personales.service';

import {
  calcularEstadoVigencia,
  hoyISO,
  ORDEN_ESTADO_VIGENCIA,
  UMBRAL_POR_VENCER_MESES,
} from './vigencia.util';

import { unificarCursos, vincularCvConDocumentos } from './cursos-match.util';
import type { CursoCV } from '../ingest-ia/schemas/extraccion.schema';
import { aConfianzaNumerica } from '../docs-personales/ia/meta-fechas';
import type { MetaFechaResumen } from '../docs-personales/ia/meta-fechas-derivadas';
import { resumenDocumentosPersonales } from './docs-personales-resumen.util';
import {
  formatearConPrecision,
  PrecisionFecha,
} from '../docs-personales/ia/formatos-fecha';
import type {
  ConteoVigencia,
  ItemBase,
  ResumenFechaItem,
  ResumenFechasResponse,
} from './resumen-fechas.types';

export type {
  ResumenFechaItem,
  ResumenFechasResponse,
} from './resumen-fechas.types';

const FUENTE_SUBIDO = 'Cursos registrados';
const FUENTE_CV = 'CV';

@Injectable()
export class ResumenFechasService {
  private readonly logger = new Logger(ResumenFechasService.name);

  constructor(
    @InjectModel(Extraccion.name)
    private readonly extraccionModel: Model<ExtraccionDocument>,
    @InjectModel(Postulante.name)
    private readonly postulanteModel: Model<PostulanteDocument>,
    @InjectModel(Usuario.name)
    private readonly usuarioModel: Model<UsuarioDocument>,
    private readonly cursosService: CursosService,
    private readonly docsPersonalesService: DocsPersonalesService,
  ) {}

  // ── Normalización ─────────────────────────────────────────────────────────

  /** Convierte a YYYY-MM-DD sin calcular nada; null si no hay fecha válida. */
  private normalizarFecha(valor: unknown): string | null {
    if (!valor) return null;
    if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      return valor;
    }
    const fecha = new Date(valor as string | Date);
    return Number.isNaN(fecha.getTime())
      ? null
      : fecha.toISOString().slice(0, 10);
  }

  private texto(valor: unknown): string | null {
    return typeof valor === 'string' && valor.trim() ? valor.trim() : null;
  }

  /** Fechas de un curso del CV: fuente "cv", precisión día (YYYY-MM-DD). */
  private metaFechasCV(
    c: CursoCV,
  ): Partial<
    Record<
      'fechaEmision' | 'fechaInicio' | 'fechaVencimiento',
      MetaFechaResumen
    >
  > {
    const campos = ['fechaEmision', 'fechaInicio', 'fechaVencimiento'] as const;
    return Object.fromEntries(
      campos
        .filter((k) => this.normalizarFecha(c[k]))
        .map((k) => [
          k,
          {
            fuente: 'cv',
            precision: 'dia',
            confianza: aConfianzaNumerica(c.confianza?.[k]) ?? null,
            evidencia: null,
            lector: null,
            bloqueada: false,
            editadoPorEmail: null,
            editadoEn: null,
          },
        ]),
    );
  }

  // ── Nombre del postulante ─────────────────────────────────────────────────

  private async obtenerNombrePostulante(postulanteId: string): Promise<string> {
    const postulante = await this.postulanteModel.findById(postulanteId).lean();
    if (!postulante) throw new NotFoundException('Postulante no encontrado.');

    if (postulante.usuarioId) {
      const usuario = await this.usuarioModel
        .findById(postulante.usuarioId)
        .select('nombre apellidos')
        .lean();
      const nombre = [usuario?.nombre, usuario?.apellidos]
        .filter((v) => typeof v === 'string' && v.trim())
        .join(' ')
        .trim();
      if (nombre) return nombre;
    }
    return 'Postulante';
  }

  // ── Fuentes de datos ──────────────────────────────────────────────────────

  private async obtenerCursosRegistrados(
    postulanteId: string,
  ): Promise<ItemBase[]> {
    const { cursos } =
      await this.cursosService.listarCursosPorPostulante(postulanteId);

    return cursos
      .filter((c) => this.texto(c.nombreCurso))
      .map((c) => ({
        tipo: 'Curso' as const,
        nombre: c.nombreCurso.trim(),
        institucion: this.texto(c.institucion),
        // Sin fallback a fechaCurso: cuando el postulante no da fecha, el
        // frontend guarda ahí el día de la subida, no una fecha del curso.
        fechaInicio: this.normalizarFecha(c.fechaInicio),
        fechaEmision: this.normalizarFecha(c.fechaEmision),
        fechaVencimiento: this.normalizarFecha(c.fechaVencimiento),
        fechaVencimientoEstimada: c.fechaVencimientoEstimada,
        origenVencimiento: c.origenVencimiento,
        sinDocumento: !c.tieneDocumentoExtra,
        confianzaDocumento: c.confianza
          ? {
              fechaEmision: c.confianza.fechaEmision,
              fechaInicio: c.confianza.fechaInicio,
              fechaVencimiento: c.confianza.fechaVencimiento,
            }
          : null,
        revisarFechasCurso: c.revisarFechas
          ? { motivos: c.motivosRevision }
          : null,
        metaFechas: c.metaFechas,
        detalle: null,
        aplicaVencimiento: true,
        confianzaCV: null,
        nombreEnCV: null,
        discrepancia: null,
        origen: 'subido' as const,
        fuente: [FUENTE_SUBIDO],
      }));
  }

  private async obtenerCursosCV(postulanteId: string): Promise<ItemBase[]> {
    // Una extracción rechazada por el evaluador no cuenta.
    const extraccion = await this.extraccionModel
      .findOne({
        postulanteId: new Types.ObjectId(postulanteId),
        estado: { $ne: 'rechazado' },
      })
      .sort({ creadoEn: -1 })
      .lean();

    // Los datos confirmados por el evaluador tienen prioridad.
    const datos = extraccion?.datosConfirmados ?? extraccion?.datosExtraidos;
    if (!Array.isArray(datos?.cursos)) return [];

    return datos.cursos
      .filter((c) => this.texto(c?.nombre))
      .map((c) => ({
        tipo: 'Curso' as const,
        nombre: c.nombre!.trim(),
        institucion: this.texto(c.institucion),
        fechaInicio: this.normalizarFecha(c.fechaInicio),
        fechaEmision: this.normalizarFecha(c.fechaEmision),
        fechaVencimiento: this.normalizarFecha(c.fechaVencimiento),
        fechaVencimientoEstimada: Boolean(c.fechaVencimientoEstimada),
        // Solo en el CV: sin documento no se aplica la regla de 5 años.
        origenVencimiento: null,
        sinDocumento: true,
        metaFechas: this.metaFechasCV(c),
        detalle: null,
        aplicaVencimiento: true,
        confianzaCV: c.confianza ?? null,
        nombreEnCV: null,
        discrepancia: null,
        origen: 'cv' as const,
        fuente: [FUENTE_CV],
      }));
  }

  /** Una fila por tipo (archivo más reciente); ver docs-personales-resumen.util. */
  private async obtenerDocumentosPersonales(
    postulanteId: string,
  ): Promise<ItemBase[]> {
    const docs =
      await this.docsPersonalesService.listarFechasPorPostulante(postulanteId);
    return resumenDocumentosPersonales(docs);
  }

  // ── Resumen ───────────────────────────────────────────────────────────────

  async generarResumen(postulanteId: string): Promise<ResumenFechasResponse> {
    this.logger.log(
      `Generando resumen de fechas para postulante ${postulanteId}`,
    );

    const postulante = await this.obtenerNombrePostulante(postulanteId);

    const [registrados, cv, documentos] = await Promise.all([
      this.obtenerCursosRegistrados(postulanteId),
      this.obtenerCursosCV(postulanteId),
      this.obtenerDocumentosPersonales(postulanteId),
    ]);

    const hoy = hoyISO();
    const conteo: ConteoVigencia = {
      vencido: 0,
      por_vencer: 0,
      vigente: 0,
      sin_fecha: 0,
      no_aplica: 0,
    };

    // Un curso del CV que es un documento personal (p. ej. "Actualización
    // para Maquinista Naval" ↔ refrendo, mismo vencimiento) se muestra
    // como un solo registro: el documento con su comprobante.
    const vinculados = vincularCvConDocumentos(
      unificarCursos(registrados, cv),
      documentos,
    );
    const items: ResumenFechaItem[] = [
      ...vinculados.cursos,
      ...vinculados.documentos,
    ].map((item) => {
      const vigencia = item.aplicaVencimiento
        ? calcularEstadoVigencia(item.fechaVencimiento, hoy)
        : { estadoVigencia: 'no_aplica' as const, diasParaVencer: null };
      conteo[vigencia.estadoVigencia]++;
      return { ...item, ...vigencia };
    });

    // Vencidos primero; luego por vencer, vigentes, sin fecha y no aplica.
    // Dentro de cada estado: el que vence antes primero, después por nombre.
    items.sort(
      (a, b) =>
        ORDEN_ESTADO_VIGENCIA[a.estadoVigencia] -
          ORDEN_ESTADO_VIGENCIA[b.estadoVigencia] ||
        (a.fechaVencimiento ?? '').localeCompare(b.fechaVencimiento ?? '') ||
        a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }),
    );

    return {
      titulo: 'RESUMEN DE FECHAS — EXTRACCIÓN IA',
      postulante,
      fechaGeneracion: new Date().toISOString().slice(0, 10),
      fechaReferencia: hoy,
      umbralPorVencerMeses: UMBRAL_POR_VENCER_MESES,
      conteo,
      items,
    };
  }

  // ── Resumen formateado ────────────────────────────────────────────────────

  async generarResumenFormateado(postulanteId: string) {
    const resumen = await this.generarResumen(postulanteId);

    return {
      titulo: resumen.titulo,
      postulante: resumen.postulante,
      fechaGeneracion: this.formatearFechaReporte(resumen.fechaGeneracion),
      conteo: resumen.conteo,
      filas: resumen.items.map((item) => ({
        tipo: item.tipo,
        nombre: item.nombre,
        fechaInicio: this.formatearFechaReporte(
          item.fechaInicio,
          item.precisionFechas?.fechaInicio,
        ),
        fechaEmision: this.formatearFechaReporte(
          item.fechaEmision,
          item.precisionFechas?.fechaEmision,
        ),
        fechaVencimiento: this.formatearFechaReporte(
          item.fechaVencimiento,
          item.precisionFechas?.fechaVencimiento,
        ),
        estadoVigencia: item.estadoVigencia,
        fuente: item.fuente,
      })),
    };
  }

  /** DD/MM/AAAA, MM/AAAA o AAAA según la precisión de la fecha. */
  private formatearFechaReporte(
    valor: string | null,
    precision?: PrecisionFecha,
  ): string {
    return formatearConPrecision(valor, precision) ?? '—';
  }
}
