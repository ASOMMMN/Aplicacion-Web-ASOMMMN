/**
 * Genera los PDF de prueba que usa el spec de la API
 * (apps/api/src/modules/docs-personales/ia/lectura-documento.escaner.spec.ts)
 * pasando una credencial SINTÉTICA (sin datos reales) por el mismo código
 * del escáner: foto en perspectiva con sombra → detección → enderezado →
 * mejora → compresión adaptativa → pdf-lib.
 *
 * Solo cambia el codificador JPEG (canvas del navegador → @napi-rs/canvas).
 *
 * Uso (desde la raíz del repo):
 *   npx ts-node -P apps/web/tsconfig.test.json apps/web/scripts/fixture-escaner.ts
 */
import { createCanvas, GlobalFonts, type SKRSContext2D } from '@napi-rs/canvas';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import QRCode from 'qrcode';
import { comprimirPaginas } from '../src/lib/scanner/compresion';
import { CONFIG_ESCANER } from '../src/lib/scanner/constantes';
import { detectarBordes } from '../src/lib/scanner/deteccion';
import { aplicarHomografia, calcularHomografia } from '../src/lib/scanner/geometria';
import { crearImagen } from '../src/lib/scanner/imagen';
import { mejorarImagen } from '../src/lib/scanner/mejora';
import { generarPdf } from '../src/lib/scanner/pdf';
import type { Cuadrilatero, ImagenRGBA } from '../src/lib/scanner/tipos';
import { corregirPerspectiva } from '../src/lib/scanner/warp';

const SALIDA = join(__dirname, '..', '..', 'api', 'test', 'fixtures', 'escaner');
const ANCHO = 1600;
const ALTO = 1010; // proporción ID-1 (85.6 × 54 mm)

export const QR_TEXTO = 'DICTAMEN:19/12/2025|VIGENCIA:19/12/2027';
/** MRZ TD1 (3 × 30) de una persona ficticia. */
export const MRZ = [
  'IDMEX0000000000<<0000000000000',
  '9001014H3412315MEX<00<<00000<0',
  'PRUEBA<SINTETICA<<ESCANER<<<<<',
];
/** Letra chica (≈1 mm de alto en la credencial real). */
const LETRA_CHICA = 'CLAVE DE ELECTOR PRSNES90010109H100  ·  SECCION 0000  ·  DOCUMENTO DE PRUEBA SIN VALIDEZ';

const MONO = existsSync('C:/Windows/Fonts/consola.ttf')
  ? (GlobalFonts.registerFromPath('C:/Windows/Fonts/consola.ttf', 'MonoPrueba'), 'MonoPrueba')
  : 'monospace';

