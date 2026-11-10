import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import archiver from 'archiver';
import type { Response } from 'express';
import type { Readable } from 'node:stream';

import { StorageService } from '../storage/storage.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { AuthUser } from '../auth/strategies/jwt.strategy';
import { construirContentDisposition } from '../../common/utils/content-disposition.util';
import {
  DocPersonal,
  DocPersonalDocument,
} from '../docs-personales/schemas/doc-personal.schema';
import {
  LABEL_TIPO_DOC,
  TIPOS_DOC_PERSONAL,
} from '../docs-personales/constants/tipos-doc-personal';
import { Curso, CursoDocument } from '../cursos/schemas/curso.schema';
import {
  Documento,
  DocumentoDocument,
} from '../documentos/schemas/documento.schema';
import {
  Postulante,
  PostulanteDocument,
} from '../postulantes/schemas/postulante.schema';
import {
  ArchivoNoIncluido,
  CARPETA_CURSOS,
  CARPETA_CV,
  CARPETA_DOCS_PERSONALES,
  NombresUnicos,
  construirLeeme,
  nombreArchivoZip,
  nombreCarpetaRaiz,
} from './expediente-zip.util';

/** Un archivo que se intentará meter al ZIP. `url` es la URL canónica en BD: nunca sale al cliente. */
export interface EntradaZip {
  /** Ruta relativa a la carpeta raíz, p. ej. `01_Documentos_personales/CURP.pdf`. */
  ruta: string;
  url: string;
  tamanio: number;
  fecha?: Date;
}

export interface PlanZip {
  postulanteId: string;
  nombreAspirante: string;
  carpetaRaiz: string;
  nombreZip: string;
  entradas: EntradaZip[];
  /** Registrados en BD pero sin archivo descargable (almacenamiento anterior). */
  noDisponibles: ArchivoNoIncluido[];
  bytesEstimados: number;
}

export type ResultadoZip = 'completado' | 'cancelado' | 'error';

const MB = 1024 * 1024;
const MOTIVO_ALMACENAMIENTO_ANTERIOR =
  'Archivo de un almacenamiento anterior que ya no está disponible; el aspirante debe volver a subirlo.';
const MOTIVO_NO_ENCONTRADO =
  'No se encontró en el almacenamiento o no se pudo leer.';
const MOTIVO_TIEMPO_AGOTADO = 'El almacenamiento tardó demasiado en responder.';

/** Orden de las subcarpetas de documentos personales: el mismo del catálogo. */
const ORDEN_TIPO_DOC = new Map<string, number>(
  TIPOS_DOC_PERSONAL.map((t, i) => [t, i]),
);

/**
 * "Descargar todo (ZIP)": arma en streaming un ZIP con todos los documentos
 * que subió un aspirante (personales, certificados de cursos y CV actual).
 *
 * Memoria: los objetos de S3 se leen uno por uno como stream y se pasan a la
 * respuesta con backpressure (pipe), sin buffers completos. Compresión nivel
 * 0 (`store`): los PDF/imágenes ya vienen comprimidos y así no se gasta CPU.
 */
@Injectable()
export class ExpedienteZipService {
  private readonly logger = new Logger(ExpedienteZipService.name);
  private readonly maxBytes: number;
  private readonly maxArchivos: number;
  private readonly maxSimultaneas: number;
  private readonly timeoutAperturaMs: number;
  private enCurso = 0;

  constructor(
    @InjectModel(Postulante.name)
    private readonly postulanteModel: Model<PostulanteDocument>,
    @InjectModel(DocPersonal.name)
    private readonly docPersonalModel: Model<DocPersonalDocument>,
    @InjectModel(Curso.name)
    private readonly cursoModel: Model<CursoDocument>,
    @InjectModel(Documento.name)
    private readonly documentoModel: Model<DocumentoDocument>,
    private readonly storage: StorageService,
    private readonly auditoria: AuditoriaService,
    config: ConfigService,
  ) {
    const numero = (clave: string, defecto: number) => {
      const valor = Number(config.get<string>(clave));
      return Number.isFinite(valor) && valor > 0 ? valor : defecto;
    };
    this.maxBytes = numero('EXPEDIENTE_ZIP_MAX_MB', 300) * MB;
    this.maxArchivos = numero('EXPEDIENTE_ZIP_MAX_ARCHIVOS', 300);
    this.maxSimultaneas = numero('EXPEDIENTE_ZIP_MAX_SIMULTANEAS', 2);
    this.timeoutAperturaMs = numero(
      'EXPEDIENTE_ZIP_TIMEOUT_APERTURA_MS',
      30_000,
    );
  }

