/**
 * Qué se guarda en un DocPersonal tras analizarlo con IA. Compartido por el
 * servicio (subida, "Volver a analizar" y análisis por lotes).
 */
import type { ResultadoExtraccionFechas } from './extraer-fechas-doc-personal';
import type { EstadoExtraccion } from './estado-extraccion';
import type { PrecisionFechas } from '../schemas/doc-personal.schema';

export interface CambiosAnalisis {
  fechaEmision?: Date | null;
  fechaInicio?: Date | null;
  fechaVencimiento?: Date | null;
  precisionFechas?: PrecisionFechas;
  detalleFechasIa?: Record<string, unknown>;
  revisarFechas?: boolean;
  motivosRevision?: string[];
  tipoSospechoso?: { tipoElegido: string; tipoDetectado: string } | null;
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

  const analisisIa = {
    analizadoEn: opciones.ahora ?? new Date(),
    modelo: r.modelo,
    origen: r.origen,
    paginasLeidas: r.paginasLeidas,
    paginasTotales: r.paginasTotales,
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
  const conFechas = Boolean(
    res.fechaEmision || res.fechaInicio || res.fechaVencimiento,
  );
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

  // Evidencia por fecha y, si hubo lecturas deterministas, la combinación:
  // fuentes[campo], todos los documentos detectados y el texto de QR/cadena.
  const detalleFechasIa = res.detalle
    ? ({
        ...res.detalle,
        ...(res.fuentes ? { fuentes: res.fuentes } : {}),
        ...(res.grupos?.length
          ? { grupos: res.grupos, principal: res.principal ?? null }
          : {}),
        ...(res.evidenciaEstructurada?.length
          ? { evidenciaEstructurada: res.evidenciaEstructurada }
          : {}),
      } as Record<string, unknown>)
    : undefined;
  if (opciones.fechasVerificadas) {
    return {
      detalleFechasIa,
      tipoSospechoso: res.tipoSospechoso ?? null,
      // Las fechas vigentes son las verificadas: el documento sí tiene fechas.
      extraccionEstado: 'ok',
      extraccionError: null,
      analisisIa,
    };
  }

  return {
    fechaEmision: aFecha(res.fechaEmision),
    fechaInicio: aFecha(res.fechaInicio),
    fechaVencimiento: aFecha(res.fechaVencimiento),
    precisionFechas: {
      fechaEmision: res.detalle?.fechaEmision.precision ?? 'dia',
      fechaInicio: res.detalle?.fechaInicio.precision ?? 'dia',
      fechaVencimiento: res.detalle?.fechaVencimiento.precision ?? 'dia',
    },
    detalleFechasIa,
    revisarFechas: Boolean(res.revisar),
    motivosRevision: res.motivosRevision ?? [],
    tipoSospechoso: res.tipoSospechoso ?? null,
    ...estado,
    analisisIa,
  };
}
