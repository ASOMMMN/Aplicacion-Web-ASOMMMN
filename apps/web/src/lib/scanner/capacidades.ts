/**
 * Qué puede hacer el dispositivo, por sus capacidades y no por el ancho de
 * la pantalla: un celular en horizontal mide más que una tableta y una
 * laptop táctil sigue teniendo mouse.
 */

export interface SenalesDispositivo {
  userAgent: string;
  /** navigator.userAgentData.mobile (Chromium); undefined donde no existe (Safari, Firefox). */
  uaMobile?: boolean;
  maxTouchPoints: number;
  /** matchMedia('(pointer: fine)'): el puntero principal es mouse o trackpad. */
  punteroFino: boolean;
}

export interface CapacidadesDispositivo {
  /** Teléfono o tableta: la cámara es el camino principal. */
  movil: boolean;
  /** Pantalla táctil (aunque también tenga mouse). */
  tactil: boolean;
  /** Computadora con mouse/trackpad: subir imágenes y arrastrar son el camino principal. */
  escritorio: boolean;
}

export function clasificarDispositivo(s: SenalesDispositivo): CapacidadesDispositivo {
  // iPadOS se presenta como "Macintosh"; se delata por los puntos táctiles.
  const ipadOS = /Macintosh/.test(s.userAgent) && s.maxTouchPoints > 1;
  const uaMovil = /Android|iPhone|iPad|iPod|Mobile/i.test(s.userAgent);
  const movil = ipadOS || (s.uaMobile ?? uaMovil);
  return {
    movil,
    tactil: s.maxTouchPoints > 0,
    escritorio: !movil && s.punteroFino,
  };
}

/** Lee las señales del navegador (solo en el cliente). */
export function leerSenalesDispositivo(): SenalesDispositivo {
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  return {
    userAgent: nav.userAgent ?? '',
    uaMobile: nav.userAgentData?.mobile,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    punteroFino: typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches,
  };
}

/**
 * Número de cámaras (videoinput) del equipo, o null si el navegador no
 * permite saberlo. Antes de dar permiso las etiquetas vienen vacías, pero el
 * tipo de dispositivo sí se informa.
 */
export async function contarCamaras(): Promise<number | null> {
  if (typeof navigator === 'undefined' || typeof navigator.mediaDevices?.enumerateDevices !== 'function') {
    return null;
  }
  try {
    const dispositivos = await navigator.mediaDevices.enumerateDevices();
    return dispositivos.filter((d) => d.kind === 'videoinput').length;
  } catch {
    return null;
  }
}