  /**
   * Arma la lista de archivos del expediente. Todo se filtra por
   * `postulanteId` (no hay forma de colar un documento de otro aspirante) y
   * se valida existencia y límites ANTES de enviar cabeceras, para poder
   * responder un error JSON normal.
   */
  async planificar(postulanteId: string): Promise<PlanZip> {
    if (!Types.ObjectId.isValid(postulanteId)) {
      throw new NotFoundException('Postulante no encontrado.');
    }
    const id = new Types.ObjectId(postulanteId);

    const postulante = await this.postulanteModel
      .findById(id)
      .populate('usuarioId', 'nombre apellidos')
      .lean();
    if (!postulante) throw new NotFoundException('Postulante no encontrado.');

    const usuario = postulante.usuarioId as unknown as {
      nombre?: string;
      apellidos?: string;
    } | null;
    const nombreAspirante =
      [usuario?.nombre, usuario?.apellidos].filter(Boolean).join(' ').trim() ||
      'Aspirante';

    const [docs, cursos, cv] = await Promise.all([
      this.docPersonalModel
        .find({ postulanteId: id })
        .sort({ subidasEn: 1 })
        .lean(),
      this.cursoModel
        .find({ postulanteId: id, documentoExtra: { $ne: null } })
        .sort({ fechaCurso: 1 })
        .lean(),
      this.documentoModel.findOne({ postulanteId: id, esActual: true }).lean(),
    ]);

    const nombres = new NombresUnicos();
    const entradas: EntradaZip[] = [];
    const noDisponibles: ArchivoNoIncluido[] = [];

    const agregar = (
      carpeta: string,
      prefijo: string,
      archivo: {
        nombreOriginal?: string;
        tipoMime?: string;
        tamanio?: number;
        storageType?: string;
        cloudinaryUrl?: string;
      },
      fecha?: Date,
    ) => {
      const nombre = nombres.reservar(
        carpeta,
        nombreArchivoZip(prefijo, archivo.nombreOriginal, archivo.tipoMime),
      );
      const ruta = `${carpeta}/${nombre}`;
      if (archivo.storageType !== 'cloudinary' || !archivo.cloudinaryUrl) {
        noDisponibles.push({ ruta, motivo: MOTIVO_ALMACENAMIENTO_ANTERIOR });
        return;
      }
      entradas.push({
        ruta,
        url: archivo.cloudinaryUrl,
        tamanio: Math.max(0, Number(archivo.tamanio) || 0),
        fecha,
      });
    };

    [...docs]
      .sort(
        (a, b) =>
          (ORDEN_TIPO_DOC.get(a.tipo) ?? 99) -
          (ORDEN_TIPO_DOC.get(b.tipo) ?? 99),
      )
      .forEach((d) =>
        agregar(
          CARPETA_DOCS_PERSONALES,
          LABEL_TIPO_DOC[d.tipo] ?? d.tipo,
          d,
          d.subidasEn,
        ),
      );

    cursos.forEach((c) => {
      if (!c.documentoExtra) return;
      agregar(
        CARPETA_CURSOS,
        c.nombreCurso || 'Curso',
        c.documentoExtra,
        c.documentoExtra.subidoEn,
      );
    });

    if (cv) agregar(CARPETA_CV, `CV_v${cv.version ?? 1}`, cv, cv.subidasEn);

    if (entradas.length === 0) {
      throw new NotFoundException(
        noDisponibles.length > 0
          ? 'Los documentos de este aspirante son de un almacenamiento anterior y ya no están disponibles para descargar.'
          : 'Este aspirante todavía no tiene documentos para descargar.',
      );
    }

    const bytesEstimados = entradas.reduce((s, e) => s + e.tamanio, 0);
    if (bytesEstimados > this.maxBytes || entradas.length > this.maxArchivos) {
      throw new UnprocessableEntityException(
        `El expediente es demasiado grande para descargarlo en un solo ZIP ` +
          `(${(bytesEstimados / MB).toFixed(1)} MB en ${entradas.length} archivos; ` +
          `máximo ${Math.round(this.maxBytes / MB)} MB y ${this.maxArchivos} archivos). ` +
          `Descarga los documentos por separado.`,
      );
    }

    const carpetaRaiz = nombreCarpetaRaiz(
      usuario?.apellidos,
      usuario?.nombre,
      postulanteId,
    );
    const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return {
      postulanteId,
      nombreAspirante,
      carpetaRaiz,
      nombreZip: `Documentos_${carpetaRaiz}_${fecha}.zip`,
      entradas,
      noDisponibles,
      bytesEstimados,
    };
  }

