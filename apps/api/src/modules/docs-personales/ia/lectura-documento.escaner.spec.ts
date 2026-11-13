/**
 * El PDF que genera el escáner del navegador (apps/web/src/lib/scanner) no
 * tiene capa de texto: debe entrar a la canalización de visión como
 * escaneado, con todas sus páginas renderizadas y el QR leído.
 *
 * Los PDF de test/fixtures/escaner los produce el propio código del escáner
 * a partir de una credencial SINTÉTICA fotografiada en ángulo y con sombra
 * (apps/web/scripts/fixture-escaner.ts). Si cambia el escáner, regenerarlos.
 *
 * La lectura corre con pdf-parse/pdf.js REALES en un proceso aparte
 * (test/escaner/leer-pdf.ts): pdf.js necesita import() nativo, que Jest no
 * permite dentro de su vm.
 */
import {
  type Canvas,
  createCanvas,
  type Image,
  loadImage,
} from '@napi-rs/canvas';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { DocumentoLeido } from './lectura-documento';

const DIR = join(__dirname, '../../../../test/fixtures/escaner');
const RAIZ_API = join(__dirname, '../../../..');
const LECTOR = join(RAIZ_API, 'test/escaner/leer-pdf.ts');
const TMP = mkdtempSync(join(tmpdir(), 'escaner-spec-'));
afterAll(() => rmSync(TMP, { recursive: true, force: true }));

const ejecutar = promisify(execFile);
async function lector(...args: string[]): Promise<void> {
  await ejecutar(
    process.execPath,
    ['-r', 'ts-node/register/transpile-only', LECTOR, ...args],
    {
      cwd: RAIZ_API,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
}

type LecturaResumida = Omit<DocumentoLeido, 'imagenes'> & {
  imagenes: Array<{
    pagina: number;
    parte: number;
    ancho: number;
    esImagen: boolean;
  }>;
};

interface Caja {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}
interface Meta {
  qr: string;
  mrz: string[];
  cajasMrz: Caja[];
  cajaLetraChica: Caja;
  letraChica: string;
  variantes: Record<
    string,
    { bytes: number; calidad: number; ladoPaginas: number[] }
  >;
}

const meta = JSON.parse(
  readFileSync(join(DIR, 'ine-sintetica.json'), 'utf8'),
) as Meta;
const NORMAL = 'ine-sintetica.pdf';
const MAXIMA = 'ine-sintetica-compresion-maxima.pdf';
const ANCHO_RENDER = 2400; // CONFIG_LECTURA_POR_DEFECTO.anchoPx

describe.each([NORMAL, MAXIMA])(
  'PDF del escáner (%s) en la lectura IA',
  (archivo) => {
    let leido: LecturaResumida;

    beforeAll(async () => {
      const salida = join(TMP, `${archivo}.json`);
      await lector('leer', join(DIR, archivo), salida);
      leido = JSON.parse(readFileSync(salida, 'utf8')) as LecturaResumida;
    }, 300_000);

    it('se trata como escaneado: modo pdf-visual, sin texto', () => {
      expect(leido.modo).toBe('pdf-visual');
      expect(leido.texto).toBe('');
      expect(leido.aviso).toBeUndefined();
      expect(leido.paginas.every((p) => p.escaneada)).toBe(true);
    });

    it('renderiza las dos páginas (frente y reverso)', () => {
      expect(leido.paginasTotales).toBe(2);
      expect(leido.paginasLeidas).toBe(2);
      for (const pagina of [1, 2]) {
        const imgs = leido.imagenes.filter((i) => i.pagina === pagina);
        expect(imgs.length).toBeGreaterThan(0);
        expect(imgs.every((i) => i.esImagen && i.ancho > 0)).toBe(true);
      }
    });

    it('lee el QR del reverso y sus fechas', () => {
      const qr = leido.paginas[1].estructuradas.find((f) => f.origen === 'qr');
      expect(qr?.texto).toBe(meta.qr);
      expect(qr?.lecturas.map((l) => l.valor)).toEqual(
        expect.arrayContaining(['2025-12-19', '2027-12-19']),
      );
    });
  },
);

// ── Legibilidad de la MRZ y la letra chica tras la compresión adaptativa ───
//
// Sin OCR en las pruebas, se mide por carácter: la correlación cruzada
// normalizada (NCC) entre cada celda en la página renderizada y la misma
// celda en la credencial original. El peor caso del escáner (calidad mínima
// y lado mínimo legible) debe conservar cada carácter; un control negativo
// (la misma página reducida a 500 px, donde la letra chica ya no se lee)
// debe fallar con los mismos umbrales, para comprobar que la medida distingue.
//
// Medido (NCC mínima por carácter, MRZ | letra chica): página del escáner
// 0.95 | 0.90; reducida a 1000 px 0.96 | 0.85; a 700 px 0.94 | 0.73;
// a 500 px 0.88 | 0.65; a 350 px 0.71 | 0.33.

const UMBRAL_MRZ = 0.9;
const UMBRAL_LETRA_CHICA = 0.85;
const ANCHO_CONTROL_NEGATIVO = 500;

interface Gris {
  w: number;
  h: number;
  d: Float32Array;
}

function aGris(img: Image | Canvas, w: number, h: number): Gris {
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) {
    d[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
  }
  return { w, h, d };
}

/** NCC entre la celda (x, y, w, h) de `ref` y la misma celda desplazada (dx, dy) en `img`. */
function ncc(
  ref: Gris,
  img: Gris,
  x: number,
  y: number,
  w: number,
  h: number,
  dx: number,
  dy: number,
): number {
  let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, n = 0; // prettier-ignore
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const xa = x + i, ya = y + j, xb = xa + dx, yb = ya + dy; // prettier-ignore
      if (xb < 0 || yb < 0 || xb >= img.w || yb >= img.h) continue;
      const a = ref.d[ya * ref.w + xa];
      const b = img.d[yb * img.w + xb];
      sa += a;
      sb += b;
      saa += a * a;
      sbb += b * b;
      sab += a * b;
      n++; // prettier-ignore
    }
  }
  const cov = sab - (sa * sb) / n;
  const va = saa - (sa * sa) / n;
  const vb = sbb - (sb * sb) / n;
  // Celda lisa en la referencia (espacio): no dice nada de la legibilidad.
  if (va / n < 25) return NaN;
  return vb > 0 ? cov / Math.sqrt(va * vb) : 0;
}

