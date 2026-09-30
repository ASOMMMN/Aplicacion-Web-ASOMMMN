import { Canvas, createCanvas } from '@napi-rs/canvas';
import {
  cajaConTinta,
  dividirEnBandas,
  mascaraTinta,
  pareceGirado90,
  prepararPagina,
  separarBloques,
} from './preparar-imagen';

/** Hoja carta blanca (850×1100) con bloques de "renglones" negros. */
function hoja(
  bloques: Array<{ x: number; y: number; w: number; h: number }>,
  opciones: { motas?: boolean; vertical?: boolean } = {},
): Canvas {
  const c = createCanvas(850, 1100);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 850, 1100);
  ctx.fillStyle = '#000';
  for (const b of bloques) {
    if (opciones.vertical) {
      // Renglones verticales (documento girado 90°)
      for (let x = b.x; x < b.x + b.w; x += 24) ctx.fillRect(x, b.y, 10, b.h);
    } else {
      for (let y = b.y; y < b.y + b.h; y += 24) ctx.fillRect(b.x, y, b.w, 10);
    }
  }
  if (opciones.motas) {
    // Borde oscuro del escáner a todo lo alto de la hoja.
    ctx.fillRect(0, 0, 2, 1100);
    // Motas del escáner en los márgenes: no deben ampliar el recorte.
    ctx.fillRect(5, 5, 3, 3);
    ctx.fillRect(840, 1090, 3, 3);
    ctx.fillRect(3, 600, 2, 2);
  }
  return c;
}

const TARJETA_ARRIBA = { x: 420, y: 80, w: 400, h: 250 };
const TARJETA_ABAJO = { x: 420, y: 420, w: 400, h: 300 };

describe('preparar-imagen', () => {
  it('recorta los márgenes aunque haya motas del escáner', () => {
    const c = hoja([TARJETA_ARRIBA], { motas: true });
    const { tinta, w, h, escala } = mascaraTinta(c, c.width, c.height);
    const caja = cajaConTinta(tinta, w, h)!;
    expect(caja.x / escala).toBeGreaterThan(400);
    expect(caja.w / escala).toBeLessThan(430);
  });

  it('separa dos tarjetas escaneadas en la misma hoja', () => {
    const c = hoja([TARJETA_ARRIBA, TARJETA_ABAJO]);
    const { tinta, w, h } = mascaraTinta(c, c.width, c.height);
    const caja = cajaConTinta(tinta, w, h)!;
    expect(separarBloques(tinta, w, caja)).toHaveLength(2);
  });

  it('una hoja con dos tarjetas → vista general + 2 partes, sin reducir', () => {
    const imgs = prepararPagina(hoja([TARJETA_ARRIBA, TARJETA_ABAJO]), 1);
    expect(imgs.map((i) => i.parte)).toEqual([0, 1, 2]);
    // Cada parte conserva la resolución de la tarjeta (≈ 400 px + margen).
    for (const i of imgs.slice(1)) expect(i.ancho).toBeGreaterThan(400);
  });

  it('detecta texto girado 90° y lo endereza', () => {
    const c = hoja([{ x: 200, y: 150, w: 400, h: 700 }], { vertical: true });
    const { tinta, w, h } = mascaraTinta(c, c.width, c.height);
    const caja = cajaConTinta(tinta, w, h)!;
    expect(pareceGirado90(tinta, w, caja)).toBe(true);
    const [img] = prepararPagina(c, 1);
    expect(img.rotacion).toBe(90);
    expect(img.ancho).toBeGreaterThan(img.alto);
  });

  it('texto horizontal no se gira', () => {
    const c = hoja([{ x: 100, y: 100, w: 600, h: 800 }]);
    const { tinta, w, h } = mascaraTinta(c, c.width, c.height);
    expect(pareceGirado90(tinta, w, cajaConTinta(tinta, w, h)!)).toBe(false);
  });

  it('un bloque alto se divide en bandas con traslape', () => {
    // Bloque de 1000 px de ancho: bandas de 768 px (lo que OpenAI no reduce)
    const bandas = dividirEnBandas(0, 3000, 1000);
    expect(bandas[0].h).toBe(768);
    expect(bandas.length).toBeGreaterThan(3);
    expect(bandas[0].y).toBe(0);
    const ultima = bandas[bandas.length - 1];
    expect(ultima.y + ultima.h).toBe(3000);
    // Traslape entre bandas consecutivas
    expect(bandas[1].y).toBeLessThan(bandas[0].y + bandas[0].h);
  });

  it('bloque ancho (2400 px) → bandas de 900 px (2048×768 tras escalar)', () => {
    expect(dividirEnBandas(0, 5000, 2400)[0].h).toBe(900);
  });

  it('ninguna imagen supera el lado máximo', () => {
    const c = createCanvas(4000, 5200);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 4000, 5200);
    ctx.fillStyle = '#000';
    for (let y = 200; y < 5000; y += 60) ctx.fillRect(200, y, 3600, 20);
    for (const i of prepararPagina(c, 1)) {
      expect(Math.max(i.ancho, i.alto)).toBeLessThanOrEqual(2048);
    }
  });
});