  /**
   * Reserva un lugar entre las descargas simultáneas (protege la poca RAM y
   * el ancho de banda de Render). Devuelve la función para liberarlo.
   */
  reservarTurno(): () => void {
    if (this.enCurso >= this.maxSimultaneas) {
      throw new ServiceUnavailableException(
        'Hay otras descargas de expedientes en curso. Intenta de nuevo en un minuto.',
      );
    }
    this.enCurso++;
    let liberado = false;
    return () => {
      if (!liberado) {
        liberado = true;
        this.enCurso--;
      }
    };
  }

  /**
   * Escribe el ZIP en `res`. Si un archivo no existe o S3 no lo entrega, se
   * sigue con los demás y se anota en LEEME.txt. Si el cliente cancela, se
   * destruye el stream de S3 y se aborta el ZIP. Un fallo A MEDIO archivo
   * (la red se cae mientras se copia) no se puede "saltar" porque esos bytes
   * ya salieron: se corta la respuesta y el navegador marca la descarga
   * como fallida.
   */
  async transmitir(
    plan: PlanZip,
    res: Response,
    actor: AuthUser,
    ipAddress?: string,
  ): Promise<ResultadoZip> {
    const archive = archiver('zip', { store: true });
    const noIncluidos: ArchivoNoIncluido[] = [...plan.noDisponibles];
    let incluidos = 0;
    let actual: Readable | null = null;
    let cancelado = false;
    let falloFatal: Error | null = null;

    const cortar = () => {
      actual?.destroy();
      actual = null;
      archive.abort();
    };

    res.on('close', () => {
      if (!res.writableFinished) {
        cancelado = true;
        cortar();
      }
    });
    archive.on('warning', (err) =>
      this.logger.warn(`ZIP ${plan.postulanteId}: ${err.message}`),
    );
    archive.on('error', (err) => {
      if (cancelado || falloFatal) return;
      falloFatal = err;
      this.logger.error(`ZIP ${plan.postulanteId} abortado: ${err.message}`);
      cortar();
      res.destroy();
    });

    res.status(200);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      construirContentDisposition('attachment', plan.nombreZip),
    );
    res.setHeader('Cache-Control', 'no-store, no-transform');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Evita que un proxy intermedio acumule la respuesta antes de enviarla.
    res.setHeader('X-Accel-Buffering', 'no');
    archive.pipe(res);

    for (const entrada of plan.entradas) {
      if (cancelado || falloFatal) break;
      const stream = await this.abrir(entrada);
      if (!stream.ok) {
        noIncluidos.push({ ruta: entrada.ruta, motivo: stream.motivo });
        continue;
      }
      if (cancelado || falloFatal) {
        stream.body.destroy();
        break;
      }
      actual = stream.body;
      const r = await this.agregar(
        archive,
        stream.body,
        `${plan.carpetaRaiz}/${entrada.ruta}`,
        entrada.fecha,
      );
      actual = null;
      if (r.ok) {
        incluidos++;
      } else if (r.error && !cancelado && !falloFatal) {
        // Falló a medio archivo: esos bytes ya salieron, el ZIP no se puede
        // reparar. Se corta la respuesta (sin pasar el error a `res`, que no
        // tiene quien lo escuche) y el navegador marca la descarga fallida.
        falloFatal = r.error;
        this.logger.error(
          `ZIP ${plan.postulanteId}: falló la lectura de ${entrada.ruta} a medio camino: ${r.error.message}`,
        );
        cortar();
        res.destroy();
      }
    }

