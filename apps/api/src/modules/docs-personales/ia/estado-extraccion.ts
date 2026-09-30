/**
 * Estado de la extracción de fechas de un documento personal, visible en la
 * interfaz para diagnosticar por qué un documento no tiene fechas.
 *
 * - pendiente: nunca se analizó (p. ej. se subió antes del 25-sep-2026,
 *   cuando aún no existía la extracción automática).
 * - ok: el análisis encontró al menos una fecha.
 * - sin_fechas: se analizó y el documento no muestra fechas.
 * - error: el análisis falló o descartó todas las fechas; el motivo va en
 *   extraccionError.
 */
export const ESTADOS_EXTRACCION = [
  'pendiente',
  'ok',
  'sin_fechas',
  'error',
] as const;

export type EstadoExtraccion = (typeof ESTADOS_EXTRACCION)[number];

interface DocConEstado {
  extraccionEstado?: EstadoExtraccion | null;
  extraccionError?: string | null;
  analisisIa?: { error?: string } | null;
  fechaEmision?: Date | string | null;
  fechaInicio?: Date | string | null;
  fechaVencimiento?: Date | string | null;
}

/**
 * Estado guardado o, en documentos anteriores a este campo, deducido:
 * con fechas → ok (las puso el flujo anterior); sin fechas → pendiente.
 */
export function estadoExtraccion(doc: DocConEstado): {
  estado: EstadoExtraccion;
  error: string | null;
} {
  if (doc.extraccionEstado) {
    return {
      estado: doc.extraccionEstado,
      error:
        doc.extraccionEstado === 'error'
          ? (doc.extraccionError ??
            doc.analisisIa?.error ??
            'Error desconocido')
          : null,
    };
  }
  if (doc.analisisIa?.error) {
    return { estado: 'error', error: doc.analisisIa.error };
  }
  const conFechas = Boolean(
    doc.fechaEmision || doc.fechaInicio || doc.fechaVencimiento,
  );
  if (doc.analisisIa) {
    return { estado: conFechas ? 'ok' : 'sin_fechas', error: null };
  }
  return { estado: conFechas ? 'ok' : 'pendiente', error: null };
}
