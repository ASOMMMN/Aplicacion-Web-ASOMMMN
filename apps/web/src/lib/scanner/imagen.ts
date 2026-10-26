/**
 * Operaciones básicas sobre imágenes en memoria (sin canvas), usadas por la
 * detección y la mejora. Trabajan con canales de un solo plano
 * (`Plano`: luminancia u otro valor por píxel) para no copiar RGBA.
 */
import type { ImagenRGBA, Rotacion } from './tipos';

export interface Plano {
  width: number;
  height: number;
  data: Float32Array;
}

export function crearImagen(width: number, height: number): ImagenRGBA {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

/** Luminancia (BT.601) de cada píxel. */
export function luminancia(img: ImagenRGBA): Plano {
  const { width, height, data } = img;
  const out = new Float32Array(width * height);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) {
    out[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
  }
  return { width, height, data: out };
}

/**
 * Reduce un plano promediando bloques (sin aliasing), hasta que su lado
 * largo sea como máximo `ladoMax`. Devuelve también el factor aplicado.
 */
export function reducirPlano(
  p: Plano,
  ladoMax: number,
): { plano: Plano; factor: number } {
  const factor = Math.min(1, ladoMax / Math.max(p.width, p.height));
  if (factor === 1) return { plano: p, factor };
  const w = Math.max(1, Math.round(p.width * factor));
  const h = Math.max(1, Math.round(p.height * factor));
  const out = new Float32Array(w * h);
  const sx = p.width / w;
  const sy = p.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let s = 0;
      for (let yy = y0; yy < y1; yy++) {
        const fila = yy * p.width;
        for (let xx = x0; xx < x1; xx++) s += p.data[fila + xx];
      }
      out[y * w + x] = s / ((y1 - y0) * (x1 - x0));
    }
  }
  return { plano: { width: w, height: h, data: out }, factor };
}

/** Ampliación bilineal de un plano a `width`×`height`. */
export function ampliarPlano(p: Plano, width: number, height: number): Plano {
  const out = new Float32Array(width * height);
  const sx = p.width / width;
  const sy = p.height / height;
  for (let y = 0; y < height; y++) {
    const fy = Math.max(0, Math.min(p.height - 1, (y + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(p.height - 1, y0 + 1);
    const dy = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = Math.max(0, Math.min(p.width - 1, (x + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(p.width - 1, x0 + 1);
      const dx = fx - x0;
      const a = p.data[y0 * p.width + x0];
      const b = p.data[y0 * p.width + x1];
      const c = p.data[y1 * p.width + x0];
      const d = p.data[y1 * p.width + x1];
      out[y * width + x] =
        (a * (1 - dx) + b * dx) * (1 - dy) + (c * (1 - dx) + d * dx) * dy;
    }
  }
  return { width, height, data: out };
}

/** Desenfoque de caja separable de radio `r` (bordes replicados). */
export function desenfocarCaja(p: Plano, r: number): Plano {
  if (r <= 0) return p;
  const { width: w, height: h } = p;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const fila = y * w;
    let s = 0;
    for (let k = -r; k <= r; k++) s += p.data[fila + Math.max(0, Math.min(w - 1, k))];
    for (let x = 0; x < w; x++) {
      tmp[fila + x] = s / n;
      s +=
        p.data[fila + Math.min(w - 1, x + r + 1)] -
        p.data[fila + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += tmp[Math.max(0, Math.min(h - 1, k)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / n;
      s +=
        tmp[Math.min(h - 1, y + r + 1) * w + x] -
        tmp[Math.max(0, y - r) * w + x];
    }
  }
  return { width: w, height: h, data: out };
}

/**
 * Máximo (`dilatar`) o mínimo (`erosionar`) en una ventana cuadrada de
 * radio `r`, separable (filas y luego columnas).
 */
function filtroExtremo(p: Plano, r: number, maximo: boolean): Plano {
  const { width: w, height: h } = p;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const mejor = maximo ? Math.max : Math.min;
  for (let y = 0; y < h; y++) {
    const fila = y * w;
    for (let x = 0; x < w; x++) {
      let v = p.data[fila + x];
      const a = Math.max(0, x - r);
      const b = Math.min(w - 1, x + r);
      for (let k = a; k <= b; k++) v = mejor(v, p.data[fila + k]);
      tmp[fila + x] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    const a = Math.max(0, y - r);
    const b = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      let v = tmp[y * w + x];
      for (let k = a; k <= b; k++) v = mejor(v, tmp[k * w + x]);
      out[y * w + x] = v;
    }
  }
  return { width: w, height: h, data: out };
}

export const dilatar = (p: Plano, r: number) => filtroExtremo(p, r, true);
export const erosionar = (p: Plano, r: number) => filtroExtremo(p, r, false);

/** Cierre morfológico: borra detalles oscuros más pequeños que la ventana (p. ej. texto sobre papel). */
export const cerrar = (p: Plano, r: number) => erosionar(dilatar(p, r), r);

/** Valor en el percentil `q` (0–1) de un plano con valores en 0–255. */
export function percentil(p: Plano, q: number): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < p.data.length; i++) {
    hist[Math.max(0, Math.min(255, Math.round(p.data[i])))]++;
  }
  const objetivo = q * p.data.length;
  let acum = 0;
  for (let v = 0; v < 256; v++) {
    acum += hist[v];
    if (acum >= objetivo) return v;
  }
  return 255;
}

/** Rota una imagen RGBA en múltiplos de 90° (sentido horario). */
export function rotarImagen(img: ImagenRGBA, grados: Rotacion): ImagenRGBA {
  if (grados === 0) return img;
  const { width: w, height: h, data } = img;
  const giraLados = grados === 90 || grados === 270;
  const ow = giraLados ? h : w;
  const oh = giraLados ? w : h;
  const out = crearImagen(ow, oh);
  const src = new Uint32Array(data.buffer, data.byteOffset, w * h);
  const dst = new Uint32Array(out.data.buffer);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let nx: number;
      let ny: number;
      if (grados === 90) {
        nx = h - 1 - y;
        ny = x;
      } else if (grados === 180) {
        nx = w - 1 - x;
        ny = h - 1 - y;
      } else {
        nx = y;
        ny = w - 1 - x;
      }
      dst[ny * ow + nx] = src[y * w + x];
    }
  }
  return out;
}