    let resultado: ResultadoZip;
    // falloFatal primero: al destruir `res` por un error también llega 'close'.
    if (falloFatal) {
      resultado = 'error';
    } else if (cancelado) {
      resultado = 'cancelado';
    } else {
      if (noIncluidos.length > 0) {
        archive.append(
          construirLeeme(plan.nombreAspirante, noIncluidos, new Date()),
          { name: `${plan.carpetaRaiz}/LEEME.txt` },
        );
      }
      resultado = await this.finalizar(archive, res);
      if (falloFatal) resultado = 'error';
      else if (cancelado) resultado = 'cancelado';
    }

    await this.auditoria.registrar({
      actorId: actor.userId,
      actorEmail: actor.email,
      accion: 'expediente_zip_descargado',
      recurso: 'Postulante',
      recursoId: plan.postulanteId,
      ipAddress,
      metadata: {
        resultado,
        archivosIncluidos: incluidos,
        archivosNoIncluidos: noIncluidos.length,
        noIncluidos: noIncluidos.map((n) => n.ruta).slice(0, 50),
        bytesEstimados: plan.bytesEstimados,
        bytesEnviados: archive.pointer(),
        nombreZip: plan.nombreZip,
      },
    });
    return resultado;
  }

  /**
   * Abre el objeto en S3. Falla rápido (404, sin permiso, tiempo agotado) sin
   * haber escrito nada al ZIP, así que se puede omitir y seguir.
   */
  private async abrir(
    entrada: EntradaZip,
  ): Promise<{ ok: true; body: Readable } | { ok: false; motivo: string }> {
    let timer: NodeJS.Timeout | undefined;
    const pendiente = this.storage.getObjectStream(entrada.url);
    const tiempo = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), this.timeoutAperturaMs);
    });
    try {
      const r = await Promise.race([pendiente, tiempo]);
      if (r === 'timeout') {
        // Si S3 contesta después, no dejar el socket colgado.
        pendiente.then((s) => s.destroy()).catch(() => undefined);
        this.logger.warn(`ZIP: tiempo agotado al abrir ${entrada.ruta}`);
        return { ok: false, motivo: MOTIVO_TIEMPO_AGOTADO };
      }
      // archiver lee la fuente con pipe(), que no reenvía errores: sin este
      // listener un error tardío de S3 sería un 'error' sin manejar (tumba el
      // proceso). El error real se atiende en agregar().
      r.on('error', () => undefined);
      return { ok: true, body: r };
    } catch (err) {
      this.logger.warn(
        `ZIP: no se pudo abrir ${entrada.ruta}: ${(err as Error).message}`,
      );
      return { ok: false, motivo: MOTIVO_NO_ENCONTRADO };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Agrega un stream y espera a que archiver lo procese (un archivo a la
   * vez, así nunca hay más de un objeto de S3 abierto). `error` viene cuando
   * la fuente falló a medio camino; sin `error` y `ok: false` es que se
   * cerró (cancelación).
   */
  private agregar(
    archive: archiver.Archiver,
    body: Readable,
    nombre: string,
    fecha?: Date,
  ): Promise<{ ok: boolean; error?: Error }> {
    return new Promise((resolve) => {
      let listo = false;
      const terminar = (r: { ok: boolean; error?: Error }) => {
        if (listo) return;
        listo = true;
        archive.off('entry', alTerminar);
        archive.off('error', alFallarArchivo);
        body.off('error', alFallarFuente);
        body.off('close', alCerrarFuente);
        resolve(r);
      };
      const alTerminar = (entry: archiver.EntryData) => {
        if (entry.name === nombre) terminar({ ok: true });
      };
      const alFallarArchivo = (err: Error) =>
        terminar({ ok: false, error: err });
      const alFallarFuente = (err: Error) =>
        terminar({ ok: false, error: err });
      // Destruida sin terminar (cancelación): no quedarse esperando.
      const alCerrarFuente = () => {
        if (!body.readableEnded) terminar({ ok: false });
      };
      archive.on('entry', alTerminar);
      archive.on('error', alFallarArchivo);
      body.on('error', alFallarFuente);
      body.on('close', alCerrarFuente);
      archive.append(body, { name: nombre, date: fecha });
    });
  }

  private finalizar(
    archive: archiver.Archiver,
    res: Response,
  ): Promise<ResultadoZip> {
    return new Promise((resolve) => {
      res.once('finish', () => resolve('completado'));
      res.once('close', () =>
        resolve(res.writableFinished ? 'completado' : 'cancelado'),
      );
      archive.finalize().catch(() => resolve('error'));
    });
  }
}
