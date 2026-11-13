import type {
  GrupoNotificacionesApp,
  NotificacionAppItem,
  ParametrosListarNotificacionesApp,
  TipoNotificacionApp,
} from '@/lib/api/notificaciones';
import { hoyMexicoISO } from '@/lib/fechas';

/** Lógica pura de la campanita (sin React), para probarla en Node. */

export const INTERVALO_REFRESCO_MS = 60_000;
export const LIMITE_AVISOS_CAMPANA = 20;
/** Grupos (tipo + día) que muestra la campanita; el resto, en /notificaciones. */
export const LIMITE_GRUPOS_CAMPANA = 8;
/** Grupos por página en /notificaciones. */
export const LIMITE_GRUPOS_PAGINA = 10;
/** Avisos por página al ver el detalle completo de un grupo. */
export const LIMITE_DETALLE_PAGINA = 50;
export const RUTA_NOTIFICACIONES = '/notificaciones';

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
  pestanaTodas: 'Todas',
  pestanaNoLeidas: 'No leídas',
  vacioNoLeidas: 'No tienes avisos sin leer.',
  verTodas: 'Ver todas',
  revisarExpediente: 'Revisar expediente',
  marcarLeida: 'Marcar leída',
  marcarGrupo: 'Marcar grupo como leído',
  verDetalleGrupo: 'Ver los',
  errorMarcar: 'No se pudo marcar como leída. Inténtalo de nuevo.',
  historialTitulo: 'Historial de notificaciones',
  quitarFiltro: 'Ver todo el historial',
  anterior: 'Anterior',
  siguiente: 'Siguiente',
} as const;

export type Pestana = 'todas' | 'no_leidas';

export const PESTANAS: { valor: Pestana; etiqueta: string }[] = [
  { valor: 'todas', etiqueta: MENSAJES_CAMPANA.pestanaTodas },
  { valor: 'no_leidas', etiqueta: MENSAJES_CAMPANA.pestanaNoLeidas },
];

export const ICONO_AVISO: Record<TipoNotificacionApp, string> = {
  nuevo_candidato: 'bi-person-plus',
  expediente_completo: 'bi-folder-check',
  documento_subido: 'bi-file-earmark-arrow-up',
  expediente_evaluado: 'bi-clipboard-check',
  candidato_inactivo: 'bi-hourglass-split',
};

/** Nombre de cada tipo para el filtro del historial. */
export const ETIQUETA_TIPO: Record<TipoNotificacionApp, string> = {
  nuevo_candidato: 'Postulantes nuevos',
  expediente_completo: 'Expedientes completos',
  documento_subido: 'Documentos subidos',
  expediente_evaluado: 'Expedientes evaluados',
  candidato_inactivo: 'Candidatos inactivos',
};

const TIPOS_VALIDOS = new Set<string>(Object.keys(ICONO_AVISO));
const PATRON_DIA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Filtro de un grupo leído de la URL (?tipo=&dia=); descarta lo inválido. */
export function filtroDesdeUrl(params: {
  get: (k: string) => string | null;
}): { tipo?: TipoNotificacionApp; dia?: string } {
  const tipo = params.get('tipo');
  const dia = params.get('dia');
  return {
    tipo: tipo && TIPOS_VALIDOS.has(tipo) ? (tipo as TipoNotificacionApp) : undefined,
    dia: dia && PATRON_DIA.test(dia) ? dia : undefined,
  };
}

/** Enlace al detalle completo de un grupo en /notificaciones. */
export function enlaceDetalleGrupo(g: Pick<GrupoNotificacionesApp, 'tipo' | 'dia'>): string {
  const q = new URLSearchParams({ tipo: g.tipo, dia: g.dia });
  return `${RUTA_NOTIFICACIONES}?${q.toString()}`;
}

/**
 * Parámetros de GET /notificaciones/mias: agrupado por día salvo cuando se ve
 * el detalle de un grupo (tipo + día), que es una lista plana paginada.
 */
