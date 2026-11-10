import type { NotificacionAppItem } from '@/lib/api/notificaciones';

/** Lógica pura de la campanita (sin React), para probarla en Node. */

export const INTERVALO_REFRESCO_MS = 60_000;
export const LIMITE_AVISOS_CAMPANA = 20;

export const MENSAJES_CAMPANA = {
  titulo: 'Notificaciones',
  cargando: 'Cargando notificaciones…',
  vacio: 'Sin notificaciones por ahora.',
  errorCarga: 'No se pudieron cargar las notificaciones. Revisa tu conexión.',
  errorMarcarTodas: 'No se pudieron marcar como leídas. Inténtalo de nuevo.',
  reintentar: 'Reintentar',
  marcarTodas: 'Marcar todas como leídas',
  seccionCandidatos: 'Candidatos',
  seccionVencimientos: 'Vencimientos de cursos',
} as const;

export type EstadoAvisos = { items: NotificacionAppItem[]; noLeidas: number };

export function marcarAvisoLeido(estado: EstadoAvisos, id: string): EstadoAvisos {
  const objetivo = estado.items.find((n) => n._id === id);
  if (!objetivo || objetivo.leida) return estado;
  return {
    items: estado.items.map((n) => (n._id === id ? { ...n, leida: true } : n)),
    noLeidas: Math.max(0, estado.noLeidas - 1),
  };
}

export function marcarTodosAvisosLeidos(estado: EstadoAvisos): EstadoAvisos {
  return {
    items: estado.items.map((n) => (n.leida ? n : { ...n, leida: true })),
    noLeidas: 0,
  };
}

/** Texto de la insignia: nada si no hay, "99+" si pasa de 99. */
export function textoContador(noLeidas: number): string | null {
  if (!Number.isFinite(noLeidas) || noLeidas <= 0) return null;
  return noLeidas > 99 ? '99+' : String(Math.floor(noLeidas));
}

/** Enlace al candidato armado en el cliente (no se confía en un href del server). */
export function enlaceCandidato(aviso: Pick<NotificacionAppItem, 'candidatoId'>): string {
  return `/candidato/${encodeURIComponent(aviso.candidatoId)}`;
}

/** "hace un momento", "hace 5 min", "hace 3 h", "ayer", "hace 4 días" o "3 nov 2026". */
export function fechaRelativa(iso: string, ahora: Date = new Date()): string {
  const fecha = new Date(iso);
  const ms = ahora.getTime() - fecha.getTime();
  if (!Number.isFinite(ms)) return '';
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return 'ayer';
  if (dias < 7) return `hace ${dias} días`;
  return fecha.toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Mexico_City',
  });
}

/** Fecha completa para el title/tooltip. */
export function fechaCompleta(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';
  return fecha.toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Mexico_City',
  });
}

/**
 * Al tocar un aviso: lo marca como leído (si no lo estaba) y navega al
 * candidato. Si marcar falla, navega igual; el contador se corrige en el
 * siguiente refresco.
 */
export async function abrirAviso(
  aviso: NotificacionAppItem,
  deps: {
    marcarLeida: (id: string) => Promise<unknown>;
    alMarcar: (id: string) => void;
    navegar: (href: string) => void;
  },
): Promise<void> {
  if (!aviso.leida) {
    deps.alMarcar(aviso._id);
    try {
      await deps.marcarLeida(aviso._id);
    } catch {
      /* se reintenta en el siguiente refresco */
    }
  }
  deps.navegar(enlaceCandidato(aviso));
}
