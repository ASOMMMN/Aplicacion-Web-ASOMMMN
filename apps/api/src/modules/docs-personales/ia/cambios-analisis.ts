/**
 * Qué se guarda en un DocPersonal tras analizarlo con IA. Compartido por el
 * servicio (subida, "Volver a analizar" y análisis por lotes) y por el
 * script de reanálisis.
 *
 * Protección de datos:
 * - Una fecha existente nunca se reemplaza por null: se conserva.
 * - Si el análisis anterior es de esta misma versión de la canalización y
 *   el nuevo lee otra fecha, NO se reemplaza en silencio: se conserva la
 *   anterior, la nueva queda en `propuestaFechasIa` y se marca Revisar.
 * - Si el análisis anterior es de una versión vieja (sin
 *   `versionCanalizacion` o distinta), la nueva lo reemplaza y el cambio
 *   queda registrado en `analisisIa.reemplazo`.
 * - Las fechas verificadas por el evaluador nunca se tocan.
 */
import {
  CAMPOS_FECHA,
  CampoFecha,
  ResultadoExtraccionFechas,
  VERSION_CANALIZACION,
} from './extraer-fechas-doc-personal';
import type { EstadoExtraccion } from './estado-extraccion';
import type { PrecisionFechas } from '../schemas/doc-personal.schema';
import { claveDeValor } from './combinar-fuentes';
import { formatearConPrecision, PrecisionFecha } from './formatos-fecha';

/** Fecha nueva que el evaluador debe aceptar (no se aplicó sola). */
export interface FechaPropuesta {
  valor: Date | null;
  precision: PrecisionFecha;
  /** Valor que se conservó en el documento cuando se hizo la propuesta. */
  anterior: Date | null;
  /** Evidencia del análisis nuevo para ese campo (detalle y fuente). */
  detalle?: unknown;
  fuente?: unknown;
}

export interface PropuestaFechasIa {
  fechas: Partial<Record<CampoFecha, FechaPropuesta>>;
  motivos: string[];
  detectadaEn: Date;
  versionCanalizacion: string;
}

export interface CambioReemplazo {
  campo: CampoFecha;
  anterior: string | null;
  nueva: string | null;
}

export interface CambiosAnalisis {
  fechaEmision?: Date | null;
  fechaInicio?: Date | null;
  fechaVencimiento?: Date | null;
  precisionFechas?: PrecisionFechas;
  detalleFechasIa?: Record<string, unknown>;
  revisarFechas?: boolean;
  motivosRevision?: string[];
  tipoSospechoso?: { tipoElegido: string; tipoDetectado: string } | null;
  propuestaFechasIa?: PropuestaFechasIa | null;
  extraccionEstado: EstadoExtraccion;
  /** Motivo si extraccionEstado = 'error'; null en los demás casos. */
  extraccionError: string | null;
  analisisIa: {
    analizadoEn: Date;
    modelo: string;
    origen?: string;
    paginasLeidas?: number;
    paginasTotales?: number;
    error?: string;
    versionCanalizacion?: string;
    /** El análisis de una versión anterior se reemplazó: qué cambió. */
    reemplazo?: { versionAnterior: string | null; cambios: CambioReemplazo[] };
    /** Fechas existentes que el análisis nuevo no encontró (se conservaron). */
    conservadas?: Array<{ campo: CampoFecha; valor: string }>;
  };
}

/**
 * Evidencia que se guarda en detalleFechasIa: por fecha (literal, etiqueta,
 * confianza, precisión) y, si las hubo, la combinación con las fuentes
 * deterministas, los documentos detectados, el texto de QR/cadena, cada
 * lectura del modelo con el consenso y los datos propios de un curso.
 */
export function detalleParaGuardar(
  res: ResultadoExtraccionFechas['resultado'],
): Record<string, unknown> | undefined {
  if (!res.detalle) return undefined;
  return {
    ...res.detalle,
    ...(res.fuentes ? { fuentes: res.fuentes } : {}),
    ...(res.grupos?.length
      ? { grupos: res.grupos, principal: res.principal ?? null }
      : {}),
    ...(res.evidenciaEstructurada?.length
      ? { evidenciaEstructurada: res.evidenciaEstructurada }
      : {}),
    ...(res.lecturasIa?.length ? { lecturasIa: res.lecturasIa } : {}),
    ...(res.consenso ? { consenso: res.consenso } : {}),
    ...(res.reextraccion ? { reextraccion: res.reextraccion } : {}),
    ...(res.datosCurso ? { datosCurso: res.datosCurso } : {}),
    ...(res.tipoDetectado
      ? {
          tipoDetectado: res.tipoDetectado,
          confianzaTipo: res.confianzaTipo ?? null,
        }
      : {}),
  };
}

