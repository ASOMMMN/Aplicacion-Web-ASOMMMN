/**
 * Preparación de imágenes de documentos para el modelo de visión.
 *
 * Problema que resuelve: OpenAI reduce toda imagen a 768 px de lado corto
 * (detail "high"). Una hoja carta escaneada con una tarjeta pequeña (refrendo,
 * libreta, INE) llega con dígitos de ~7 px y el modelo inventa fechas. Aquí:
 *
 * 1. Se recortan los márgenes blancos (por densidad de tinta, así las motas
 *    del escáner no cuentan).
 * 2. Se corrige una rotación de 90° (texto vertical) con el perfil de
 *    proyección. La orientación EXIF de fotos de celular ya la aplica
 *    @napi-rs/canvas al decodificar.
 * 3. Se divide en bloques separados por franjas en blanco (p. ej. dos
 *    tarjetas escaneadas en una hoja) y los bloques altos en bandas con
 *    traslape, para que ninguna parte se reduzca de más.
 * 4. Cada parte se envía como JPEG de lado mayor ≤ 2048 px (lo que OpenAI
 *    acepta sin reducir); si hay varias, primero va una vista general.
 *
 * Solo usa @napi-rs/canvas (binario precompilado; sin paquetes del sistema).
 * Memoria: una página a 3200 px de ancho ocupa ~55 MB en RGBA; se procesa
 * una página a la vez.
 */
import { Canvas, createCanvas, Image, loadImage } from '@napi-rs/canvas';

export interface OpcionesPreparacion {
  /** Máximo de partes (sin contar la vista general) por página. */
  maxPartes: number;
  /** Lado mayor máximo de cada imagen enviada. */
  ladoMaxPx: number;
  /** Rotación extra en grados horarios (la sugiere un intento anterior). */
  rotacionExtra?: 0 | 90 | 180 | 270;
  /**
   * Multiplica el alto de cada banda: < 1 = bandas más bajas, más ampliadas
   * y con cortes en otros renglones (lecturas 2 y 3).
   */
  factorBanda?: number;
  /** Vista general en detalle "high" (página completa legible). */
  vistaGeneralAlta?: boolean;
}

export const OPCIONES_PREPARACION_POR_DEFECTO: OpcionesPreparacion = {
  maxPartes: 6,
  ladoMaxPx: 2048,
};

/**
 * Preparaciones distintas del mismo documento para la doble lectura:
 * - normal: la de siempre.
 * - alterna: página completa en detalle alto + bandas más bajas (otros
 *   cortes y más ampliación).
 * - desempate: bandas aún más bajas (máxima ampliación de los dígitos).
 */
export type VariantePreparacion = 'normal' | 'alterna' | 'desempate';

export const AJUSTES_VARIANTE: Record<
  VariantePreparacion,
  Pick<OpcionesPreparacion, 'factorBanda' | 'vistaGeneralAlta'> & {
    /** Multiplica maxPartes para que las bandas más bajas no se descarten. */
    factorPartes: number;
  }
> = {
  normal: { factorBanda: 1, vistaGeneralAlta: false, factorPartes: 1 },
  alterna: { factorBanda: 0.7, vistaGeneralAlta: true, factorPartes: 1.5 },
  desempate: { factorBanda: 0.5, vistaGeneralAlta: false, factorPartes: 2 },
};

/** OpenAI (detail "high") reduce cada imagen a 768 px de lado corto. */
export const LADO_CORTO_OPENAI = 768;

export interface ImagenPreparada {
  dataUrl: string;
  ancho: number;
  alto: number;
  pagina: number;
  /** 0 = vista general de la página; 1..n = parte. */
  parte: number;
  partes: number;
  /** Rotación aplicada en grados horarios. */
  rotacion: number;
  /** Detalle con que se envía a OpenAI (por defecto: general "low", partes "high"). */
  detalle?: 'low' | 'high';
}

