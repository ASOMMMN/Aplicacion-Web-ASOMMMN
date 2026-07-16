import type { DuracionEmbarque, TiempoTotalMar } from './types';

export function formatFechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDuracion(d: DuracionEmbarque): string {
  const partes: string[] = [];
  if (d.anios > 0) partes.push(`${d.anios} ${d.anios === 1 ? 'año' : 'años'}`);
  if (d.meses > 0) partes.push(`${d.meses} ${d.meses === 1 ? 'mes' : 'meses'}`);
  if (partes.length === 0) {
    partes.push(`${d.dias} ${d.dias === 1 ? 'día' : 'días'}`);
  }
  return partes.join(' ');
}

export function formatTiempoTotal(t: TiempoTotalMar): string {
  if (t.anios === 0 && t.meses === 0) return 'Sin tiempo de mar registrado';
  const partes: string[] = [];
  if (t.anios > 0) partes.push(`${t.anios} ${t.anios === 1 ? 'año' : 'años'}`);
  if (t.meses > 0) partes.push(`${t.meses} ${t.meses === 1 ? 'mes' : 'meses'}`);
  return partes.join(' ');
}