/** Cajas (en fracción de la credencial) de cada renglón de la MRZ y de la letra chica. */
export interface Caja {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

function fondoSeguridad(ctx: SKRSContext2D, matiz: string) {
  const g = ctx.createLinearGradient(0, 0, ANCHO, ALTO);
  g.addColorStop(0, '#f3e6ee');
  g.addColorStop(1, matiz);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, ANCHO, ALTO);
  // Guilloches: líneas finas onduladas como las de una credencial.
  ctx.strokeStyle = 'rgba(150, 90, 130, 0.18)';
  ctx.lineWidth = 1.2;
  for (let k = 0; k < 28; k++) {
    ctx.beginPath();
    for (let x = 0; x <= ANCHO; x += 8) {
      const y = 40 + k * 34 + 14 * Math.sin(x / 55 + k);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function anverso(): ImagenRGBA {
  const c = createCanvas(ANCHO, ALTO);
  const ctx = c.getContext('2d');
  fondoSeguridad(ctx, '#dfe9f3');
  ctx.fillStyle = '#7a1f4a';
  ctx.font = 'bold 52px sans-serif';
  ctx.fillText('CREDENCIAL DE PRUEBA', 520, 110);
  ctx.font = '30px sans-serif';
  ctx.fillText('DOCUMENTO SINTÉTICO — SIN VALIDEZ OFICIAL', 520, 160);
  // "Foto": figura gris sobre fondo claro.
  ctx.fillStyle = '#e9edf1';
  ctx.fillRect(70, 220, 380, 480);
  ctx.fillStyle = '#6b7380';
  ctx.beginPath();
  ctx.ellipse(260, 400, 105, 130, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(140, 540, 240, 160);
  // Datos.
  ctx.fillStyle = '#333';
  const campos: Array<[string, string]> = [
    ['NOMBRE', 'PRUEBA SINTÉTICA ESCÁNER'],
    ['FECHA DE NACIMIENTO', '01/01/1990'],
    ['DOMICILIO', 'C. FICTICIA 123, COL. CENTRO'],
    ['AÑO DE REGISTRO', '2015 01'],
    ['EMISIÓN', '2024'],
    ['VIGENCIA', '2024 - 2034'],
  ];
  campos.forEach(([e, v], i) => {
    const y = 260 + i * 92;
    ctx.font = '24px sans-serif';
    ctx.fillStyle = '#7a1f4a';
    ctx.fillText(e, 520, y);
    ctx.font = 'bold 36px sans-serif';
    ctx.fillStyle = '#1a1a1a';
    ctx.fillText(v, 520, y + 40);
  });
  // Sello en color.
  ctx.strokeStyle = '#b8282f';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(1380, 800, 110, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(184, 40, 47, 0.85)';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText('SELLO', 1335, 810);
  return aImagen(ctx);
}

async function reverso(): Promise<{ img: ImagenRGBA; cajasMrz: Caja[]; cajaLetraChica: Caja }> {
  const c = createCanvas(ANCHO, ALTO);
  const ctx = c.getContext('2d');
  fondoSeguridad(ctx, '#e8e0f0');
  // QR.
  const qr = QRCode.create(QR_TEXTO, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const modulo = 10;
  const x0 = 90;
  const y0 = 90;
  ctx.fillStyle = '#fff';
  ctx.fillRect(x0 - 4 * modulo, y0 - 4 * modulo, (n + 8) * modulo, (n + 8) * modulo);
  ctx.fillStyle = '#000';
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) if (qr.modules.get(x, y)) ctx.fillRect(x0 + x * modulo, y0 + y * modulo, modulo, modulo);
  ctx.fillStyle = '#333';
  ctx.font = '30px sans-serif';
  ctx.fillText('Credencial sintética para pruebas del escáner.', 520, 140);

  // Letra chica (~22 px de alto a 1600 px de ancho ≈ 1.2 mm).
  ctx.font = `22px ${MONO}`;
  const yChica = 520;
  ctx.fillText(LETRA_CHICA, 70, yChica);
  const anchoChica = ctx.measureText(LETRA_CHICA).width;
  const cajaLetraChica: Caja = { u0: 60 / ANCHO, v0: (yChica - 22) / ALTO, u1: (80 + anchoChica) / ANCHO, v1: (yChica + 8) / ALTO };

  // MRZ: 30 caracteres de ancho completo, fuente monoespaciada.
  const cajasMrz: Caja[] = [];
  ctx.fillStyle = '#000';
  ctx.font = `50px ${MONO}`;
  MRZ.forEach((linea, i) => {
    const y = 760 + i * 82;
    ctx.fillText(linea, 70, y);
    const w = ctx.measureText(linea).width;
    cajasMrz.push({ u0: 62 / ANCHO, v0: (y - 46) / ALTO, u1: (78 + w) / ANCHO, v1: (y + 14) / ALTO });
  });
  return { img: aImagen(ctx), cajasMrz, cajaLetraChica };
}

function aImagen(ctx: SKRSContext2D): ImagenRGBA {
  const d = ctx.getImageData(0, 0, ANCHO, ALTO);
  return { width: d.width, height: d.height, data: new Uint8ClampedArray(d.data) };
}

/** "Foto" de la credencial: perspectiva, mesa oscura, sombra lateral y ruido. */
function fotografiar(card: ImagenRGBA, esquinas: Cuadrilatero, semilla: number): ImagenRGBA {
  const W = 2400;
  const H = 1800;
  const foto = crearImagen(W, H);
  const aCard = calcularHomografia(esquinas, [
    { x: 0, y: 0 },
    { x: card.width, y: 0 },
    { x: card.width, y: card.height },
    { x: 0, y: card.height },
  ]);
  let s = semilla;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = aplicarHomografia(aCard, { x: x + 0.5, y: y + 0.5 });
      let r: number, g: number, b: number;
      if (p.x >= 0 && p.y >= 0 && p.x < card.width - 1 && p.y < card.height - 1) {
        const x0 = Math.floor(p.x), y0 = Math.floor(p.y), dx = p.x - x0, dy = p.y - y0; // prettier-ignore
        const at = (xx: number, yy: number, k: number) => card.data[(yy * card.width + xx) * 4 + k];
        const bil = (k: number) =>
          (at(x0, y0, k) * (1 - dx) + at(x0 + 1, y0, k) * dx) * (1 - dy) +
          (at(x0, y0 + 1, k) * (1 - dx) + at(x0 + 1, y0 + 1, k) * dx) * dy;
        r = bil(0);
        g = bil(1);
        b = bil(2);
      } else {
        const veta = 10 * Math.sin(y / 9 + Math.sin(x / 50) * 2);
        r = 78 + veta;
        g = 56 + veta;
        b = 40 + veta;
      }
      // Sombra (mano/celular) que oscurece la izquierda hasta 45%.
      const sombra = 0.55 + 0.45 * Math.min(1, x / (W * 0.7));
      const ruido = (rnd() - 0.5) * 14;
      const j = (y * W + x) * 4;
      foto.data[j] = r * sombra + ruido;
      foto.data[j + 1] = g * sombra + ruido;
      foto.data[j + 2] = b * sombra + ruido;
      foto.data[j + 3] = 255;
    }
  }
  return foto;
}

/** Codificador JPEG equivalente al canvas del navegador (reducción + calidad). */
async function codificar(p: ImagenRGBA, calidad: number, escala: number): Promise<Uint8Array> {
  const base = createCanvas(p.width, p.height);
  const bctx = base.getContext('2d');
  const id = bctx.createImageData(p.width, p.height);
  id.data.set(p.data);
  bctx.putImageData(id, 0, 0);
  const w = Math.max(1, Math.round(p.width * escala));
  const h = Math.max(1, Math.round(p.height * escala));
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(base, 0, 0, w, h);
  return new Uint8Array(await c.encode('jpeg', Math.round(calidad * 100)));
}

async function main() {
  mkdirSync(SALIDA, { recursive: true });
  const frente = anverso();
  const { img: atras, cajasMrz, cajaLetraChica } = await reverso();

  // Esquinas reales en las fotos (en ángulo).
  const esquinasFrente: Cuadrilatero = [
    { x: 330, y: 260 },
    { x: 2080, y: 360 },
    { x: 2010, y: 1520 },
    { x: 260, y: 1420 },
  ];
  const esquinasAtras: Cuadrilatero = [
    { x: 300, y: 330 },
    { x: 2060, y: 250 },
    { x: 2120, y: 1440 },
    { x: 350, y: 1530 },
  ];
  const fotos = [fotografiar(frente, esquinasFrente, 7), fotografiar(atras, esquinasAtras, 11)];

  // Escáner: detección automática (como en el celular).
  const detectadas = fotos.map((f) => detectarBordes(f));
  detectadas.forEach((d, i) => {
    const real = i === 0 ? esquinasFrente : esquinasAtras;
    const error = Math.max(...d.esquinas.map((p, k) => Math.hypot(p.x - real[k].x, p.y - real[k].y)));
    console.log(`página ${i + 1}: confianza ${d.confianza.toFixed(2)}, respaldo ${d.respaldo}, error máx ${error.toFixed(1)} px`);
    if (d.respaldo || error > 2400 * 0.02) throw new Error('La detección no encontró la credencial sintética.');
  });

  const variantes: Array<{ nombre: string; esquinas: Cuadrilatero[]; objetivo: number }> = [
    // Flujo normal: esquinas detectadas y configuración por defecto.
    { nombre: 'ine-sintetica.pdf', esquinas: detectadas.map((d) => d.esquinas), objetivo: CONFIG_ESCANER.tamanoObjetivoBytes },
    // Peor caso de la compresión adaptativa (calidad mínima y lado mínimo legible). Con las
    // esquinas reales, para poder comparar la MRZ contra la credencial original píxel a píxel.
    { nombre: 'ine-sintetica-compresion-maxima.pdf', esquinas: [esquinasFrente, esquinasAtras], objetivo: 50 * 1024 },
  ];

  const meta: Record<string, unknown> = { qr: QR_TEXTO, mrz: MRZ, cajasMrz, cajaLetraChica, letraChica: LETRA_CHICA, variantes: {} };
  for (const v of variantes) {
    const paginas = fotos.map((f, i) => mejorarImagen(corregirPerspectiva(f, v.esquinas[i], CONFIG_ESCANER.ladoMaxSalida), 'color'));
    const r = await comprimirPaginas(paginas, codificar, { ...CONFIG_ESCANER, tamanoObjetivoBytes: v.objetivo });
    const pdf = await generarPdf(
      r.jpgs.map((jpg, i) => ({ jpg, anchoPx: paginas[i].width, altoPx: paginas[i].height })),
      { dpi: CONFIG_ESCANER.dpiPdf, titulo: 'INE (escaneo)' },
    );
    writeFileSync(join(SALIDA, v.nombre), pdf);
    (meta.variantes as Record<string, unknown>)[v.nombre] = {
      bytes: pdf.byteLength,
      calidad: r.calidad,
      escalas: r.escalas,
      ladoPaginas: paginas.map((p, i) => Math.round(Math.max(p.width, p.height) * r.escalas[i])),
    };
    console.log(`${v.nombre}: ${(pdf.byteLength / 1024).toFixed(0)} KB, calidad ${r.calidad}, escalas ${r.escalas.map((e) => e.toFixed(2)).join('/')}`);
  }

  // Reverso original (referencia para medir la legibilidad de la MRZ).
  const ref = createCanvas(ANCHO, ALTO);
  const rctx = ref.getContext('2d');
  const rid = rctx.createImageData(ANCHO, ALTO);
  rid.data.set(atras.data);
  rctx.putImageData(rid, 0, 0);
  writeFileSync(join(SALIDA, 'reverso-original.png'), await ref.encode('png'));
  writeFileSync(join(SALIDA, 'ine-sintetica.json'), JSON.stringify(meta, null, 2) + '\n');
  console.log(`Listo: ${SALIDA}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
