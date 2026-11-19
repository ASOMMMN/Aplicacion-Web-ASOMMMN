import { detectarBordes } from '../deteccion';
import { crearImagen } from '../imagen';
import type { Cuadrilatero, Punto } from '../tipos';
import { corregirPerspectiva } from '../warp';
import { fotoSintetica, pixel } from './sintetico';

/** Cuatro cuadrantes de colores distintos, para verificar orientación. */
const cuadrantes = (u: number, v: number): [number, number, number] =>
  u < 0.5 ? (v < 0.5 ? [220, 30, 30] : [240, 240, 240]) : v < 0.5 ? [30, 200, 30] : [30, 30, 220];

const enPerspectiva: Cuadrilatero = [
  { x: 120, y: 90 },
  { x: 620, y: 140 },
  { x: 580, y: 470 },
  { x: 70, y: 420 },
];

describe('corregirPerspectiva', () => {
  it('endereza el documento y conserva la orientación de su contenido', () => {
    const foto = fotoSintetica({ ancho: 720, alto: 560, esquinas: enPerspectiva, contenido: cuadrantes });
    const plano = corregirPerspectiva(foto, enPerspectiva, 2000);
    const { width: w, height: h } = plano;
    expect(w).toBeGreaterThan(h);
    const centro = (u: number, v: number) => pixel(plano, u * w, v * h);
    expect(centro(0.25, 0.25)[0]).toBeGreaterThan(180); // rojo arriba-izquierda
    expect(centro(0.75, 0.25)[1]).toBeGreaterThan(160); // verde arriba-derecha
    expect(centro(0.75, 0.75)[2]).toBeGreaterThan(180); // azul abajo-derecha
    expect(Math.min(...centro(0.25, 0.75))).toBeGreaterThan(200); // blanco abajo-izquierda
    // Ni un pixel de la mesa en los bordes del resultado.
    for (const [u, v] of [[0.02, 0.5], [0.98, 0.5], [0.5, 0.02], [0.5, 0.98]]) {
      expect(Math.max(...centro(u, v))).toBeGreaterThan(150);
    }
  });

  it('respeta el lado máximo de salida', () => {
    const foto = fotoSintetica({ ancho: 720, alto: 560, esquinas: enPerspectiva });
    const plano = corregirPerspectiva(foto, enPerspectiva, 300);
    expect(Math.max(plano.width, plano.height)).toBe(300);
  });
});

const errorMaximo = (a: Cuadrilatero, b: Cuadrilatero) =>
  Math.max(...a.map((p: Punto, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y)));

describe('detectarBordes', () => {
  it('encuentra las 4 esquinas de un documento en ángulo, con sombra y ruido', () => {
    const foto = fotoSintetica({
      ancho: 1200,
      alto: 900,
      esquinas: [
        { x: 210, y: 150 },
        { x: 1010, y: 220 },
        { x: 960, y: 760 },
        { x: 150, y: 700 },
      ],
      sombra: 0.55,
      ruido: 18,
    });
    const r = detectarBordes(foto);
    expect(r.respaldo).toBe(false);
    expect(r.confianza).toBeGreaterThan(0.6);
    expect(
      errorMaximo(r.esquinas, [
        { x: 210, y: 150 },
        { x: 1010, y: 220 },
        { x: 960, y: 760 },
        { x: 150, y: 700 },
      ]),
    ).toBeLessThan(1200 * 0.02);
  });

  it('encuentra un documento oscuro sobre fondo claro', () => {
    const esquinas: Cuadrilatero = [
      { x: 160, y: 120 },
      { x: 640, y: 100 },
      { x: 660, y: 460 },
      { x: 140, y: 480 },
    ];
    const foto = fotoSintetica({
      ancho: 800,
      alto: 600,
      esquinas,
      fondo: 225,
      contenido: () => [60, 70, 110],
    });
    const r = detectarBordes(foto);
    expect(r.respaldo).toBe(false);
    expect(errorMaximo(r.esquinas, esquinas)).toBeLessThan(800 * 0.02);
  });

  it('sin documento (imagen lisa) cae al rectángulo de respaldo', () => {
    const lisa = crearImagen(640, 480);
    lisa.data.fill(128);
    const r = detectarBordes(lisa);
    expect(r.respaldo).toBe(true);
    expect(r.esquinas[0].x).toBeGreaterThan(0);
    expect(r.esquinas[2].x).toBeLessThan(640);
  });

  it('documento que llena toda la foto (sin bordes visibles) cae al respaldo', () => {
    const foto = fotoSintetica({
      ancho: 640,
      alto: 480,
      esquinas: [
        { x: -20, y: -20 },
        { x: 660, y: -20 },
        { x: 660, y: 500 },
        { x: -20, y: 500 },
      ],
    });
    expect(detectarBordes(foto).respaldo).toBe(true);
  });
});