interface Caja {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Tamaño de la copia reducida con la que se analiza la tinta. */
const LADO_ANALISIS = 600;

/** Máscara de tinta (1 = oscuro) de una copia reducida de la imagen. */
export function mascaraTinta(
  fuente: Image | Canvas,
  anchoFuente: number,
  altoFuente: number,
): { tinta: Uint8Array; w: number; h: number; escala: number } {
  const escala = Math.min(1, LADO_ANALISIS / Math.max(anchoFuente, altoFuente));
  const w = Math.max(1, Math.round(anchoFuente * escala));
  const h = Math.max(1, Math.round(altoFuente * escala));
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(fuente, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;

  // Umbral relativo al fondo: escaneos grises o fotos con poca luz.
  const lum = new Uint8Array(w * h);
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < w * h; i++) {
    const v = Math.round(
      0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2],
    );
    lum[i] = v;
    hist[v]++;
  }
  let acumulado = 0;
  let fondo = 255;
  for (let v = 255; v >= 0; v--) {
    acumulado += hist[v];
    if (acumulado >= w * h * 0.5) {
      fondo = v;
      break;
    }
  }
  const umbral = Math.min(170, fondo - 60);
  const tinta = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) tinta[i] = lum[i] < umbral ? 1 : 0;
  return { tinta, w, h, escala };
}

/**
 * Caja con tinta: filas/columnas con al menos `minFraccion` de píxeles
 * oscuros (1.5 %: una mota del escáner no alcanza, un renglón sí).
 */
export function cajaConTinta(
  tinta: Uint8Array,
  w: number,
  h: number,
  minFraccion = 0.015,
): Caja | null {
  const filas = new Array<number>(h).fill(0);
  const cols = new Array<number>(w).fill(0);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (tinta[y * w + x]) {
        filas[y]++;
        cols[x]++;
      }
  // Tramos de filas/columnas con tinta (tolerando huecos cortos). Los tramos
  // muy angostos (≤ 1 %: el borde oscuro del escáner, una línea suelta) no
  // cuentan para el recorte.
  const rango = (a: number[], min: number): [number, number] | null => {
    const hueco = Math.max(2, Math.round(a.length * 0.02));
    const tramos: Array<[number, number]> = [];
    let ini = -1;
    let ultimo = -1;
    a.forEach((v, i) => {
      if (v < min) return;
      if (ini < 0 || i - ultimo > hueco) {
        if (ini >= 0) tramos.push([ini, ultimo]);
        ini = i;
      }
      ultimo = i;
    });
    if (ini >= 0) tramos.push([ini, ultimo]);
    const utiles = tramos.filter(([i, f]) => f - i + 1 > a.length * 0.01);
    if (utiles.length === 0) return null;
    return [utiles[0][0], utiles[utiles.length - 1][1]];
  };
  const ry = rango(filas, Math.max(1, w * minFraccion));
  const rx = rango(cols, Math.max(1, h * minFraccion));
  if (!ry || !rx) return null;
  return { x: rx[0], y: ry[0], w: rx[1] - rx[0] + 1, h: ry[1] - ry[0] + 1 };
}

/**
 * El texto horizontal produce un perfil de filas muy irregular (líneas y
 * espacios) y uno de columnas parejo; si es al revés, está girado 90°.
 */
export function pareceGirado90(
  tinta: Uint8Array,
  w: number,
  caja: Caja,
): boolean {
  const filas = new Array<number>(caja.h).fill(0);
  const cols = new Array<number>(caja.w).fill(0);
  let total = 0;
  for (let y = 0; y < caja.h; y++)
    for (let x = 0; x < caja.w; x++)
      if (tinta[(caja.y + y) * w + caja.x + x]) {
        filas[y]++;
        cols[x]++;
        total++;
      }
  if (total < caja.w * caja.h * 0.01) return false; // casi sin texto
  // Variación normalizada (coeficiente de variación) de cada perfil.
  const cv = (a: number[]) => {
    const m = a.reduce((s, v) => s + v, 0) / a.length;
    if (m === 0) return 0;
    const varianza = a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length;
    return Math.sqrt(varianza) / m;
  };
  return cv(cols) > cv(filas) * 1.6;
}

