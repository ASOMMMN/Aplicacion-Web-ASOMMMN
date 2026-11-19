/**
 * Cámara en vivo del escáner (getUserMedia). Si no hay contexto seguro
 * (HTTPS o localhost), no hay mediaDevices o el usuario niega el permiso,
 * el escáner usa <input capture="environment">, que abre la app de cámara
 * del sistema y no necesita el permiso del sitio.
 */

/** Cámara trasera; `ideal` (no `exact`) para que un equipo sin ella o una webcam también sirvan. */
export const RESTRICCIONES_CAMARA: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 2560 },
    height: { ideal: 1440 },
  },
};

/** Restricciones mínimas para reintentar si el equipo rechaza las anteriores (OverconstrainedError). */
export const RESTRICCIONES_CAMARA_MINIMAS: MediaStreamConstraints = {
  audio: false,
  video: { facingMode: 'environment' },
};

/**
 * - denegado: el usuario (o el navegador) negó el permiso de cámara.
 * - sin-camara: el equipo no tiene cámara utilizable.
 * - ocupada: otra app la está usando o el sistema no la pudo abrir.
 * - detenida: la transmisión se cortó (p. ej. al salir de la pestaña en iOS).
 * - desconocido: cualquier otro error.
 */
export type TipoFallaCamara = 'denegado' | 'sin-camara' | 'ocupada' | 'detenida' | 'desconocido';

export interface FallaCamara {
  tipo: TipoFallaCamara;
  mensaje: string;
  /** true si tiene sentido volver a intentarlo con la cámara en vivo. */
  reintentable: boolean;
  /** true si en esta sesión del escáner ya no conviene ofrecer la cámara en vivo. */
  permanente: boolean;
}

/** true si el navegador puede abrir la cámara en vivo (HTTPS/localhost y getUserMedia). */
export function camaraEnVivoDisponible(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext === true &&
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}

const MENSAJES: Record<TipoFallaCamara, string> = {
  denegado:
    'No hay permiso para usar la cámara en esta página. Puedes tomar la foto con la app de cámara del teléfono, ' +
    'o permitir el acceso y reintentar: en Safari toca “aA” → Configuración del sitio web → Cámara → Permitir; ' +
    'en Chrome toca el ícono junto a la dirección → Permisos → Cámara.',
  'sin-camara': 'No encontramos una cámara disponible en este equipo. Elige una foto de la galería.',
  ocupada: 'La cámara está en uso por otra app o no se pudo abrir. Ciérrala e intenta de nuevo.',
  detenida: 'La cámara se detuvo. Toca “Reintentar” para volver a abrirla.',
  desconocido: 'No se pudo abrir la cámara. Intenta de nuevo o usa la app de cámara del teléfono.',
};

/** En computadora: webcam y "sube imágenes" en lugar de la app de cámara del teléfono. */
const MENSAJES_ESCRITORIO: Record<TipoFallaCamara, string> = {
  denegado:
    'No hay permiso para usar la webcam. Permítelo desde el ícono junto a la dirección del navegador ' +
    '(Permisos → Cámara) y toca “Reintentar”, o sube imágenes del documento.',
  'sin-camara': 'No encontramos una webcam conectada. Sube imágenes del documento.',
  ocupada: 'La webcam está en uso por otra app (por ejemplo, una videollamada) o no se pudo abrir. Ciérrala e intenta de nuevo.',
  detenida: 'La webcam se detuvo. Toca “Reintentar” para volver a abrirla.',
  desconocido: 'No se pudo abrir la webcam. Intenta de nuevo o sube imágenes del documento.',
};

/** Traduce un error de getUserMedia (o de la transmisión) a una falla con mensaje en español. */
export function clasificarErrorCamara(err: unknown, contexto: { escritorio?: boolean } = {}): FallaCamara {
  const nombre =
    typeof err === 'string'
      ? err
      : err && typeof err === 'object' && 'name' in err
        ? String((err as { name: unknown }).name)
        : '';
  let tipo: TipoFallaCamara;
  switch (nombre) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      tipo = 'denegado';
      break;
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      tipo = 'sin-camara';
      break;
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      tipo = 'ocupada';
      break;
    case 'detenida':
      tipo = 'detenida';
      break;
    default:
      tipo = 'desconocido';
  }
  return {
    tipo,
    mensaje: (contexto.escritorio ? MENSAJES_ESCRITORIO : MENSAJES)[tipo],
    reintentable: tipo !== 'sin-camara',
    permanente: tipo === 'denegado' || tipo === 'sin-camara',
  };
}

/** Lado largo del fotograma capturado sin pasar de `ladoMax`. */
export function dimensionesCaptura(ancho: number, alto: number, ladoMax: number): { ancho: number; alto: number } {
  const f = Math.min(1, ladoMax / Math.max(ancho, alto));
  return { ancho: Math.max(1, Math.round(ancho * f)), alto: Math.max(1, Math.round(alto * f)) };
}
