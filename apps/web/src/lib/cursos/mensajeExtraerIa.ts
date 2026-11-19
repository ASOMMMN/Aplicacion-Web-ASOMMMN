/**
 * Mensaje para el postulante cuando falla POST /cursos/extraer-ia. En todos
 * los casos el flujo sigue a la captura manual de los datos; lo que cambia es
 * la explicación, para que un límite alcanzado no parezca un problema de red.
 */
export const MENSAJE_IA_SIN_CONEXION =
  'No se pudo conectar con el servicio de IA. Ingresa los datos manualmente.';

export const MENSAJE_IA_LIMITE =
  'Alcanzaste el límite de lecturas con IA por ahora. Espera un rato para volver a usarla; mientras tanto ingresa los datos manualmente.';

export const MENSAJE_IA_ARCHIVO_GRANDE =
  'El archivo es demasiado grande (máximo 20 MB). Ingresa los datos manualmente o sube un archivo más ligero.';

interface ErrorHttp {
  response?: { status?: number; data?: { message?: unknown } };
}

/** El `message` de la API puede ser un texto o una lista de textos (class-validator). */
function textoDeLaApi(message: unknown): string | null {
  const texto = Array.isArray(message) ? message.map(String).join(', ') : message;
  return typeof texto === 'string' && texto.trim() ? texto.trim() : null;
}

export function mensajeErrorExtraerIa(err: unknown): string {
  const respuesta = (err as ErrorHttp | null | undefined)?.response;
  const status = respuesta?.status;

  if (status === undefined) return MENSAJE_IA_SIN_CONEXION;
  if (status === 429) return MENSAJE_IA_LIMITE;
  if (status === 413) return MENSAJE_IA_ARCHIVO_GRANDE;

  // 400/415/422: la API explica qué tiene mal el archivo (por ejemplo, tipo no permitido).
  if (status === 400 || status === 415 || status === 422) {
    const detalle = textoDeLaApi(respuesta?.data?.message);
    if (detalle) return `${/[.!?]$/.test(detalle) ? detalle : `${detalle}.`} Ingresa los datos manualmente.`;
  }

  return `La lectura con IA falló (error ${status}). Ingresa los datos manualmente.`;
}
