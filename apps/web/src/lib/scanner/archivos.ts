/**
 * Clasificación de los archivos que llegan al escáner (selector múltiple o
 * arrastrar y soltar). Las imágenes se convierten en páginas; un PDF ya
 * hecho no se escanea: se sube por el flujo normal ("Subir archivo").
 */

import { CONFIG_ESCANER } from './constantes';

/** `accept` del selector de imágenes. HEIC/HEIF por extensión: Windows no les da tipo MIME. */
export const ACCEPT_IMAGENES = 'image/*,.heic,.heif';

/** Lo que acepta el DropZone del escáner: los PDF pasan para poder explicar qué hacer con ellos. */
export const ACCEPT_SOLTAR = `${ACCEPT_IMAGENES},application/pdf,.pdf`;

export const MENSAJE_PDF =
  'Un PDF ya está listo: no hace falta escanearlo. Cierra el escáner y súbelo con “Subir archivo” o arrastrándolo a la tarjeta.';

export const MENSAJE_HEIC =
  'Este navegador no puede abrir fotos HEIC. Ábrela en Safari, conviértela a JPG o, en el iPhone, ' +
  'elige Ajustes → Cámara → Formatos → Más compatible.';

interface ArchivoMinimo {
  name: string;
  type: string;
  size: number;
}

export const esPdf = (f: Pick<ArchivoMinimo, 'name' | 'type'>) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

export const esHeic = (f: Pick<ArchivoMinimo, 'name' | 'type'>) => /^image\/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name);

export const esImagen = (f: Pick<ArchivoMinimo, 'name' | 'type'>) =>
  f.type.startsWith('image/') || esHeic(f) || (f.type === '' && /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(f.name));

export interface ArchivosClasificados<T extends ArchivoMinimo> {
  /** Imágenes que caben en las páginas que quedan, en el orden recibido. */
  imagenes: T[];
  /** Imágenes que no entraron por el límite de páginas. */
  sobrantes: number;
  /** Imágenes más pesadas que el límite. */
  pesadas: number;
  pdfs: number;
  otros: number;
}

export function clasificarArchivos<T extends ArchivoMinimo>(
  archivos: readonly T[],
  espacio: number,
  maxBytes = Infinity,
): ArchivosClasificados<T> {
  const imagenes: T[] = [];
  let sobrantes = 0;
  let pesadas = 0;
  let pdfs = 0;
  let otros = 0;
  for (const f of archivos) {
    if (esPdf(f)) pdfs++;
    else if (!esImagen(f)) otros++;
    else if (f.size > maxBytes) pesadas++;
    else if (imagenes.length < Math.max(0, espacio)) imagenes.push(f);
    else sobrantes++;
  }
  return { imagenes, sobrantes, pesadas, pdfs, otros };
}

/** Aviso (o null) de lo que no se agregó de un lote. */
export function avisoLote(c: Omit<ArchivosClasificados<ArchivoMinimo>, 'imagenes'>, fallidas: number, maxPaginas: number): string | null {
  const partes: string[] = [];
  if (c.sobrantes > 0) {
    partes.push(`${c.sobrantes} ${c.sobrantes === 1 ? 'imagen no se agregó' : 'imágenes no se agregaron'}: el máximo es ${maxPaginas} páginas.`);
  }
  if (c.pesadas > 0) {
    partes.push(`${c.pesadas} ${c.pesadas === 1 ? 'imagen pesa' : 'imágenes pesan'} demasiado (máximo ${Math.round(CONFIG_ESCANER.maxBytesImagen / (1024 * 1024))} MB por imagen).`);
  }
  if (fallidas > 0) {
    partes.push(`${fallidas} ${fallidas === 1 ? 'imagen no se pudo leer' : 'imágenes no se pudieron leer'} (usa JPG, PNG o WEBP).`);
  }
  if (c.pdfs > 0) partes.push(MENSAJE_PDF);
  if (c.otros > 0) partes.push(`${c.otros} ${c.otros === 1 ? 'archivo no es una imagen' : 'archivos no son imágenes'}.`);
  return partes.length > 0 ? partes.join(' ') : null;
}
