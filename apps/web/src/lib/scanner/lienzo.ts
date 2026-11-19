/**
 * Operaciones con canvas en el hilo principal: decodificar la foto (con su
 * orientación EXIF) y codificar JPEG. Cada canvas se encoge a 0×0 al
 * terminar: Safari iOS libera su memoria solo así.
 */

import { dimensionesCaptura } from './camara';

export class ErrorImagen extends Error {}

function lienzo(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new ErrorImagen('El navegador no permite procesar imágenes.');
  return { canvas, ctx };
}

function soltar(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

/**
 * Decodifica la foto y la reduce para que su lado largo no pase de
 * `ladoMax`, sin crear nunca un canvas a resolución completa (iOS limita
 * el área de un canvas; una foto de 24–48 MP no cabe).
 *
 * Se usa <img> y no createImageBitmap porque <img> aplica la orientación
 * EXIF de forma consistente en Safari iOS y Chrome Android.
 */
export async function decodificarFoto(archivo: Blob, ladoMax: number): Promise<ImageData> {
  const url = URL.createObjectURL(archivo);
  const img = new Image();
  try {
    img.decoding = 'async';
    img.src = url;
    try {
      await img.decode();
    } catch {
      throw new ErrorImagen('No se pudo leer la imagen. Usa una foto JPG o PNG.');
    }
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) throw new ErrorImagen('La imagen está vacía.');
    const f = Math.min(1, ladoMax / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * f));
    const ch = Math.max(1, Math.round(h * f));
    const { canvas, ctx } = lienzo(cw, ch);
    try {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, cw, ch);
      return ctx.getImageData(0, 0, cw, ch);
    } finally {
      soltar(canvas);
    }
  } finally {
    img.removeAttribute('src');
    URL.revokeObjectURL(url);
  }
}

function aBlob(canvas: HTMLCanvasElement, calidad: number): Promise<Blob> {
  return new Promise((resolver, rechazar) =>
    canvas.toBlob(
      (b) => (b ? resolver(b) : rechazar(new ErrorImagen('No se pudo codificar la imagen.'))),
      'image/jpeg',
      calidad,
    ),
  );
}

/** Píxeles → JPEG. */
export async function imageDataAJpeg(img: ImageData, calidad: number): Promise<Blob> {
  const { canvas, ctx } = lienzo(img.width, img.height);
  try {
    ctx.putImageData(img, 0, 0);
    return await aBlob(canvas, calidad);
  } finally {
    soltar(canvas);
  }
}

/**
 * Fotograma actual del <video> de la cámara → JPEG, con el lado largo
 * limitado a `ladoMax`. El resultado entra al mismo camino que una foto
 * elegida con <input type="file">.
 */
export async function fotogramaAJpeg(video: HTMLVideoElement, ladoMax: number, calidad: number): Promise<Blob> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new ErrorImagen('La cámara todavía no está lista. Intenta de nuevo.');
  const { ancho, alto } = dimensionesCaptura(w, h, ladoMax);
  const { canvas, ctx } = lienzo(ancho, alto);
  try {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(video, 0, 0, ancho, alto);
    return await aBlob(canvas, calidad);
  } finally {
    soltar(canvas);
  }
}

/** Decodifica un JPEG propio (sin EXIF), lo reduce por `escala` y lo vuelve a codificar. */
export async function recodificarJpeg(jpeg: Blob, calidad: number, escala: number): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(jpeg);
  try {
    const w = Math.max(1, Math.round(bitmap.width * escala));
    const h = Math.max(1, Math.round(bitmap.height * escala));
    const { canvas, ctx } = lienzo(w, h);
    try {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, w, h);
      return new Uint8Array(await (await aBlob(canvas, calidad)).arrayBuffer());
    } finally {
      soltar(canvas);
    }
  } finally {
    bitmap.close();
  }
}