/** Lo que el documento ya tenía antes de este análisis. */
export interface EstadoAnterior {
  fechaEmision?: Date | string | null;
  fechaInicio?: Date | string | null;
  fechaVencimiento?: Date | string | null;
  precisionFechas?: PrecisionFechas | null;
  detalleFechasIa?: Record<string, unknown> | null;
  analisisIa?: { versionCanalizacion?: string } | null;
}

const aFecha = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00.000Z`) : null;

const aIso = (v: Date | string | null | undefined): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

const NOMBRE_CAMPO: Record<CampoFecha, string> = {
  fechaEmision: 'la emisión',
  fechaInicio: 'el inicio',
  fechaVencimiento: 'el vencimiento',
};

const mostrar = (iso: string, precision: PrecisionFecha) =>
  formatearConPrecision(iso, precision) ?? iso;

export interface OpcionesCambios {
  /**
   * El evaluador corrigió las fechas a mano (fechasVerificadas): el análisis
   * guarda su evidencia pero no toca las fechas ni la marca "Revisar".
   */
  fechasVerificadas?: boolean;
  /** Fechas y análisis que el documento ya tenía (protección de datos). */
  anterior?: EstadoAnterior;
  ahora?: Date;
}

/**
 * - Siempre registra el intento en `analisisIa` y el estado (así se
 *   distingue "nunca analizado" de "analizado con error").
 * - Si hubo error de lectura o de IA, NO toca las fechas existentes.
 * - Las fechas verificadas por el evaluador nunca se tocan aquí.
 * - Límite por minuto de OpenAI → null: no se guarda nada.
 */
export function cambiosPorAnalisis(
  r: ResultadoExtraccionFechas,
  opciones: OpcionesCambios = {},
): CambiosAnalisis | null {
  // Límite por minuto de OpenAI: no es un error del documento. No se toca
  // nada (sigue "pendiente" o con su análisis anterior) para reintentarlo.
  if (r.errorOpenAI?.tipo === 'limite_por_minuto') return null;

  const ahora = opciones.ahora ?? new Date();
  const analisisIa: CambiosAnalisis['analisisIa'] = {
    analizadoEn: ahora,
    modelo: r.modelo,
    origen: r.origen,
    paginasLeidas: r.paginasLeidas,
    paginasTotales: r.paginasTotales,
    versionCanalizacion: r.versionCanalizacion ?? VERSION_CANALIZACION,
    ...(r.resultado.errorMensaje ? { error: r.resultado.errorMensaje } : {}),
  };
  if (r.resultado.errorMensaje || !r.resultado.iaDisponible) {
    return {
      extraccionEstado: 'error',
      extraccionError:
        r.resultado.errorMensaje || 'La IA no está disponible en el servidor.',
      analisisIa,
    };
  }

  const res = r.resultado;

  const detalleNuevo = detalleParaGuardar(res);
  if (opciones.fechasVerificadas) {
    return {
      detalleFechasIa: detalleNuevo,
      tipoSospechoso: res.tipoSospechoso ?? null,
      // Las fechas vigentes son las verificadas: el documento sí tiene fechas.
      extraccionEstado: 'ok',
      extraccionError: null,
      analisisIa,
    };
  }

  // ── Fecha final por campo: nueva, conservada o propuesta ──
  const ant = opciones.anterior ?? {};
  const versionAnterior = ant.analisisIa?.versionCanalizacion ?? null;
  const hayAnterior = CAMPOS_FECHA.some((c) => aIso(ant[c]));
  const protegido = hayAnterior && versionAnterior === VERSION_CANALIZACION;

  const finales = {} as Record<
    CampoFecha,
    { iso: string | null; precision: PrecisionFecha; deAnterior: boolean }
  >;
  const propuesta: PropuestaFechasIa['fechas'] = {};
  const motivosPropuesta: string[] = [];
  const conservadas: NonNullable<CambiosAnalisis['analisisIa']['conservadas']> =
    [];
  const reemplazos: CambioReemplazo[] = [];

  for (const c of CAMPOS_FECHA) {
    const nueva = res[c] ?? null;
    const precNueva = res.detalle?.[c].precision ?? 'dia';
    const vieja = aIso(ant[c]);
    const precVieja = ant.precisionFechas?.[c] ?? 'dia';
    const iguales =
      nueva !== null &&
      vieja !== null &&
      claveDeValor(nueva, precNueva) === claveDeValor(vieja, precVieja);

    if (vieja && !nueva) {
      // Nunca se reemplaza una fecha por null.
      finales[c] = { iso: vieja, precision: precVieja, deAnterior: true };
      conservadas.push({ campo: c, valor: vieja });
      continue;
    }
    if (vieja && nueva && !iguales) {
      if (protegido) {
        finales[c] = { iso: vieja, precision: precVieja, deAnterior: true };
        propuesta[c] = {
          valor: aFecha(nueva),
          precision: precNueva,
          anterior: aFecha(vieja),
          detalle: res.detalle?.[c],
          fuente: res.fuentes?.[c],
        };
        motivosPropuesta.push(
          `El nuevo análisis leyó ${NOMBRE_CAMPO[c]} ${mostrar(nueva, precNueva)} (antes ${mostrar(vieja, precVieja)}); se conservó la anterior hasta que se confirme.`,
        );
        continue;
      }
      reemplazos.push({ campo: c, anterior: vieja, nueva });
    }
    finales[c] = { iso: nueva, precision: precNueva, deAnterior: false };
  }

  // Evidencia coherente con cada valor: la del análisis que lo produjo.
  let detalleFechasIa = detalleNuevo;
  if (detalleNuevo && CAMPOS_FECHA.some((c) => finales[c].deAnterior)) {
    const detAnt = ant.detalleFechasIa ?? {};
    const fuentesAnt = (detAnt.fuentes ?? {}) as Record<string, unknown>;
    const fuentes = {
      ...((detalleNuevo.fuentes ?? {}) as Record<string, unknown>),
    };
    detalleFechasIa = { ...detalleNuevo };
    for (const c of CAMPOS_FECHA) {
      if (!finales[c].deAnterior) continue;
      if (detAnt[c] !== undefined) detalleFechasIa[c] = detAnt[c];
      if (fuentesAnt[c] !== undefined) fuentes[c] = fuentesAnt[c];
      else delete fuentes[c];
    }
    if (detalleNuevo.fuentes) detalleFechasIa.fuentes = fuentes;
  }

  const conFechas = CAMPOS_FECHA.some((c) => finales[c].iso);
  const descartadas = res.fechasDescartadas ?? [];
  const estado: Pick<CambiosAnalisis, 'extraccionEstado' | 'extraccionError'> =
    conFechas
      ? { extraccionEstado: 'ok', extraccionError: null }
      : descartadas.length > 0
        ? {
            extraccionEstado: 'error',
            extraccionError: `Fecha descartada por validación: ${descartadas.join(' ')}`,
          }
        : { extraccionEstado: 'sin_fechas', extraccionError: null };

  const hayPropuesta = Object.keys(propuesta).length > 0;
  const motivos = [...(res.motivosRevision ?? []), ...motivosPropuesta];
  return {
    fechaEmision: aFecha(finales.fechaEmision.iso),
    fechaInicio: aFecha(finales.fechaInicio.iso),
    fechaVencimiento: aFecha(finales.fechaVencimiento.iso),
    precisionFechas: {
      fechaEmision: finales.fechaEmision.precision,
      fechaInicio: finales.fechaInicio.precision,
      fechaVencimiento: finales.fechaVencimiento.precision,
    },
    detalleFechasIa,
    revisarFechas: Boolean(res.revisar) || hayPropuesta,
    motivosRevision: motivos,
    tipoSospechoso: res.tipoSospechoso ?? null,
    // Un análisis nuevo reemplaza la propuesta anterior (o la quita).
    propuestaFechasIa: hayPropuesta
      ? {
          fechas: propuesta,
          motivos: motivosPropuesta,
          detectadaEn: ahora,
          versionCanalizacion: analisisIa.versionCanalizacion!,
        }
      : null,
    ...estado,
    analisisIa: {
      ...analisisIa,
      ...(reemplazos.length
        ? { reemplazo: { versionAnterior, cambios: reemplazos } }
        : {}),
      ...(conservadas.length ? { conservadas } : {}),
    },
  };
}

/** Propuesta tal como se expone en la API (fechas como YYYY-MM-DD). */
export interface PropuestaFechasResumen {
  fechas: Partial<
    Record<
      CampoFecha,
      {
        valor: string | null;
        precision: PrecisionFecha;
        anterior: string | null;
      }
    >
  >;
  motivos: string[];
  detectadaEn: string | null;
}

export function resumenPropuesta(
  p: PropuestaFechasIa | null | undefined,
): PropuestaFechasResumen | null {
  if (!p?.fechas || Object.keys(p.fechas).length === 0) return null;
  return {
    fechas: Object.fromEntries(
      Object.entries(p.fechas).map(([c, f]) => [
        c,
        {
          valor: aIso(f?.valor ?? null),
          precision: f?.precision ?? 'dia',
          anterior: aIso(f?.anterior ?? null),
        },
      ]),
    ),
    motivos: p.motivos ?? [],
    detectadaEn: p.detectadaEn ? new Date(p.detectadaEn).toISOString() : null,
  };
}
