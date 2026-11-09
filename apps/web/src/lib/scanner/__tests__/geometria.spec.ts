import {
  aplicarHomografia,
  areaPoligono,
  calcularHomografia,
  esConvexo,
  limitarCuadrilatero,
  ordenarEsquinas,
  rectanguloRespaldo,
  tamanoDestino,
} from '../geometria';
import type { Cuadrilatero } from '../tipos';

const cuad: Cuadrilatero = [
  { x: 40, y: 30 },
  { x: 380, y: 60 },
  { x: 350, y: 290 },
  { x: 20, y: 250 },
];

describe('ordenarEsquinas', () => {
  it('ordena sup-izq, sup-der, inf-der, inf-izq sin importar el orden de entrada', () => {
    const revuelto = [cuad[2], cuad[0], cuad[3], cuad[1]];
    expect(ordenarEsquinas(revuelto)).toEqual(cuad);
  });

  it('funciona con un documento girado ~30°', () => {
    const c = { x: 200, y: 200 };
    const ang = (30 * Math.PI) / 180;
    const rot = (dx: number, dy: number) => ({
      x: c.x + dx * Math.cos(ang) - dy * Math.sin(ang),
      y: c.y + dx * Math.sin(ang) + dy * Math.cos(ang),
    });
    const esperado = [rot(-100, -60), rot(100, -60), rot(100, 60), rot(-100, 60)];
    const r = ordenarEsquinas([esperado[3], esperado[1], esperado[0], esperado[2]]);
    expect(r[0]).toEqual(esperado[0]);
    expect(r[2]).toEqual(esperado[2]);
  });

  it('rechaza algo que no son 4 puntos', () => {
    expect(() => ordenarEsquinas(cuad.slice(0, 3))).toThrow();
  });
});

describe('calcularHomografia', () => {
  it('lleva cada esquina exactamente a su destino', () => {
    const destino: Cuadrilatero = [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 200 },
      { x: 0, y: 200 },
    ];
    const h = calcularHomografia(cuad, destino);
    cuad.forEach((p, i) => {
      const r = aplicarHomografia(h, p);
      expect(r.x).toBeCloseTo(destino[i].x, 6);
      expect(r.y).toBeCloseTo(destino[i].y, 6);
    });
  });

  it('falla con esquinas degeneradas (colineales)', () => {
    const linea: Cuadrilatero = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ];
    expect(() => calcularHomografia(linea, cuad)).toThrow();
  });
});

describe('utilidades de cuadriláteros', () => {
  it('área, convexidad y tamaño de destino', () => {
    const r = rectanguloRespaldo(1000, 500, 0.1);
    expect(areaPoligono(r)).toBeCloseTo(800 * 400);
    expect(esConvexo(r)).toBe(true);
    expect(esConvexo([r[0], r[2], r[1], r[3]])).toBe(false);
    expect(tamanoDestino(r, 2000)).toEqual({ ancho: 800, alto: 400 });
    expect(tamanoDestino(r, 400)).toEqual({ ancho: 400, alto: 200 });
  });

  it('limita las esquinas al tamaño de la imagen', () => {
    const fuera: Cuadrilatero = [
      { x: -5, y: -5 },
      { x: 120, y: 0 },
      { x: 110, y: 90 },
      { x: 0, y: 99 },
    ];
    const l = limitarCuadrilatero(fuera, 100, 80);
    expect(l[0]).toEqual({ x: 0, y: 0 });
    expect(l[1].x).toBe(100);
    expect(l[2]).toEqual({ x: 100, y: 80 });
  });
});
