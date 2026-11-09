/**
 * Tipos compartidos del escáner de documentos. Todo el procesamiento ocurre
 * en el navegador (hilo principal o Web Worker): las fotos son datos
 * personales y nunca salen del dispositivo sin procesar.
 */

export interface Punto {
  x: number;
  y: number;
}

/** Esquinas en orden: superior izquierda, superior derecha, inferior derecha, inferior izquierda. */
export type Cuadrilatero = [Punto, Punto, Punto, Punto];

/**
 * Imagen RGBA con la misma forma que `ImageData` (se puede pasar un
 * ImageData directamente), pero construible en Node para las pruebas.
 */
export interface ImagenRGBA {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/**
 * - color: corrige iluminación y contraste conservando el color (fotos,
 *   hologramas y sellos). Es el modo por defecto.
 * - gris: igual, pero en escala de grises.
 * - bn: blanco y negro con umbral adaptativo; ideal para hojas de solo texto.
 */
export type ModoMejora = 'color' | 'gris' | 'bn';

/** Rotación en grados horarios. */
export type Rotacion = 0 | 90 | 180 | 270;

export interface ResultadoDeteccion {
  esquinas: Cuadrilatero;
  /** 0–1. Por debajo de `umbralConfianza` se usa el rectángulo de respaldo. */
  confianza: number;
  /** true si no se encontró el documento y `esquinas` es el rectángulo de respaldo. */
  respaldo: boolean;
}
