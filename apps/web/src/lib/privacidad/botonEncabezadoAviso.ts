import { ROLE_HOME } from '@/lib/auth/roleHome';

/**
 * Qué botón muestra el encabezado de /aviso-de-privacidad.
 *
 * - Sin sesión: ninguno (el aviso se lee y listo).
 * - Con sesión y llegando desde otra página de la plataforma: "Volver".
 * - Con sesión y llegando directo (p. ej. pestaña nueva): "Ir a mi panel",
 *   al inicio de su rol.
 *
 * "Con sesión" se decide con la cookie user_role, que ya usa el proxy. Solo
 * elige qué texto mostrar: no autoriza nada. El panel al que lleva vuelve a
 * comprobar la sesión (proxy y API) como cualquier otra página.
 */
export type BotonAviso =
  | { tipo: 'ninguno' }
  | { tipo: 'volver' }
  | { tipo: 'panel'; href: string };

export interface ContextoNavegacion {
  /** Valor de la cookie user_role, o null si no hay. */
  rol: string | null;
  /** window.history.length */
  historial: number;
  /** document.referrer ('' si no hay) */
  referrer: string;
  /** window.location.origin */
  origen: string;
  /** Ruta del documento cargado al abrir la pestaña (sin navegación interna). */
  rutaInicial: string;
  /** window.location.pathname */
  rutaActual: string;
}

/**
 * true si se llegó desde otra página de la plataforma y hay a dónde volver:
 * - navegación interna sin recargar (Next cambia de ruta sin cargar otro
 *   documento, así que document.referrer no cambia: se compara la ruta del
 *   documento inicial con la actual), o
 * - carga completa con un referrer del mismo origen.
 * En ambos casos hace falta historial (history.length > 1) para router.back().
 */
function llegoDesdeLaPlataforma(c: ContextoNavegacion): boolean {
  if (c.historial <= 1) return false;
  if (c.rutaInicial !== c.rutaActual) return true;
  if (!c.referrer) return false;
  try {
    return new URL(c.referrer).origin === c.origen;
  } catch {
    return false;
  }
}

export function decidirBotonAviso(c: ContextoNavegacion): BotonAviso {
  const inicio = c.rol ? ROLE_HOME[c.rol] : undefined;
  if (!inicio) return { tipo: 'ninguno' };
  if (llegoDesdeLaPlataforma(c)) return { tipo: 'volver' };
  return { tipo: 'panel', href: inicio };
}

function leerCookie(nombre: string): string | null {
  const par = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${nombre}=`));
  return par ? decodeURIComponent(par.slice(nombre.length + 1)) || null : null;
}

/** Lee el contexto en el navegador. No llama a la API. */
export function leerContextoNavegacion(): ContextoNavegacion {
  const nav = performance.getEntriesByType('navigation')[0] as
    | PerformanceNavigationTiming
    | undefined;
  let rutaInicial = window.location.pathname;
  try {
    if (nav?.name) rutaInicial = new URL(nav.name).pathname;
  } catch {
    // Sin entrada de navegación válida: se trata como carga directa.
  }
  return {
    rol: leerCookie('user_role'),
    historial: window.history.length,
    referrer: document.referrer,
    origen: window.location.origin,
    rutaInicial,
    rutaActual: window.location.pathname,
  };
}
