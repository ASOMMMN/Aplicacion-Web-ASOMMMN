/**
 * Imágenes sintéticas para las pruebas: una "foto" de un documento con
 * perspectiva, sombra y ruido conocidos, para comparar contra la verdad.
 */
import { aplicarHomografia, calcularHomografia } from '../geometria';
import { crearImagen } from '../imagen';
import type { Cuadrilatero, ImagenRGBA } from '../tipos';

/** Generador pseudoaleatorio determinista (mulberry32). */
export function aleatorio(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Contenido = (u: number, v: number) => [number, number, number];

/** Papel claro con renglones de "texto" oscuro y un recuadro rojo (sello/foto). */
export const contenidoDocumento: Contenido = (u, v) => {
  if (u > 0.08 && u < 0.3 && v > 0.15 && v < 0.55) return [200, 40, 40];
  const renglon = Math.floor(v * 20);
  const enRenglon = (v * 20) % 1 < 0.35;
  if (u > 0.38 && u < 0.92 && renglon % 2 === 1 && enRenglon && renglon < 18) {
    const letra = Math.floor(u * 60) % 3 !== 0;
    if (letra) return [30, 30, 30];
  }
  return [235, 232, 225];
};

export interface OpcionesFoto {
  ancho: number;
  alto: number;
  /** Esquinas del documento en la foto (sup-izq, sup-der, inf-der, inf-izq). */
  esquinas: Cuadrilatero;
  contenido?: Contenido;
  /** Luminancia del fondo (mesa). */
  fondo?: number;
  /** Sombra lineal de izquierda a derecha: factor en x=0 (1 = sin sombra). */
  sombra?: number;
  ruido?: number;
  semilla?: number;
}

/** "Foto" de un documento: cada píxel dentro del cuadrilátero toma el contenido en (u, v). */
export function fotoSintetica(o: OpcionesFoto): ImagenRGBA {
  const img = crearImagen(o.ancho, o.alto);
  const unidad: Cuadrilatero = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  const aDoc = calcularHomografia(o.esquinas, unidad);
  const contenido = o.contenido ?? contenidoDocumento;
  const rnd = aleatorio(o.semilla ?? 1);
  const fondo = o.fondo ?? 70;
  for (let y = 0; y < o.alto; y++) {
    for (let x = 0; x < o.ancho; x++) {
      const { x: u, y: v } = aplicarHomografia(aDoc, { x: x + 0.5, y: y + 0.5 });
      let rgb: [number, number, number];
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
        rgb = contenido(u, v);
      } else {
        // Mesa con veta suave.
        const veta = 12 * Math.sin(y / 7 + Math.sin(x / 40));
        rgb = [fondo + veta + 10, fondo + veta, fondo + veta - 10];
      }
      const s = o.sombra === undefined ? 1 : o.sombra + (1 - o.sombra) * (x / o.ancho);
      const r = (o.ruido ?? 0) * (rnd() - 0.5);
      const j = (y * o.ancho + x) * 4;
      img.data[j] = rgb[0] * s + r;
      img.data[j + 1] = rgb[1] * s + r;
      img.data[j + 2] = rgb[2] * s + r;
      img.data[j + 3] = 255;
    }
  }
  return img;
}

export function pixel(img: ImagenRGBA, x: number, y: number): [number, number, number] {
  const j = (Math.round(y) * img.width + Math.round(x)) * 4;
  return [img.data[j], img.data[j + 1], img.data[j + 2]];
}

export const lum = ([r, g, b]: [number, number, number]) =>
  0.299 * r + 0.587 * g + 0.114 * b;
