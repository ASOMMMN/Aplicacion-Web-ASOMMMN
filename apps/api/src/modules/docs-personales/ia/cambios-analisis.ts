/**
 * Qué se guarda en un DocPersonal tras analizarlo con IA. Compartido por el
 * servicio (subida, "Volver a analizar" y análisis por lotes).
 */
import type { ResultadoExtraccionFechas } from './extraer-fechas-doc-personal';

export interface CambiosAnalisis {
  fechaEmision?: Date | null;
  fechaInicio?: Date | null;
  fechaVencimiento?: Date | null;
  detalleFechasIa?: Record<string, unknown>;
  revisarFechas?: boolean;
  motivosRevision?: string[];
  tipoSospechoso?: { tipoElegido: string; tipoDetectado: string } | null;
  analisisIa: {
    analizadoEn: Date;
    modelo: string;
    origen?: string;
    paginasLeidas?: number;
    paginasTotales?: number;
    error?: string;
  };
}

const aFecha = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00.000Z`) : null;

export interface OpcionesCambios {
  /**
   * El evaluador corrigió las fechas a mano (fechasVerificadas): el análisis
   * guarda su evidencia pero no toca las fechas ni la marca "Revisar".
   */
  fechasVerificadas?: boolean;
  ahora?: Date;
}

/**
 * - Siempre registra el intento en `analisisIa` (así se distingue "nunca
 *   analizado" de "analizado con error").
 * - Si hubo error de lectura o de IA, NO toca las fechas existentes.
 * - Las fechas verificadas por el evaluador nunca se tocan aquí.
 */
export function cambiosPorAnalisis(
  r: ResultadoExtraccionFechas,
  opciones: OpcionesCambios = {},
): CambiosAnalisis {
  const analisisIa = {
    analizadoEn: opciones.ahora ?? new Date(),
    modelo: r.modelo,
    origen: r.origen,
    paginasLeidas: r.paginasLeidas,
    paginasTotales: r.paginasTotales,
    ...(r.resultado.errorMensaje ? { error: r.resultado.errorMensaje } : {}),
  };
  if (r.resultado.errorMensaje || !r.resultado.iaDisponible) {
    return { analisisIa };
  }

  const res = r.resultado;
  const detalleFechasIa = res.detalle
    ? (res.detalle as unknown as Record<string, unknown>)
    : undefined;
  if (opciones.fechasVerificadas) {
    return {
      detalleFechasIa,
      tipoSospechoso: res.tipoSospechoso ?? null,
      analisisIa,
    };
  }

  return {
    fechaEmision: aFecha(res.fechaEmision),
    fechaInicio: aFecha(res.fechaInicio),
    fechaVencimiento: aFecha(res.fechaVencimiento),
    detalleFechasIa,
    revisarFechas: Boolean(res.revisar),
    motivosRevision: res.motivosRevision ?? [],
    tipoSospechoso: res.tipoSospechoso ?? null,
    analisisIa,
  };
}
