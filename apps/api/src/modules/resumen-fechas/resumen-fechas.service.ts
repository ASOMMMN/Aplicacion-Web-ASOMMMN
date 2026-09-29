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
  EstadoVigencia,
  hoyISO,
  ORDEN_ESTADO_VIGENCIA,
  UMBRAL_POR_VENCER_MESES,
} from './vigencia.util';

/**
 * Origen del dato:
 * - subido: curso registrado por el postulante con su documento
 * - cv: curso detectado en el CV por la IA
 * - subido_y_cv: el mismo curso aparece en ambos (prevalecen los datos subidos)
 * - doc_personal: documento personal (pasaporte, libreta de mar, etc.)
 */
export type OrigenResumen = 'subido' | 'cv' | 'subido_y_cv' | 'doc_personal';

export interface ResumenFechaItem {
  tipo: 'Curso' | 'Documento personal';
  nombre: string;
  institucion: string | null;
  fechaInicio: string | null;
  fechaVencimiento: string | null;
  origen: OrigenResumen;
  /** Calculado al responder; no se guarda en BD. */
  estadoVigencia: EstadoVigencia;
  diasParaVencer: number | null;
  fuente: string[];
}

export type ConteoVigencia = Record<EstadoVigencia, number>;

export interface ResumenFechasResponse {
  titulo: string;
  postulante: string;
  fechaGeneracion: string;
  /** Fecha (México) contra la que se calculó el semáforo. */
  fechaReferencia: string;
  umbralPorVencerMeses: number;
  conteo: ConteoVigencia;
  items: ResumenFechaItem[];
}

/** Ítem antes de calcular la vigencia. */
type ItemBase = Omit<ResumenFechaItem, 'estadoVigencia' | 'diasParaVencer'>;

const FUENTE_SUBIDO = 'Cursos registrados';
const FUENTE_CV = 'CV';
const FUENTE_DOC_PERSONAL = 'Documentos personales';

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

  /** Clave para detectar duplicados: sin acentos, extensión ni puntuación. */
  private normalizarNombre(valor: unknown): string {
    if (typeof valor !== 'string' || !valor.trim()) return '';
    return valor
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/\.(pdf|jpg|jpeg|png|doc|docx)$/i, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

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
        fechaInicio: this.normalizarFecha(c.fechaInicio ?? c.fechaCurso),
        fechaVencimiento: this.normalizarFecha(c.fechaVencimiento),
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
        fechaVencimiento: this.normalizarFecha(c.fechaVencimiento),
        origen: 'cv' as const,
        fuente: [FUENTE_CV],
      }));
  }

  private async obtenerDocumentosPersonales(
    postulanteId: string,
  ): Promise<ItemBase[]> {
    const { tipos } =
      await this.docsPersonalesService.listarPorPostulante(postulanteId);

    return tipos.flatMap((t) =>
      t.archivos.map((a) => ({
        tipo: 'Documento personal' as const,
        nombre: a.nombreOriginal,
        institucion: null,
        fechaInicio: this.normalizarFecha(a.fechaInicio ?? a.fechaEmision),
        fechaVencimiento: this.normalizarFecha(a.fechaVencimiento),
        origen: 'doc_personal' as const,
        fuente: [FUENTE_DOC_PERSONAL],
      })),
    );
  }

  // ── Unificación ───────────────────────────────────────────────────────────

  /**
   * Une cursos registrados y del CV por nombre normalizado.
   * Los datos registrados prevalecen; el CV solo completa campos vacíos.
   */
  private unificarCursos(registrados: ItemBase[], cv: ItemBase[]): ItemBase[] {
    const mapa = new Map<string, ItemBase>();

    for (const curso of registrados) {
      const clave = this.normalizarNombre(curso.nombre);
      if (clave) mapa.set(clave, { ...curso, fuente: [...curso.fuente] });
    }

    for (const curso of cv) {
      const clave = this.normalizarNombre(curso.nombre);
      if (!clave) continue;

      const existente = mapa.get(clave);
      if (!existente) {
        mapa.set(clave, { ...curso });
        continue;
      }
      if (existente.origen === 'cv') continue; // duplicado dentro del CV

      existente.institucion ??= curso.institucion;
      existente.fechaInicio ??= curso.fechaInicio;
      existente.fechaVencimiento ??= curso.fechaVencimiento;
      existente.origen = 'subido_y_cv';
      existente.fuente = [...new Set([...existente.fuente, ...curso.fuente])];
    }

    return [...mapa.values()];
  }

  /** Documentos personales duplicados (mismo nombre): se completan fechas. */
  private unificarDocumentosPersonales(documentos: ItemBase[]): ItemBase[] {
    const mapa = new Map<string, ItemBase>();
    for (const doc of documentos) {
      const clave = this.normalizarNombre(doc.nombre);
      if (!clave) continue;
      const existente = mapa.get(clave);
      if (!existente) {
        mapa.set(clave, { ...doc });
        continue;
      }
      existente.fechaInicio ??= doc.fechaInicio;
      existente.fechaVencimiento ??= doc.fechaVencimiento;
    }
    return [...mapa.values()];
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
    };

    const items: ResumenFechaItem[] = [
      ...this.unificarCursos(registrados, cv),
      ...this.unificarDocumentosPersonales(documentos),
    ].map((item) => {
      const vigencia = calcularEstadoVigencia(item.fechaVencimiento, hoy);
      conteo[vigencia.estadoVigencia]++;
      return { ...item, ...vigencia };
    });

    // Vencidos primero; luego por vencer, vigentes y sin fecha.
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
        fechaInicio: this.formatearFechaReporte(item.fechaInicio),
        fechaVencimiento: this.formatearFechaReporte(item.fechaVencimiento),
        estadoVigencia: item.estadoVigencia,
        fuente: item.fuente,
      })),
    };
  }

  private formatearFechaReporte(valor: string | null): string {
    if (!valor) return '—';
    const partes = valor.split('-');
    return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : '—';
  }
}
