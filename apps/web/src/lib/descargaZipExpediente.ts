/**
 * Lógica del botón "Descargar todo (ZIP)" del expediente, sin React ni DOM
 * global para poder probarla en Node. La descarga es autenticada (axios con
 * el Bearer en la cabecera, nunca en la URL) y se guarda con blob +
 * <a download>, que funciona igual en Chrome, Edge, Firefox, Safari
 * (macOS/iOS/iPadOS) y Android sin APIs exclusivas de un navegador.
 */

const MB = 1024 * 1024;

/** A partir de aquí el ZIP vive entero en la memoria del navegador: conviene la descarga directa. */
export const UMBRAL_AVISO_BYTES = 150 * MB;

export const MENSAJES_ZIP = {
  sinDocumentos: 'El aspirante todavía no tiene documentos para descargar.',
  sinConexion:
    'Se perdió la conexión mientras se preparaba la descarga. Revisa tu conexión e inténtalo de nuevo.',
  sinPermiso: 'No tienes permiso para descargar los documentos de este aspirante.',
  respuestaInvalida:
    'El servidor no devolvió un archivo ZIP válido. Inténtalo de nuevo.',
  generico: 'No se pudo preparar la descarga. Inténtalo de nuevo.',
} as const;

interface ArchivoConUrl {
  tamanio?: number;
  urlDescargar?: string;
}

/**
 * Cuenta los archivos que irán en el ZIP con la misma regla que la API: solo
 * los que tienen archivo disponible (`urlDescargar`). Los pendientes por
 * subir o de almacenamiento anterior no cuentan.
 */
export function resumirArchivosExpediente(fuentes: {
  docsPersonales?: { archivos: ArchivoConUrl[] }[] | null;
  cursos?: { documentoExtra?: ArchivoConUrl | null }[] | null;
  cv?: ArchivoConUrl | null;
}): { total: number; bytes: number } {
  const archivos: ArchivoConUrl[] = [
    ...(fuentes.docsPersonales ?? []).flatMap((t) => t.archivos ?? []),
    ...(fuentes.cursos ?? []).flatMap((c) => (c.documentoExtra ? [c.documentoExtra] : [])),
    ...(fuentes.cv ? [fuentes.cv] : []),
  ].filter((a) => Boolean(a.urlDescargar));
  return {
    total: archivos.length,
    bytes: archivos.reduce((s, a) => s + (Number(a.tamanio) || 0), 0),
  };
}

export function formatearMB(bytes: number): string {
  return `${(bytes / MB).toFixed(bytes < 10 * MB ? 1 : 0)} MB`;
}

/**
 * Nombre del archivo desde Content-Disposition (prefiere `filename*` UTF-8).
 * Se limpia de rutas y caracteres raros; si no hay cabecera, `respaldo`.
 */
export function nombreDesdeContentDisposition(
  cabecera: string | null | undefined,
  respaldo: string,
): string {
  let nombre = '';
  if (cabecera) {
    const extendido = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(cabecera);
    const simple = /filename\s*=\s*"([^"]*)"|filename\s*=\s*([^;]+)/i.exec(cabecera);
    try {
      nombre = extendido ? decodeURIComponent(extendido[1].trim()) : '';
    } catch {
      nombre = '';
    }
    if (!nombre && simple) nombre = (simple[1] ?? simple[2] ?? '').trim();
  }
  const limpio = (nombre.split(/[\\/]/).pop() ?? '')
    .replace(/[:*?"<>|\u0000-\u001f]+/g, '_')
    .replace(/^\.+/, '')
    .trim();
  return limpio || respaldo;
}

/** Nombre de respaldo (si el navegador no deja leer la cabecera): mismo formato que la API. */
export function nombreZipRespaldo(apellidos: string, nombre: string, hoy = new Date()): string {
  const base =
    `${apellidos} ${nombre}`
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase() || 'ASPIRANTE';
  const y = hoy.getFullYear();
  const m = String(hoy.getMonth() + 1).padStart(2, '0');
  const d = String(hoy.getDate()).padStart(2, '0');
  return `Documentos_${base}_${y}${m}${d}.zip`;
}

interface ErrorHttp {
  response?: { status?: number; data?: unknown };
  message?: string;
}

/** Lee `{ message }` de la respuesta de error, que con responseType 'blob' llega como Blob. */
async function mensajeDelServidor(data: unknown): Promise<string | null> {
  let cuerpo: unknown = data;
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try {
      cuerpo = JSON.parse(await data.text());
    } catch {
      return null;
    }
  }
  const mensaje = (cuerpo as { message?: unknown } | null)?.message;
  if (typeof mensaje === 'string' && mensaje.trim()) return mensaje;
  if (Array.isArray(mensaje) && mensaje.length) return mensaje.map(String).join(', ');
  return null;
}

/** Mensaje en español para cualquier fallo de la descarga. */
export async function mensajeErrorDescargaZip(err: unknown): Promise<string> {
  const e = (err ?? {}) as ErrorHttp;
  if (!e.response) {
    return e instanceof Error && e.message === MENSAJES_ZIP.respuestaInvalida
      ? MENSAJES_ZIP.respuestaInvalida
      : MENSAJES_ZIP.sinConexion;
  }
  const status = e.response.status ?? 0;
  if (status === 401 || status === 403) return MENSAJES_ZIP.sinPermiso;
  return (await mensajeDelServidor(e.response.data)) ?? MENSAJES_ZIP.generico;
}

/** Lo mínimo del DOM que usa `guardarBlobComoArchivo` (inyectable en pruebas). */
export interface EntornoDescarga {
  document: Pick<Document, 'createElement' | 'body'>;
  URL: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>;
  setTimeout: (fn: () => void, ms: number) => unknown;
}

/**
 * Guarda el blob con <a download>. El enlace se inserta en el documento
 * (Firefox lo exige) y la URL del blob se revoca después: revocarla en el
 * mismo tick cancela la descarga en Safari (iOS/macOS) y en algunos Android.
 */
export function guardarBlobComoArchivo(
  blob: Blob,
  nombre: string,
  entorno: EntornoDescarga = {
    document,
    URL,
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  },
): void {
  const url = entorno.URL.createObjectURL(blob);
  const enlace = entorno.document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.rel = 'noopener';
  enlace.style.display = 'none';
  entorno.document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  entorno.setTimeout(() => entorno.URL.revokeObjectURL(url), 60_000);
}

export interface RespuestaZip {
  blob: Blob;
  contentType?: string | null;
  contentDisposition?: string | null;
}

/**
 * Pide el ZIP y lo guarda. Devuelve `null` si salió bien o el mensaje de
 * error en español si no. Si la respuesta no es un ZIP (p. ej. un HTML de
 * error de un proxy) no se guarda nada.
 */
export async function ejecutarDescargaZip(opciones: {
  obtener: () => Promise<RespuestaZip>;
  nombreRespaldo: string;
  guardar?: (blob: Blob, nombre: string) => void;
}): Promise<string | null> {
  const guardar = opciones.guardar ?? guardarBlobComoArchivo;
  try {
    const r = await opciones.obtener();
    if (!/zip/i.test(r.contentType ?? r.blob.type ?? '') || r.blob.size === 0) {
      throw new Error(MENSAJES_ZIP.respuestaInvalida);
    }
    guardar(r.blob, nombreDesdeContentDisposition(r.contentDisposition, opciones.nombreRespaldo));
    return null;
  } catch (err) {
    return mensajeErrorDescargaZip(err);
  }
}
