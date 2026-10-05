/**
 * "Hoy" en la zona horaria de México. El servidor corre en UTC: después de
 * las 18:00 (UTC-6) `new Date().toISOString()` ya da el día siguiente.
 */

/** Zona horaria para decidir qué día es "hoy". */
export const ZONA_HORARIA_MEXICO = 'America/Mexico_City';

/** Fecha de hoy (YYYY-MM-DD) en la zona horaria indicada. */
export function hoyISO(
  ahora: Date = new Date(),
  zona = ZONA_HORARIA_MEXICO,
): string {
  // en-CA formatea como YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
}
