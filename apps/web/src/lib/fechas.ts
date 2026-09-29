/**
 * Formatea una fecha de calendario (sin hora: vencimientos, inicio de curso,
 * emisión…) como DD/MM/YYYY.
 *
 * La API manda estas fechas como "2024-03-01" o "2024-03-01T00:00:00.000Z"
 * (medianoche UTC). Pasarlas por `new Date()` las convierte a la zona del
 * navegador y en México (UTC-6) se muestra el día anterior. Aquí se toma la
 * parte YYYY-MM-DD tal cual.
 *
 * No usar para timestamps con hora (creadoEn, subidasEn…): esos sí deben
 * convertirse a la hora local.
 */
export function formatearFechaCalendario(
  valor: string | null | undefined,
  vacio = '—',
): string {
  const m = valor ? /^(\d{4})-(\d{2})-(\d{2})/.exec(valor) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : vacio;
}

/**
 * Igual que formatearFechaCalendario pero con mes abreviado: "15 mar 2024".
 * Se formatea en UTC para que la fecha no se corra por la zona del navegador.
 */
export function formatearFechaCalendarioMesCorto(
  valor: string | null | undefined,
  vacio = '—',
): string {
  const m = valor ? /^(\d{4})-(\d{2})-(\d{2})/.exec(valor) : null;
  if (!m) return vacio;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