/**
 * Bloques separados por franjas horizontales en blanco (≥ 1.5 % del alto),
 * p. ej. dos tarjetas escaneadas en una misma hoja.
 */
export function separarBloques(
  tinta: Uint8Array,
  w: number,
  caja: Caja,
): Array<{ y: number; h: number }> {
  const vacia = (y: number) => {
    let n = 0;
    for (let x = caja.x; x < caja.x + caja.w; x++) n += tinta[y * w + x];
    return n < caja.w * 0.004;
  };
  // Un hueco separa documentos solo si es mucho mayor que el espacio entre
  // renglones (mediana de los huecos) y que el 2.5 % del alto.
  const huecos: number[] = [];
  let run = 0;
  for (let y = caja.y; y < caja.y + caja.h; y++) {
    if (vacia(y)) run++;
    else if (run > 0) {
      huecos.push(run);
      run = 0;
    }
  }
  huecos.sort((a, b) => a - b);
  const mediana = huecos.length ? huecos[Math.floor(huecos.length / 2)] : 0;
  const minHueco = Math.max(3, Math.round(caja.h * 0.025), mediana * 3);
  const bloques: Array<{ y: number; h: number }> = [];
  let ini = caja.y;
  let hueco = 0;
  for (let y = caja.y; y < caja.y + caja.h; y++) {
    if (vacia(y)) {
      hueco++;
      continue;
    }
    if (hueco >= minHueco && y - hueco > ini) {
      bloques.push({ y: ini, h: y - hueco - ini });
      ini = y;
    }
    hueco = 0;
  }
  bloques.push({ y: ini, h: caja.y + caja.h - ini });

  // Bloques diminutos (una línea suelta, un sello) se unen al vecino.
  const minAlto = caja.h * 0.06;
  const unidos: Array<{ y: number; h: number }> = [];
  for (const b of bloques) {
    const prev = unidos[unidos.length - 1];
    if (prev && (b.h < minAlto || prev.h < minAlto)) {
      prev.h = b.y + b.h - prev.y;
    } else unidos.push({ ...b });
  }
  return unidos;
}

/**
 * Bandas con traslape del 10 % para que ninguna línea quede cortada.
 *
 * El alto de cada banda es el que OpenAI no reduce: tras escalar la banda a
 * `ladoMax` de ancho, su alto debe quedar en ~768 px (lado corto).
 * Con un bloque de 2400 px → bandas de 900 px; con uno de 1000 px → 768 px.
 */
export function dividirEnBandas(
  y: number,
  h: number,
  anchoBloque: number,
  opciones: { anchoRealPx?: number; ladoMax?: number; factor?: number } = {},
): Array<{ y: number; h: number }> {
  // anchoRealPx: ancho del bloque en la imagen original (si y/h/anchoBloque
  // vienen de la copia reducida de análisis).
  const ladoMax =
    opciones.ladoMax ?? OPCIONES_PREPARACION_POR_DEFECTO.ladoMaxPx;
  const real = opciones.anchoRealPx ?? anchoBloque;
  const proporcion = Math.max(
    LADO_CORTO_OPENAI / ladoMax,
    LADO_CORTO_OPENAI / Math.min(real, ladoMax),
  );
  const altoBanda = Math.max(
    1,
    Math.round(anchoBloque * proporcion * (opciones.factor ?? 1)),
  );
  if (h <= altoBanda * 1.15) return [{ y, h }];
  const n = Math.ceil((h - altoBanda * 0.1) / (altoBanda * 0.9));
  const paso = (h - altoBanda) / (n - 1);
  return Array.from({ length: n }, (_, i) => ({
    y: Math.round(y + i * paso),
    h: altoBanda,
  }));
}

