import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  Tab,
  TabStopPosition,
  TabStopType,
  TextRun,
} from 'docx';
import PDFDocument from 'pdfkit';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { ExtraccionIaService } from '../docs-personales/extraccion-ia.service';
import {
  CAMPOS_FECHA,
  MIMES_EXTRACCION_IA,
  ResultadoExtraccionFechas,
} from '../docs-personales/ia/extraer-fechas-doc-personal';
import { detalleParaGuardar } from '../docs-personales/ia/cambios-analisis';
import type { EstadoExtraccion } from '../docs-personales/ia/estado-extraccion';
import { formatearConPrecision } from '../docs-personales/ia/formatos-fecha';
import {
  aConfianzaNumerica,
  CambioFecha,
  CAMPOS_META,
  CampoMeta,
  MetaFechas,
} from '../docs-personales/ia/meta-fechas';
import {
  metaFechasCurso,
  resumenMetaFechas,
} from '../docs-personales/ia/meta-fechas-derivadas';
import {
  origenVencimientoDeCurso,
  OrigenVencimiento,
  resolverVencimientoCurso,
} from './regla-vencimiento-curso';
import { Curso, CursoDocument } from './schemas/curso.schema';
import {
  Postulante,
  PostulanteDocument,
} from '../postulantes/schemas/postulante.schema';
import { Usuario, UsuarioDocument } from '../usuarios/schemas/usuario.schema';
import { StorageService } from '../storage/storage.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { CreateCursoDto } from './dto/create-curso.dto';
import {
  CursoItemResponseDto,
  CursosListResponseDto,
  ExtraerIaResponseDto,
} from './dto/curso-response.dto';
import { construirCarpetaPorNombre } from '../../common/utils/storage-folder.util';
import {
  calcularEstadoVigencia,
  hoyISO,
} from '../resumen-fechas/vigencia.util';

const CURSOS_CATEGORY = 'cursos';
/** PDF e imágenes (fotos o escaneos): los lee la misma canalización que los documentos personales. */
const ALLOWED_EXTRA_MIME = ['application/pdf', 'image/jpeg', 'image/png'];

