/**
 * Detecta vencimientos que el sistema calculaba como fechaInicio + 5 años
 * (regla eliminada; ver scripts/marcar-vencimientos-estimados.ts).
 *
 * El cálculo original hacía `new Date(inicio).setFullYear(+5)` en el
 * servidor (Render, UTC), así que se reproduce en UTC. No se usa la zona
 * horaria de quien corre el script: en México daría falsos positivos
 * (p. ej. 2024-03-01 → 2029-03-02).
 */

const ANIOS_REGLA = 5;

function aFecha(valor: Date | string): Date | null {
  const d = valor instanceof Date ? new Date(valor.getTime()) : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

const diaISO = (d: Date) => d.toISOString().slice(0, 10);

export function esVencimientoInicioMasCincoAnios(
  fechaInicio: Date | string | null | undefined,
  fechaVencimiento: Date | string | null | undefined,
): boolean {
  if (!fechaInicio || !fechaVencimiento) return false;
  const inicio = aFecha(fechaInicio);
  const venc = aFecha(fechaVencimiento);
  if (!inicio || !venc) return false;

  const esperado = new Date(inicio.getTime());
  esperado.setUTCFullYear(esperado.getUTCFullYear() + ANIOS_REGLA);
  return diaISO(venc) === diaISO(esperado);
}