export function parametrosListado(opciones: {
  pestana: Pestana;
  pagina?: number;
  limite: number;
  tipo?: TipoNotificacionApp;
  dia?: string;
}): ParametrosListarNotificacionesApp {
  const detalle = Boolean(opciones.tipo || opciones.dia);
  return {
    pagina: Math.max(1, Math.floor(opciones.pagina ?? 1)),
    limite: opciones.limite,
    soloNoLeidas: opciones.pestana === 'no_leidas' || undefined,
    tipo: opciones.tipo,
    dia: opciones.dia,
    agrupar: detalle ? undefined : 'dia',
  };
}

export function totalPaginas(total: number, limite: number): number {
  if (!Number.isFinite(total) || total <= 0 || limite <= 0) return 1;
  return Math.ceil(total / limite);
}

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** Encabezado de un día del historial: "Hoy", "Ayer", "Martes 3 de noviembre". */
export function tituloDia(dia: string, ahora: Date = new Date()): string {
  const hoy = hoyMexicoISO(ahora);
  if (dia === hoy) return 'Hoy';
  const [a, m, d] = dia.split('-').map(Number);
  const [ha, hm, hd] = hoy.split('-').map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d));
  const ayer = new Date(Date.UTC(ha, hm - 1, hd - 1));
  if (fecha.getTime() === ayer.getTime()) return 'Ayer';
  const texto = `${DIAS_SEMANA[fecha.getUTCDay()]} ${d} de ${MESES[m - 1]}${a === ha ? '' : ` de ${a}`}`;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Grupos de la API (ya ordenados) juntos bajo su día, en el mismo orden. */
export function agruparPorDia(
  grupos: GrupoNotificacionesApp[],
): { dia: string; grupos: GrupoNotificacionesApp[] }[] {
  const dias: { dia: string; grupos: GrupoNotificacionesApp[] }[] = [];
  for (const g of grupos) {
    const ultimo = dias[dias.length - 1];
    if (ultimo && ultimo.dia === g.dia) ultimo.grupos.push(g);
    else dias.push({ dia: g.dia, grupos: [g] });
  }
  return dias;
}

export type EstadoGrupos = { grupos: GrupoNotificacionesApp[]; noLeidas: number };

/** Marca un aviso (dentro de su grupo) como leído y baja los contadores una vez. */
export function marcarAvisoEnGrupos(estado: EstadoGrupos, id: string): EstadoGrupos {
  let cambio = false;
  const grupos = estado.grupos.map((g) => {
    const objetivo = g.items.find((n) => n._id === id);
    if (!objetivo || objetivo.leida) return g;
    cambio = true;
    return {
      ...g,
      noLeidas: Math.max(0, g.noLeidas - 1),
      items: g.items.map((n) => (n._id === id ? { ...n, leida: true } : n)),
    };
  });
  if (!cambio) return estado;
  return { grupos, noLeidas: Math.max(0, estado.noLeidas - 1) };
}

/** Marca todo un grupo; el contador total baja por las no leídas del grupo. */
export function marcarGrupoLeido(estado: EstadoGrupos, clave: string): EstadoGrupos {
  const grupo = estado.grupos.find((g) => g.clave === clave);
  if (!grupo || grupo.noLeidas === 0) return estado;
  return {
    grupos: estado.grupos.map((g) =>
      g.clave === clave
        ? { ...g, noLeidas: 0, items: g.items.map((n) => (n.leida ? n : { ...n, leida: true })) }
        : g,
    ),
    noLeidas: Math.max(0, estado.noLeidas - grupo.noLeidas),
  };
}

export function marcarTodosEnGrupos(estado: EstadoGrupos): EstadoGrupos {
  return {
    grupos: estado.grupos.map((g) => ({
      ...g,
      noLeidas: 0,
      items: g.items.map((n) => (n.leida ? n : { ...n, leida: true })),
    })),
    noLeidas: 0,
  };
}


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