const aFecha = (iso: string | null | undefined) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00.000Z`) : undefined;
const aIso = (d: Date | string | null | undefined) =>
  d ? new Date(d).toISOString().slice(0, 10) : null;
const NOMBRE_CAMPO_CURSO = {
  fechaEmision: 'La emisión',
  fechaInicio: 'El inicio',
  fechaVencimiento: 'El vencimiento',
} as const;

@Injectable()
export class CursosService {
  private readonly logger = new Logger(CursosService.name);

  constructor(
    @InjectModel(Curso.name)
    private readonly cursoModel: Model<CursoDocument>,
    @InjectModel(Postulante.name)
    private readonly postulanteModel: Model<PostulanteDocument>,
    @InjectModel(Usuario.name)
    private readonly usuarioModel: Model<UsuarioDocument>,
    private readonly storageService: StorageService,
    private readonly auditoriaService: AuditoriaService,
    private readonly configService: ConfigService,
    private readonly extraccionIa: ExtraccionIaService,
  ) {}

  async crearCurso(
    userId: string,
    dto: CreateCursoDto,
    file?: Express.Multer.File,
  ): Promise<{ message: string; cursoId: string }> {
    try {
      const postulante = await this.getPostulanteByUserId(userId);

      if (!dto.apareceEnCV && !file) {
        throw new BadRequestException(
          'Si el curso no aparece en el CV, debes subir documento extra.',
        );
      }

      let documentoExtra: Curso['documentoExtra'];
      if (file) {
        this.validarDocumentoExtra(file);
        const usuario = await this.usuarioModel
          .findById(userId)
          .select('nombre apellidos')
          .lean();
        const carpeta =
          construirCarpetaPorNombre(usuario?.nombre, usuario?.apellidos) ??
          userId;
        const key = `${carpeta}/${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;

        const { url, key: s3Key } = await this.storageService.putObject(
          CURSOS_CATEGORY,
          key,
          file.buffer,
        );

        documentoExtra = {
          storagePath: `${CURSOS_CATEGORY}/${key}`,
          cloudinaryUrl: url,
          cloudinaryPublicId: s3Key,
          storageType: 'cloudinary',
          nombreOriginal: file.originalname,
          tipoMime: file.mimetype,
          tamanio: file.size,
          subidoEn: new Date(),
        };
      }

      const fechaInicio = dto.fechaInicio?.slice(0, 10) ?? null;
      const fechaEmision = dto.fechaEmision?.slice(0, 10) ?? null;
      const capturado = dto.fechaVencimiento?.slice(0, 10) ?? null;

      // El documento se lee con la misma canalización (y caché) que la vista
      // previa: el mismo archivo da las mismas fechas.
      const analisis =
        file && MIMES_EXTRACCION_IA.includes(file.mimetype)
          ? await this.extraccionIa
              .extraer({
                buffer: file.buffer,
                mimeType: file.mimetype,
                tipo: 'curso',
                usarCache: true,
                reextraer: false,
              })
              .catch((err: Error) => {
                this.logger.error(
                  `No se pudo analizar el documento del curso: ${err.message}`,
                );
                return null;
              })
          : null;

      // Regla de vencimiento: solo cursos registrados con documento.
      let fechaVencimiento: string | null = capturado;
      let origenVencimiento: OrigenVencimiento | undefined;
      if (documentoExtra) {
        const regla = resolverVencimientoCurso({
          fechaInicio,
          fechaEmision,
          fechaVencimientoDocumento: capturado,
          nombreCurso: dto.nombreCurso,
        });
        fechaVencimiento = regla.fechaVencimiento;
        origenVencimiento = regla.origen;
      }

      const revision = this.revisionCurso(analisis, {
        fechaInicio,
        fechaEmision,
        fechaVencimiento: capturado,
        origenVencimiento,
      });

      // fechaCurso (compatibilidad): inicio, emisión u hoy en México.
      const fechaCurso = aFecha(
        dto.fechaCurso?.slice(0, 10) ?? fechaInicio ?? fechaEmision ?? hoyISO(),
      );
      if (!fechaCurso || Number.isNaN(fechaCurso.getTime())) {
        throw new BadRequestException('Fecha de curso inválida.');
      }

      const curso = await this.cursoModel.create({
        postulanteId: postulante._id,
        usuarioId: new Types.ObjectId(userId),
        nombreCurso: dto.nombreCurso.trim(),
        institucion: dto.institucion?.trim() || undefined,
        fechaCurso,
        fechaInicio: aFecha(fechaInicio),
        fechaEmision: aFecha(fechaEmision),
        fechaVencimiento: aFecha(fechaVencimiento),
        fechaVencimientoEstimada: origenVencimiento === 'CALCULADO_5_ANOS',
        origenVencimiento,
        apareceEnCV: dto.apareceEnCV,
        documentoExtra,
        ...revision,
        ...this.metaRegistroCurso(userId, analisis, {
          fechaInicio,
          fechaEmision,
          fechaVencimiento,
          estimado: origenVencimiento === 'CALCULADO_5_ANOS',
        }),
      });

      return {
        message: 'Curso/certificación registrado correctamente.',
        cursoId: curso._id.toString(),
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Error al registrar curso/certificación: ${msg}`);
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      throw new BadRequestException(
        'Error al subir el certificado. Verifica el archivo e inténtalo de nuevo.',
      );
    }
  }

  async listarMisCursos(userId: string): Promise<CursosListResponseDto> {
    const postulante = await this.getPostulanteByUserId(userId);
    const usuario = await this.usuarioModel.findById(userId).lean();

    const cursos = await this.cursoModel
      .find({ postulanteId: postulante._id })
      .sort({ fechaCurso: -1, creadoEn: -1 })
      .lean();

    const hoy = hoyISO(); // México, igual que /resumen-fechas
    const mapped = await Promise.all(
      cursos.map(async (curso) => {
        let documentoExtra:
          | {
              nombreOriginal: string;
              tamanio: number;
              tipoMime: string;
              urlDescargar?: string;
              storageType: 'local' | 'cloudinary';
            }
          | undefined;
        if (curso.documentoExtra?.storagePath) {
          const esCloudinary =
            curso.documentoExtra.storageType === 'cloudinary' &&
            curso.documentoExtra.cloudinaryUrl;
          documentoExtra = {
            nombreOriginal: curso.documentoExtra.nombreOriginal,
            tamanio: curso.documentoExtra.tamanio,
            tipoMime: curso.documentoExtra.tipoMime,
            urlDescargar: esCloudinary
              ? await this.storageService.getSecureDownloadUrl(
                  curso.documentoExtra.cloudinaryUrl!,
                  curso.documentoExtra.nombreOriginal,
                  curso.documentoExtra.tipoMime,
                )
              : undefined,
            storageType: esCloudinary ? 'cloudinary' : 'local',
          };
        }

        return this.mapearCurso(curso, documentoExtra, hoy);
      }),
    );

    return {
      postulante: {
        id: postulante._id.toString(),
        nombreCompleto:
          `${usuario?.nombre ?? ''} ${usuario?.apellidos ?? ''}`.trim(),
        email: usuario?.email ?? '',
      },
      cursos: mapped,
      total: mapped.length,
    };
  }

  async listarCursosPorPostulante(
    postulanteId: string,
  ): Promise<CursosListResponseDto> {
    const postulante = await this.postulanteModel.findById(postulanteId).lean();
    if (!postulante) throw new NotFoundException('Postulante no encontrado.');

    const usuario = await this.usuarioModel
      .findById(postulante.usuarioId)
      .lean();
    const cursos = await this.cursoModel
      .find({ postulanteId: new Types.ObjectId(postulanteId) })
      .sort({ fechaCurso: -1, creadoEn: -1 })
      .lean();

    const hoy = hoyISO(); // México, igual que /resumen-fechas
    const mapped = await Promise.all(
      cursos.map(async (curso) => {
        let documentoExtra:
          | {
              nombreOriginal: string;
              tamanio: number;
              tipoMime: string;
              urlDescargar?: string;
              storageType: 'local' | 'cloudinary';
            }
          | undefined;
        if (curso.documentoExtra?.storagePath) {
          const esCloudinary =
            curso.documentoExtra.storageType === 'cloudinary' &&
            curso.documentoExtra.cloudinaryUrl;
          documentoExtra = {
            nombreOriginal: curso.documentoExtra.nombreOriginal,
            tamanio: curso.documentoExtra.tamanio,
            tipoMime: curso.documentoExtra.tipoMime,
            urlDescargar: esCloudinary
              ? await this.storageService.getSecureDownloadUrl(
                  curso.documentoExtra.cloudinaryUrl!,
                  curso.documentoExtra.nombreOriginal,
                  curso.documentoExtra.tipoMime,
                )
              : undefined,
            storageType: esCloudinary ? 'cloudinary' : 'local',
          };
        }

        return this.mapearCurso(curso, documentoExtra, hoy);
      }),
    );

    return {
      postulante: {
        id: postulanteId,
        nombreCompleto:
          `${usuario?.nombre ?? ''} ${usuario?.apellidos ?? ''}`.trim(),
        email: usuario?.email ?? '',
      },
      cursos: mapped,
      total: mapped.length,
    };
  }

  async eliminarCurso(
    userId: string,
    cursoId: string,
  ): Promise<{ message: string }> {
    const curso = await this.cursoModel.findById(cursoId);
    if (!curso)
      throw new NotFoundException('Curso/certificación no encontrado.');

    if (curso.usuarioId.toString() !== userId) {
      throw new BadRequestException(
        'No puedes eliminar cursos de otro usuario.',
      );
    }

    if (
      curso.documentoExtra?.storageType === 'cloudinary' &&
      curso.documentoExtra.cloudinaryPublicId
    ) {
      await this.storageService.removeObject(
        curso.documentoExtra.cloudinaryPublicId,
      );
    }

    await this.cursoModel.deleteOne({ _id: curso._id });

    return { message: 'Curso/certificación eliminado.' };
  }

  async renombrarCurso(
    userId: string,
    cursoId: string,
    nombreCurso: string,
    actorEmail: string,
  ): Promise<{ message: string }> {
    const curso = await this.cursoModel.findById(cursoId);
    if (!curso)
      throw new NotFoundException('Curso/certificación no encontrado.');
    if (curso.usuarioId.toString() !== userId) {
      throw new BadRequestException(
        'No puedes modificar cursos de otro usuario.',
      );
    }

    const anterior = curso.nombreCurso;
    curso.nombreCurso = nombreCurso.trim();
    await curso.save();

    await this.auditoriaService.registrar({
      actorId: userId,
      actorEmail,
      accion: 'curso_renombrar',
      recurso: 'Curso',
      recursoId: cursoId,
      metadata: { anterior, nuevo: curso.nombreCurso },
    });

    return { message: 'Nombre actualizado.' };
  }

  /**
   * Propuesta para el formulario (no guarda nada): misma canalización que
   * los documentos personales con el tipo "curso" (visión, escaneos e
   * imágenes, regla dd/mm, validación, doble lectura y caché). Incluye el
   * vencimiento que se guardaría: el del documento o el estimado a 5 años.
   */
  async extraerDatosCursoIa(
    fileBuffer: Buffer,
    mimeType: string,
    userId: string,
    actorEmail: string,
  ): Promise<ExtraerIaResponseDto> {
    const vacio: ExtraerIaResponseDto = {
      nombreCurso: null,
      institucion: null,
      fechaInicio: null,
      fechaEmision: null,
      fechaVencimiento: null,
      fechaFinCurso: null,
      confianza: {
        nombreCurso: 'baja',
        fechaInicio: 'baja',
        fechaVencimiento: 'baja',
        fechaEmision: 'baja',
      },
      iaDisponible: true,
    };
    if (!MIMES_EXTRACCION_IA.includes(mimeType)) {
      return {
        ...vacio,
        errorMensaje: 'Formato no compatible. Sube un PDF, JPG o PNG.',
      };
    }

    const r = await this.extraccionIa.extraer({
      buffer: fileBuffer,
      mimeType,
      tipo: 'curso',
      usarCache: true,
      reextraer: false,
    });
    const res = r.resultado;
    if (res.errorMensaje || !res.iaDisponible) {
      return {
        ...vacio,
        iaDisponible: res.iaDisponible,
        errorMensaje: res.errorMensaje ?? 'IA no disponible.',
      };
    }

    const curso = res.datosCurso;
    const regla = resolverVencimientoCurso({
      fechaInicio: res.fechaInicio,
      fechaEmision: res.fechaEmision,
      fechaVencimientoDocumento: res.fechaVencimiento,
      nombreCurso: curso?.nombreCurso,
    });

    await this.auditoriaService.registrar({
      actorId: userId,
      actorEmail,
      accion: 'curso_extraccion_ia',
      recurso: 'Curso',
      recursoId: 'extraer-ia',
      metadata: {
        modelo: r.modelo,
        desdeCache: Boolean(r.desdeCache),
        nombreExtraido: curso?.nombreCurso ?? null,
        fechaInicioExtraida: res.fechaInicio,
        fechaEmisionExtraida: res.fechaEmision,
        fechaVencimientoExtraida: res.fechaVencimiento,
        vencimientoPropuesto: regla,
        motivosRevision: res.motivosRevision,
      },
    });

    return {
      nombreCurso: curso?.nombreCurso ?? null,
      institucion: curso?.institucion ?? null,
      fechaInicio: res.fechaInicio,
      fechaEmision: res.fechaEmision,
      // Solo el del documento: el estimado va aparte, en vencimientoPropuesto.
      fechaVencimiento: res.fechaVencimiento,
      fechaFinCurso: curso?.fechaFinCurso.valor ?? null,
      precision: {
        fechaInicio: res.detalle?.fechaInicio.precision ?? 'dia',
        fechaEmision: res.detalle?.fechaEmision.precision ?? 'dia',
        fechaVencimiento: res.detalle?.fechaVencimiento.precision ?? 'dia',
      },
      confianza: {
        nombreCurso: curso?.nombreCurso ? 'media' : 'baja',
        fechaInicio: res.confianza.fechaInicio,
        fechaEmision: res.confianza.fechaEmision,
        fechaVencimiento: res.confianza.fechaVencimiento,
      },
      vencimientoPropuesto: {
        fecha: regla.fechaVencimiento,
        origen: regla.origen,
        base: regla.base,
      },
      revisar: Boolean(res.revisar),
      motivosRevision: res.motivosRevision ?? [],
      iaDisponible: true,
    };
  }

  /**
   * Evidencia y marca de revisión de un curso: lo que leyó la IA frente a
   * lo que registró el postulante. Nunca cambia las fechas registradas.
   */
  private revisionCurso(
    analisis: ResultadoExtraccionFechas | null,
    registrado: {
      fechaInicio: string | null;
      fechaEmision: string | null;
      fechaVencimiento: string | null;
      origenVencimiento?: OrigenVencimiento;
    },
  ): Pick<
    Curso,
    | 'detalleFechasIa'
    | 'confianza'
    | 'extraccionEstado'
    | 'revisarFechas'
    | 'motivosRevision'
  > {
    const motivos: string[] = [];
    if (registrado.origenVencimiento === 'REQUIERE_REVISION') {
      motivos.push(
        'Sin fecha de inicio ni de emisión: no se puede estimar el vencimiento.',
      );
    }
    if (!analisis) {
      return {
        revisarFechas: motivos.length > 0,
        motivosRevision: motivos,
      };
    }
    const res = analisis.resultado;
    if (res.errorMensaje || !res.iaDisponible) {
      return {
        extraccionEstado: 'error',
        revisarFechas: motivos.length > 0,
        motivosRevision: motivos,
      };
    }

    const precision = (c: (typeof CAMPOS_FECHA)[number]) =>
      res.detalle?.[c].precision ?? 'dia';
    const mostrar = (iso: string, c: (typeof CAMPOS_FECHA)[number]) =>
      formatearConPrecision(iso, precision(c)) ?? iso;
    for (const c of CAMPOS_FECHA) {
      const leida = res[c];
      const capturada = registrado[c];
      if (c === 'fechaVencimiento' && !leida && capturada) {
        motivos.push(
          `El documento no muestra vencimiento; el postulante capturó ${formatearConPrecision(capturada) ?? capturada}.`,
        );
      } else if (leida && capturada && leida !== capturada) {
        motivos.push(
          `${NOMBRE_CAMPO_CURSO[c]} registrado (${formatearConPrecision(capturada) ?? capturada}) no coincide con el documento (${mostrar(leida, c)}).`,
        );
      }
    }
    motivos.push(...(res.motivosRevision ?? []));

    const conFechas = CAMPOS_FECHA.some((c) => res[c]);
    const estado: EstadoExtraccion = conFechas ? 'ok' : 'sin_fechas';
    return {
      detalleFechasIa: detalleParaGuardar(res),
      confianza: {
        nombreCurso: res.datosCurso?.nombreCurso ? 'media' : 'baja',
        fechaEmision: res.confianza.fechaEmision,
        fechaInicio: res.confianza.fechaInicio,
        fechaVencimiento: res.confianza.fechaVencimiento,
      },
      extraccionEstado: estado,
      revisarFechas: motivos.length > 0,
      motivosRevision: [...new Set(motivos)],
    };
  }

  /**
   * Metadatos e historial de las fechas al registrar un curso: regla para
   * el vencimiento estimado (5 años), ia si coincide con lo leído en el
   * documento y manual si lo capturó el postulante.
   */
  private metaRegistroCurso(
    userId: string,
    analisis: ResultadoExtraccionFechas | null,
    fechas: Record<CampoMeta, string | null> & { estimado: boolean },
  ): { metaFechas: MetaFechas; historialFechas: CambioFecha[] } {
    const res =
      analisis && !analisis.resultado.errorMensaje ? analisis.resultado : null;
    const ahora = new Date();
    const metaFechas: MetaFechas = {};
    const historialFechas: CambioFecha[] = [];
    for (const c of CAMPOS_META) {
      const valor = fechas[c];
      if (!valor) continue;
      const leida = res?.[c] ?? null;
      const fuente =
        c === 'fechaVencimiento' && fechas.estimado
          ? 'regla'
          : leida === valor
            ? 'ia'
            : 'manual';
      const precision =
        fuente === 'ia' ? (res?.detalle?.[c].precision ?? 'dia') : 'dia';
      metaFechas[c] = {
        fuente,
        precision,
        bloqueada: false,
        ...(fuente === 'ia'
          ? {
              confianza: aConfianzaNumerica(res?.confianza[c]),
              evidencia: res?.detalle?.[c].textoLiteral ?? null,
              lector: res?.fuentes?.[c]?.fuente ?? 'ia',
            }
          : {}),
        ...(fuente === 'manual'
          ? { editadoPor: new Types.ObjectId(userId), editadoEn: ahora }
          : {}),
      };
      historialFechas.push({
        campo: c,
        anterior: null,
        nuevo: { valor, precision },
        fuente,
        motivo:
          fuente === 'regla'
            ? 'Registro del curso: vencimiento estimado (5 años)'
            : 'Registro del curso',
        por: new Types.ObjectId(userId),
        en: ahora,
      });
    }
    return { metaFechas, historialFechas };
  }

  /** Un curso tal como lo devuelve la API (mismo cálculo de vigencia que /resumen-fechas). */
  private mapearCurso(
    curso: Curso & { _id: Types.ObjectId },
    documentoExtra: CursoItemResponseDto['documentoExtra'],
    hoy: string,
  ): CursoItemResponseDto {
    const iso = (d?: Date | null) =>
      d ? new Date(d).toISOString() : undefined;
    return {
      _id: curso._id.toString(),
      nombreCurso: curso.nombreCurso,
      institucion: curso.institucion,
      fechaCurso: new Date(curso.fechaCurso).toISOString(),
      fechaInicio: iso(curso.fechaInicio),
      fechaEmision: iso(curso.fechaEmision),
      fechaVencimiento: iso(curso.fechaVencimiento),
      fechaVencimientoEstimada: Boolean(curso.fechaVencimientoEstimada),
      origenVencimiento: origenVencimientoDeCurso(curso),
      ...calcularEstadoVigencia(aIso(curso.fechaVencimiento), hoy),
      apareceEnCV: Boolean(curso.apareceEnCV),
      tieneDocumentoExtra: Boolean(curso.documentoExtra),
      documentoExtra,
      confianza: curso.confianza,
      extraccionEstado: curso.extraccionEstado,
      revisarFechas: Boolean(curso.revisarFechas),
      motivosRevision: curso.motivosRevision ?? [],
      metaFechas: resumenMetaFechas(metaFechasCurso(curso)),
      creadoEn: new Date(curso.creadoEn).toISOString(),
    };
  }

  async exportarResumenCSV(
    userId: string,
  ): Promise<{ filename: string; csv: string }> {
    const data = await this.listarMisCursos(userId);
    return this.construirResumenCSV(data);
  }

  async exportarResumenTXT(
    userId: string,
  ): Promise<{ filename: string; txt: string }> {
    const data = await this.listarMisCursos(userId);
    return this.construirResumenTXT(data);
  }

  async exportarResumenCSVPorPostulante(
    postulanteId: string,
  ): Promise<{ filename: string; csv: string }> {
    const data = await this.listarCursosPorPostulante(postulanteId);
    return this.construirResumenCSV(data);
  }

  async exportarResumenTXTPorPostulante(
    postulanteId: string,
  ): Promise<{ filename: string; txt: string }> {
    const data = await this.listarCursosPorPostulante(postulanteId);
    return this.construirResumenTXT(data);
  }

  private construirResumenCSV(data: CursosListResponseDto): {
    filename: string;
    csv: string;
  } {
    const escapeCsv = (val: string) =>
      `"${String(val ?? '').replace(/"/g, '""')}"`;
    const headers = ['Nombre del postulante', 'Curso', 'Fecha'].join(',');
    const rows = data.cursos.map((curso) =>
      [
        data.postulante.nombreCompleto,
        curso.nombreCurso,
        curso.fechaCurso.slice(0, 10),
      ]
        .map(escapeCsv)
        .join(','),
    );
    return {
      filename: `resumen-cursos-${this.normalizarNombreArchivo(data.postulante.nombreCompleto)}.csv`,
      csv: [headers, ...rows].join('\n'),
    };
  }

  /**
   * Lee el escudo de la Asociación desde apps/web/public (carpeta estática
   * compartida del monorepo) para incluirlo en el membrete del PDF/DOCX.
   * Devuelve null si el archivo no está disponible, para no romper la
   * generación del documento en ese caso.
   */
  private leerEscudoAsociacion(): Buffer | null {
    const rutaEscudo = join(
      process.cwd(),
      '..',
      'web',
      'public',
      'escudo-ASOMMMN-transparente.png',
    );
    if (!existsSync(rutaEscudo)) {
      this.logger.warn(
        `No se encontró el escudo de la asociación en ${rutaEscudo}`,
      );
      return null;
    }
    return readFileSync(rutaEscudo);
  }

  private construirResumenTXT(data: CursosListResponseDto): {
    filename: string;
    txt: string;
  } {
    const lineasCursos =
      data.cursos.length === 0
        ? ['Sin cursos registrados.']
        : data.cursos.map(
            (curso) =>
              `${curso.fechaCurso.slice(0, 10)} - ${curso.nombreCurso}`,
          );
    return {
      filename: `resumen-cursos-${this.normalizarNombreArchivo(data.postulante.nombreCompleto)}.txt`,
      txt: [data.postulante.nombreCompleto, ...lineasCursos].join('\n'),
    };
  }

  async exportarResumenDocPorPostulante(
    postulanteId: string,
    formato: 'docx' | 'pdf',
  ): Promise<{ filename: string; buffer: Buffer; mimeType: string }> {
    const data = await this.listarCursosPorPostulante(postulanteId);
    const slug = this.normalizarNombreArchivo(data.postulante.nombreCompleto);
    if (formato === 'docx') {
      const buffer = await this.construirResumenDOCX(data);
      return {
        filename: `resumen-cursos-${slug}.docx`,
        buffer,
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
    }
    const buffer = await this.construirResumenPDF(data);
    return {
      filename: `resumen-cursos-${slug}.pdf`,
      buffer,
      mimeType: 'application/pdf',
    };
  }

  private async construirResumenDOCX(
    data: CursosListResponseDto,
  ): Promise<Buffer> {
    const escudo = this.leerEscudoAsociacion();
    const ESCUDO_SIZE_DOCX = 70;

    const parrafos: Paragraph[] = [
      ...(escudo
        ? [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 120 },
              children: [
                new ImageRun({
                  type: 'png',
                  data: escudo,
                  transformation: {
                    width: ESCUDO_SIZE_DOCX,
                    height: ESCUDO_SIZE_DOCX,
                  },
                }),
              ],
            }),
          ]
        : []),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: 'Asociación Sindical de Oficiales de Máquinas de la Marina Mercante Nacional',
            bold: true,
            size: 30,
            font: 'Times New Roman',
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [new TextRun({ text: '', italics: true, size: 24 })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: 'REGISTRO No. 13 SECRETARIA DEL TRABAJO Y PREVISION SOCIAL',
            size: 18,
            font: 'Times New Roman',
          }),
        ],
      }),
      new Paragraph({
        tabStops: [
          {
            type: TabStopType.RIGHT,
            position: TabStopPosition.MAX,
          },
        ],
        spacing: { after: 160 },
        children: [
          new TextRun({
            text: 'F.T.I.T.M',
            size: 18,
            font: 'Times New Roman',
          }),
          new TextRun({ children: [new Tab()] }),
          new TextRun({
            text: 'I.T.F',
            size: 18,
            font: 'Times New Roman',
          }),
        ],
      }),
      new Paragraph({
        border: {
          bottom: {
            color: 'C9A24B',
            size: 12,
            style: BorderStyle.SINGLE,
          },
        },
        spacing: { before: 80, after: 220 },
      }),
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: data.postulante.nombreCompleto,
            bold: true,
            size: 28,
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 240 },
        children: [
          new TextRun({
            text: 'Constancia de Cursos y Certificaciones',
            size: 24,
          }),
        ],
      }),
    ];

    if (data.cursos.length === 0) {
      parrafos.push(new Paragraph({ text: 'Sin cursos registrados.' }));
    } else {
      data.cursos.forEach((curso) => {
        const fechaInicio = this.formatearFechaResumen(
          curso.fechaInicio ?? curso.fechaCurso,
        );
        const fechaVencimiento = curso.fechaVencimiento
          ? this.formatearFechaResumen(curso.fechaVencimiento)
          : 'No especificada';

        parrafos.push(
          new Paragraph({
            spacing: { after: curso.institucion ? 40 : 80 },
            children: [
              new TextRun({ text: curso.nombreCurso, bold: true, size: 22 }),
            ],
          }),
        );
        if (curso.institucion) {
          parrafos.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: curso.institucion,
                  size: 18,
                  color: '666666',
                }),
              ],
            }),
          );
        }
        parrafos.push(
          new Paragraph({
            spacing: { after: 180 },
            children: [
              new TextRun({ text: `Inicio: ${fechaInicio}`, size: 20 }),
              new TextRun({ text: '    ', size: 20 }),
              new TextRun({ text: `Vence: ${fechaVencimiento}`, size: 20 }),
            ],
          }),
        );
      });
    }

    const doc = new Document({ sections: [{ children: parrafos }] });
    return Packer.toBuffer(doc);
  }

  private construirResumenPDF(data: CursosListResponseDto): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));

      const escudo = this.leerEscudoAsociacion();
      const ESCUDO_SIZE_PDF = 70;
      if (escudo) {
        const escudoX = (doc.page.width - ESCUDO_SIZE_PDF) / 2;
        doc.image(escudo, escudoX, doc.y, {
          width: ESCUDO_SIZE_PDF,
          height: ESCUDO_SIZE_PDF,
        });
        doc.y += ESCUDO_SIZE_PDF + 10;
      }

      doc
        .font('Times-Bold')
        .fontSize(18)
        .text(
          'Asociación Sindical de Oficiales de Máquinas de la Marina Mercante Nacional',
          { align: 'center' },
        );
      doc.moveDown(0.3);
      doc.font('Times-Italic').fontSize(14).text('', { align: 'center' });
      doc.moveDown(0.25);
      doc
        .font('Times-Roman')
        .fontSize(9)
        .text('REGISTRO No. 13 SECRETARIA DEL TRABAJO Y PREVISION SOCIAL', {
          align: 'center',
        });
      doc.moveDown(0.35);
      const siglasY = doc.y;
      doc.font('Times-Roman').fontSize(9);
      doc.text('F.T.I.T.M', 50, siglasY, { align: 'left' });
      doc.text('I.T.F', 50, siglasY, { align: 'right' });
      doc.y = siglasY + 18;
      doc
        .moveTo(50, doc.y)
        .lineTo(doc.page.width - 50, doc.y)
        .lineWidth(1.5)
        .strokeColor('#C9A24B')
        .stroke()
        .strokeColor('#000000');
      doc.moveDown(1);
      doc
        .font('Helvetica-Bold')
        .fontSize(14)
        .text(data.postulante.nombreCompleto);
      doc.moveDown(0.25);
      doc
        .font('Helvetica')
        .fontSize(12)
        .text('Constancia de Cursos y Certificaciones');
      doc.moveDown(0.8);

      if (data.cursos.length === 0) {
        doc.font('Helvetica').fontSize(11).text('Sin cursos registrados.');
      } else {
        data.cursos.forEach((curso) => {
          const fechaInicio = this.formatearFechaResumen(
            curso.fechaInicio ?? curso.fechaCurso,
          );
          const fechaVencimiento = curso.fechaVencimiento
            ? this.formatearFechaResumen(curso.fechaVencimiento)
            : 'No especificada';

          doc
            .font('Helvetica-Bold')
            .fontSize(11)
            .text(curso.nombreCurso, { continued: false });
          if (curso.institucion) {
            doc
              .font('Helvetica')
              .fontSize(10)
              .fillColor('#666666')
              .text(curso.institucion)
              .fillColor('#000000');
          }
          doc
            .font('Helvetica')
            .fontSize(10)
            .text(`Inicio: ${fechaInicio}    Vence: ${fechaVencimiento}`);
          doc.moveDown(0.3);
        });
      }

      doc.end();
    });
  }

  private formatearFechaResumen(fecha: string): string {
    const [fechaIso] = fecha.split('T');
    const [anio, mes, dia] = fechaIso.split('-');
    if (!anio || !mes || !dia) return fecha;
    return `${dia}/${mes}/${anio}`;
  }

  private normalizarNombreArchivo(nombreCompleto: string): string {
    return (
      nombreCompleto
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, '_') || 'postulante'
    );
  }

  private async getPostulanteByUserId(
    userId: string,
  ): Promise<PostulanteDocument> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Usuario autenticado inválido.');
    }
    const objectId = new Types.ObjectId(userId);
    const postulante = await this.postulanteModel.findOne({
      usuarioId: objectId,
    });
    if (postulante) return postulante;

    this.logger.warn(
      `Perfil de postulante no encontrado para usuario ${userId}. Creando perfil automático.`,
    );

    return this.postulanteModel.create({
      usuarioId: objectId,
      estadoPostulacion: 'en_proceso',
      creadoEn: new Date(),
      actualizadoEn: new Date(),
    });
  }

  private validarDocumentoExtra(file: Express.Multer.File): void {
    if (!ALLOWED_EXTRA_MIME.includes(file.mimetype)) {
      throw new BadRequestException(
        'Documento extra inválido. Sube un PDF, JPG o PNG.',
      );
    }
  }
}