/** NCC de cada carácter de una línea, con el mejor desplazamiento global de la línea (±8 px). */
function nccPorCaracter(
  ref: Gris,
  img: Gris,
  caja: Caja,
  caracteres: number,
): number[] {
  const x0 = Math.round(caja.u0 * ref.w);
  const y0 = Math.round(caja.v0 * ref.h);
  const w = Math.round((caja.u1 - caja.u0) * ref.w);
  const h = Math.round((caja.v1 - caja.v0) * ref.h);
  let mejor = { dx: 0, dy: 0, v: -1 };
  for (let dy = -8; dy <= 8; dy += 2)
    for (let dx = -8; dx <= 8; dx += 2) {
      const v = ncc(ref, img, x0, y0, w, h, dx, dy);
      if (v > mejor.v) mejor = { dx, dy, v };
    }
  const celda = w / caracteres;
  return Array.from({ length: caracteres }, (_, k) => {
    const cx = Math.round(x0 + k * celda);
    // Ajuste fino por carácter (±2 px) sobre el desplazamiento de la línea.
    let v = -1;
    for (let ey = -2; ey <= 2; ey++)
      for (let ex = -2; ex <= 2; ex++)
        v = Math.max(
          v,
          ncc(
            ref,
            img,
            cx,
            y0,
            Math.round(celda),
            h,
            mejor.dx + ex,
            mejor.dy + ey,
          ),
        );
    return v;
  }).filter((v) => !Number.isNaN(v));
}

describe('Legibilidad de la MRZ tras la compresión máxima del escáner', () => {
  let ref: Gris;
  let pagina: Gris;
  let degradada: Gris;

  beforeAll(async () => {
    // La variante de compresión máxima de verdad llegó a los mínimos.
    const v = meta.variantes[MAXIMA];
    expect(v.calidad).toBeCloseTo(0.6);
    expect(Math.max(...v.ladoPaginas)).toBeLessThanOrEqual(1420);

    // Reverso renderizado igual que en la canalización (ancho 2400 px).
    const png = join(TMP, 'reverso.png');
    await lector('render', join(DIR, MAXIMA), png, '2');
    const render = await loadImage(readFileSync(png));
    const original = await loadImage(
      readFileSync(join(DIR, 'reverso-original.png')),
    );
    const h = Math.round((render.height / render.width) * ANCHO_RENDER);
    pagina = aGris(render, ANCHO_RENDER, h);
    ref = aGris(original, ANCHO_RENDER, h);
    // Control negativo: misma página reducida y vuelta a ampliar.
    const chica = createCanvas(
      ANCHO_CONTROL_NEGATIVO,
      Math.round((h * ANCHO_CONTROL_NEGATIVO) / ANCHO_RENDER),
    );
    chica.getContext('2d').drawImage(render, 0, 0, chica.width, chica.height);
    degradada = aGris(chica, ANCHO_RENDER, h);
  }, 300_000);

  it('cada carácter de las 3 líneas de la MRZ se conserva', () => {
    meta.mrz.forEach((linea, i) => {
      const valores = nccPorCaracter(
        ref,
        pagina,
        meta.cajasMrz[i],
        linea.length,
      );
      expect(Math.min(...valores)).toBeGreaterThan(UMBRAL_MRZ);
    });
  });

  it('la letra chica (~1 mm) sigue legible', () => {
    const valores = nccPorCaracter(
      ref,
      pagina,
      meta.cajaLetraChica,
      meta.letraChica.length,
    );
    expect(Math.min(...valores)).toBeGreaterThan(UMBRAL_LETRA_CHICA);
  });

  it('control negativo: una página ilegible no pasa los umbrales', () => {
    const mrz = meta.mrz.flatMap((linea, i) =>
      nccPorCaracter(ref, degradada, meta.cajasMrz[i], linea.length),
    );
    const chica = nccPorCaracter(
      ref,
      degradada,
      meta.cajaLetraChica,
      meta.letraChica.length,
    );
    expect(Math.min(...mrz)).toBeLessThan(UMBRAL_MRZ);
    expect(Math.min(...chica)).toBeLessThan(UMBRAL_LETRA_CHICA);
  });
});