function recortar(
  fuente: Image | Canvas,
  caja: Caja,
  ladoMax: number,
  rotacion: number,
): Canvas {
  const esc = Math.min(1, ladoMax / Math.max(caja.w, caja.h));
  const w = Math.max(1, Math.round(caja.w * esc));
  const h = Math.max(1, Math.round(caja.h * esc));
  const girar = rotacion === 90 || rotacion === 270;
  const c = createCanvas(girar ? h : w, girar ? w : h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((rotacion * Math.PI) / 180);
  ctx.drawImage(fuente, caja.x, caja.y, caja.w, caja.h, -w / 2, -h / 2, w, h);
  return c;
}

const aDataUrl = (c: Canvas) =>
  `data:image/jpeg;base64,${c.toBuffer('image/jpeg', 90).toString('base64')}`;

/**
 * Prepara una página (o foto) decodificada: recorte, rotación y partes.
 * Devuelve la vista general (si hay más de una parte) y las partes.
 */
export function prepararPagina(
  fuente: Image | Canvas,
  pagina: number,
  opciones: OpcionesPreparacion = OPCIONES_PREPARACION_POR_DEFECTO,
): ImagenPreparada[] {
  const W = fuente.width;
  const H = fuente.height;
  const { tinta, w, h, escala } = mascaraTinta(fuente, W, H);
  const cajaA = cajaConTinta(tinta, w, h) ?? { x: 0, y: 0, w, h };

  // Margen de 1.5 % alrededor del contenido, en coordenadas de la original.
  const m = Math.round(Math.max(w, h) * 0.015);
  const aOriginal = (c: Caja): Caja => {
    const x = Math.max(0, (c.x - m) / escala);
    const y = Math.max(0, (c.y - m) / escala);
    return {
      x: Math.round(x),
      y: Math.round(y),
      w: Math.round(Math.min(W - x, (c.w + 2 * m) / escala)),
      h: Math.round(Math.min(H - y, (c.h + 2 * m) / escala)),
    };
  };

  const girado = pareceGirado90(tinta, w, cajaA);
  const rotacion = ((girado ? 90 : 0) + (opciones.rotacionExtra ?? 0)) % 360;
  const cajaPagina = aOriginal(cajaA);

  // Con rotación de 90/270 las "filas" son columnas: se envía la página
  // completa recortada en bandas del lado largo; con 0/180 se separan bloques.
  const partes: Caja[] = [];
  if (rotacion === 0 || rotacion === 180) {
    for (const b of separarBloques(tinta, w, cajaA)) {
      for (const banda of dividirEnBandas(b.y, b.h, cajaA.w, {
        anchoRealPx: cajaA.w / escala,
        ladoMax: opciones.ladoMaxPx,
        factor: opciones.factorBanda,
      })) {
        partes.push(
          aOriginal({ x: cajaA.x, y: banda.y, w: cajaA.w, h: banda.h }),
        );
      }
    }
  } else {
    partes.push(cajaPagina);
  }

  // Demasiadas partes: se usa la página recortada completa.
  const finales = partes.length > opciones.maxPartes ? [cajaPagina] : partes;

  const resultado: ImagenPreparada[] = [];
  const agregar = (c: Canvas, parte: number, detalle?: 'low' | 'high') =>
    resultado.push({
      dataUrl: aDataUrl(c),
      ancho: c.width,
      alto: c.height,
      pagina,
      parte,
      partes: finales.length,
      rotacion,
      ...(detalle ? { detalle } : {}),
    });

  if (finales.length > 1 || opciones.vistaGeneralAlta) {
    // Vista general: el modelo ve qué parte es de qué documento. En la
    // variante "alterna" va completa y en detalle alto (otra lectura).
    if (opciones.vistaGeneralAlta) {
      agregar(
        recortar(fuente, cajaPagina, opciones.ladoMaxPx, rotacion),
        0,
        'high',
      );
    } else {
      agregar(recortar(fuente, cajaPagina, 1024, rotacion), 0);
    }
  }
  finales.forEach((c, i) =>
    agregar(recortar(fuente, c, opciones.ladoMaxPx, rotacion), i + 1),
  );
  return resultado;
}

/** Decodifica una imagen (aplica EXIF) y la prepara. */
export async function prepararImagenArchivo(
  buffer: Buffer,
  pagina: number,
  opciones?: OpcionesPreparacion,
): Promise<ImagenPreparada[]> {
  return prepararPagina(await loadImage(buffer), pagina, opciones);
}
