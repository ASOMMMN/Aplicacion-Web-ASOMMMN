import type { Cuadrilatero, Punto } from './tipos';

export const distancia = (a: Punto, b: Punto): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

/** Área (positiva) de un polígono por la fórmula del cordón. */
export function areaPoligono(puntos: readonly Punto[]): number {
  let suma = 0;
  for (let i = 0; i < puntos.length; i++) {
    const a = puntos[i];
    const b = puntos[(i + 1) % puntos.length];
    suma += a.x * b.y - b.x * a.y;
  }
  return Math.abs(suma) / 2;
}

/**
 * Ordena 4 puntos como sup-izq, sup-der, inf-der, inf-izq: por ángulo
 * alrededor del centroide (sentido horario en coordenadas de pantalla) y
 * empezando por el más cercano a la esquina superior izquierda.
 */
export function ordenarEsquinas(puntos: readonly Punto[]): Cuadrilatero {
  if (puntos.length !== 4) {
    throw new Error('Se necesitan exactamente 4 esquinas.');
  }
  const cx = puntos.reduce((s, p) => s + p.x, 0) / 4;
  const cy = puntos.reduce((s, p) => s + p.y, 0) / 4;
  const porAngulo = [...puntos].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
  );
  let inicio = 0;
  for (let i = 1; i < 4; i++) {
    const p = porAngulo[i];
    const q = porAngulo[inicio];
    if (p.x + p.y < q.x + q.y) inicio = i;
  }
  const r = [0, 1, 2, 3].map((i) => ({ ...porAngulo[(inicio + i) % 4] }));
  return [r[0], r[1], r[2], r[3]];
}

/** Ángulos interiores del cuadrilátero, en grados. */
export function angulosInteriores(q: Cuadrilatero): number[] {
  return q.map((p, i) => {
    const prev = q[(i + 3) % 4];
    const next = q[(i + 1) % 4];
    const v1x = prev.x - p.x;
    const v1y = prev.y - p.y;
    const v2x = next.x - p.x;
    const v2y = next.y - p.y;
    const cos =
      (v1x * v2x + v1y * v2y) /
      (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) || 1);
    return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
  });
}

/** true si el cuadrilátero es convexo (todos los giros en el mismo sentido). */
export function esConvexo(q: Cuadrilatero): boolean {
  let signo = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = q[(i + 2) % 4];
    const cruz = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cruz === 0) return false;
    const s = Math.sign(cruz);
    if (signo === 0) signo = s;
    else if (s !== signo) return false;
  }
  return true;
}

/** Rectángulo con margen (fracción de cada lado), usado cuando la detección falla. */
export function rectanguloRespaldo(
  ancho: number,
  alto: number,
  margen: number,
): Cuadrilatero {
  const mx = ancho * margen;
  const my = alto * margen;
  return [
    { x: mx, y: my },
    { x: ancho - mx, y: my },
    { x: ancho - mx, y: alto - my },
    { x: mx, y: alto - my },
  ];
}

export function escalarCuadrilatero(q: Cuadrilatero, f: number): Cuadrilatero {
  return q.map((p) => ({ x: p.x * f, y: p.y * f })) as Cuadrilatero;
}

/** Mantiene las esquinas dentro de la imagen. */
export function limitarCuadrilatero(
  q: Cuadrilatero,
  ancho: number,
  alto: number,
): Cuadrilatero {
  return q.map((p) => ({
    x: Math.max(0, Math.min(ancho, p.x)),
    y: Math.max(0, Math.min(alto, p.y)),
  })) as Cuadrilatero;
}

/**
 * Tamaño del documento enderezado: el lado más largo de cada par de lados
 * opuestos, reducido para que el lado largo no pase de `ladoMax`.
 */
export function tamanoDestino(
  q: Cuadrilatero,
  ladoMax: number,
): { ancho: number; alto: number } {
  const [tl, tr, br, bl] = q;
  const ancho = Math.max(distancia(tl, tr), distancia(bl, br));
  const alto = Math.max(distancia(tl, bl), distancia(tr, br));
  const f = Math.min(1, ladoMax / Math.max(ancho, alto, 1));
  return {
    ancho: Math.max(1, Math.round(ancho * f)),
    alto: Math.max(1, Math.round(alto * f)),
  };
}

/** Matriz 3×3 (por filas) de una homografía. */
export type Homografia = [
  number, number, number,
  number, number, number,
  number, number, number,
]; // prettier-ignore

/**
 * Homografía que lleva cada punto de `origen` al punto correspondiente de
 * `destino` (sistema lineal 8×8, eliminación gaussiana con pivoteo parcial).
 */
export function calcularHomografia(
  origen: Cuadrilatero,
  destino: Cuadrilatero,
): Homografia {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = origen[i];
    const { x: u, y: v } = destino[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  const n = 8;
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let f = col + 1; f < n; f++) {
      if (Math.abs(A[f][col]) > Math.abs(A[piv][col])) piv = f;
    }
    if (Math.abs(A[piv][col]) < 1e-12) {
      throw new Error('Las esquinas no forman un cuadrilátero válido.');
    }
    [A[col], A[piv]] = [A[piv], A[col]];
    for (let f = 0; f < n; f++) {
      if (f === col) continue;
      const k = A[f][col] / A[col][col];
      if (k === 0) continue;
      for (let c = col; c <= n; c++) A[f][c] -= k * A[col][c];
    }
  }
  const h = A.map((fila, i) => fila[n] / fila[i]);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

export function aplicarHomografia(h: Homografia, p: Punto): Punto {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return {
    x: (h[0] * p.x + h[1] * p.y + h[2]) / w,
    y: (h[3] * p.x + h[4] * p.y + h[5]) / w,
  };
}
