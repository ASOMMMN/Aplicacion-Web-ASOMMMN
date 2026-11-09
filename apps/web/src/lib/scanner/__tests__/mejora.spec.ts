import { crearImagen, rotarImagen } from '../imagen';
import { mejorarImagen } from '../mejora';
import type { ImagenRGBA } from '../tipos';
import { lum, pixel } from './sintetico';

/**
 * Página ya enderezada con sombra fuerte a la izquierda: papel de 110 (x=0)
 * a 235 (x=w), barras de texto negras y un sello rojo.
 */
function paginaConSombra(w = 600, h = 400): ImagenRGBA {
  const img = crearImagen(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const luz = 0.47 + 0.53 * (x / w);
      let rgb: [number, number, number] = [235, 233, 228];
      const enTexto = y % 40 >= 18 && y % 40 < 24 && x % 12 < 8;
      if (enTexto) rgb = [25, 25, 25];
      if (x > 420 && x < 520 && y > 40 && y < 120) rgb = [190, 30, 35];
      const j = (y * w + x) * 4;
      img.data[j] = rgb[0] * luz;
      img.data[j + 1] = rgb[1] * luz;
      img.data[j + 2] = rgb[2] * luz;
      img.data[j + 3] = 255;
    }
  }
  return img;
}

/** Papel: un píxel entre renglones. */
const papel = (img: ImagenRGBA, x: number) => lum(pixel(img, x, 10));
const texto = (img: ImagenRGBA, x: number) => lum(pixel(img, x - (x % 12) + 3, 20));

describe('mejorarImagen', () => {
  const original = paginaConSombra();

  it('color: quita la sombra (papel parejo) y mantiene el texto oscuro', () => {
    const r = mejorarImagen(original, 'color');
    expect(papel(original, 590) - papel(original, 30)).toBeGreaterThan(100);
    expect(Math.abs(papel(r, 590) - papel(r, 30))).toBeLessThan(25);
    expect(papel(r, 30)).toBeGreaterThan(215);
    expect(texto(r, 30)).toBeLessThan(80);
    expect(texto(r, 590)).toBeLessThan(80);
  });

  it('color: conserva el color del sello', () => {
    const [rr, g, b] = pixel(mejorarImagen(original, 'color'), 470, 80);
    expect(rr).toBeGreaterThan(150);
    expect(rr - g).toBeGreaterThan(90);
    expect(rr - b).toBeGreaterThan(90);
  });

  it('gris: canales iguales', () => {
    const [rr, g, b] = pixel(mejorarImagen(original, 'gris'), 470, 80);
    expect(rr).toBe(g);
    expect(g).toBe(b);
  });

  it('bn: solo blanco y negro, papel blanco aun en la sombra y texto negro', () => {
    const r = mejorarImagen(original, 'bn');
    for (let i = 0; i < r.data.length; i += 4) {
      if (r.data[i] !== 0 && r.data[i] !== 255) throw new Error(`valor ${r.data[i]}`);
    }
    expect(papel(r, 30)).toBe(255);
    expect(texto(r, 30)).toBe(0);
    expect(texto(r, 590)).toBe(0);
  });
});

describe('rotarImagen', () => {
  it('gira 90° en sentido horario', () => {
    const img = crearImagen(3, 2);
    // Marca el píxel (0,0) en rojo.
    img.data[0] = 255;
    img.data[3] = 255;
    const r = rotarImagen(img, 90);
    expect([r.width, r.height]).toEqual([2, 3]);
    // (0,0) → (h-1, 0) = (1, 0)
    expect(r.data[(0 * 2 + 1) * 4]).toBe(255);
    const v = rotarImagen(rotarImagen(r, 180), 90);
    expect([v.width, v.height]).toEqual([3, 2]);
    expect(v.data[0]).toBe(255);
  });
});
