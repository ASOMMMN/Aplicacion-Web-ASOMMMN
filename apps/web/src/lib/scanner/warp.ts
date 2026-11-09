import { calcularHomografia, tamanoDestino } from './geometria';
import { crearImagen } from './imagen';
import type { Cuadrilatero, ImagenRGBA } from './tipos';

/**
 * Recorta y endereza el documento delimitado por `esquinas` (en píxeles de
 * `img`): cada píxel del resultado se toma de la foto por la homografía
 * inversa, con interpolación bilineal.
 */
export function corregirPerspectiva(
  img: ImagenRGBA,
  esquinas: Cuadrilatero,
  ladoMax: number,
): ImagenRGBA {
  const { ancho, alto } = tamanoDestino(esquinas, ladoMax);
  const destino: Cuadrilatero = [
    { x: 0, y: 0 },
    { x: ancho, y: 0 },
    { x: ancho, y: alto },
    { x: 0, y: alto },
  ];
  // Del documento enderezado hacia la foto.
  const h = calcularHomografia(destino, esquinas);
  const out = crearImagen(ancho, alto);
  const { width: sw, height: sh, data: src } = img;
  const dst = out.data;
  const maxX = sw - 1;
  const maxY = sh - 1;

  for (let y = 0; y < alto; y++) {
    const cy = y + 0.5;
    // Coeficientes de la fila: avanzar x solo suma constantes.
    let nx = h[1] * cy + h[2] + h[0] * 0.5;
    let ny = h[4] * cy + h[5] + h[3] * 0.5;
    let nw = h[7] * cy + h[8] + h[6] * 0.5;
    let o = y * ancho * 4;
    for (let x = 0; x < ancho; x++, o += 4) {
      const fx = Math.max(0, Math.min(maxX, nx / nw - 0.5));
      const fy = Math.max(0, Math.min(maxY, ny / nw - 0.5));
      nx += h[0];
      ny += h[3];
      nw += h[6];
      const x0 = fx | 0;
      const y0 = fy | 0;
      const x1 = x0 < maxX ? x0 + 1 : x0;
      const y1 = y0 < maxY ? y0 + 1 : y0;
      const dx = fx - x0;
      const dy = fy - y0;
      const a = (y0 * sw + x0) * 4;
      const b = (y0 * sw + x1) * 4;
      const c = (y1 * sw + x0) * 4;
      const d = (y1 * sw + x1) * 4;
      for (let k = 0; k < 3; k++) {
        const arriba = src[a + k] + (src[b + k] - src[a + k]) * dx;
        const abajo = src[c + k] + (src[d + k] - src[c + k]) * dx;
        dst[o + k] = arriba + (abajo - arriba) * dy;
      }
      dst[o + 3] = 255;
    }
  }
  return out;
}
