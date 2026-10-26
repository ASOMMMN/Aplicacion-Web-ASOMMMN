/**
 * Detección de los 4 bordes del documento, en TypeScript puro (sin OpenCV:
 * la CSP no permite WASM y no queremos descargar ~9 MB).
 *
 * Sobre una copia reducida (~512 px) en luminancia:
 *  1. Cierre morfológico: borra el texto para que el documento quede como
 *     una mancha uniforme, y desenfoque.
 *  2. Candidatos por dos vías: bordes (Canny) y segmentación (Otsu, en
 *     ambos sentidos: documento claro sobre fondo oscuro y al revés). Cada
 *     componente conexo grande da un polígono convexo → cuadrilátero.
 *  3. Se elige el cuadrilátero con más "soporte": fracción de su perímetro
 *     que cae sobre un borde real de la imagen.
 *
 * Si nada convence (confianza baja), se devuelve el rectángulo con margen
 * para que el usuario ajuste las esquinas a mano.
 */
import { CONFIG_ESCANER } from './constantes';
import {
  angulosInteriores,
  areaPoligono,
  escalarCuadrilatero,
  esConvexo,
  limitarCuadrilatero,
  ordenarEsquinas,
  rectanguloRespaldo,
} from './geometria';
import { cerrar, desenfocarCaja, type Plano } from './imagen';
import type { Cuadrilatero, ImagenRGBA, Punto, ResultadoDeteccion } from './tipos';

export interface OpcionesDeteccion {
  ladoDeteccion: number;
  umbralConfianza: number;
  margenRespaldo: number;
}

const OPCIONES_POR_DEFECTO: OpcionesDeteccion = {
  ladoDeteccion: CONFIG_ESCANER.ladoDeteccion,
  umbralConfianza: CONFIG_ESCANER.umbralConfianza,
  margenRespaldo: CONFIG_ESCANER.margenRespaldo,
};

/**
 * Área mínima y máxima del documento, como fracción de la foto. El mínimo
 * evita tomar un recuadro interior (la foto de la INE) cuando el documento
 * llena el encuadre.
 */
const AREA_MIN = 0.2;
const AREA_MAX = 0.97;
const ANGULO_MIN = 40;
const ANGULO_MAX = 140;

export function detectarBordes(
  img: ImagenRGBA,
  opciones: Partial<OpcionesDeteccion> = {},
): ResultadoDeteccion {
  const op = { ...OPCIONES_POR_DEFECTO, ...opciones };
  const respaldo: ResultadoDeteccion = {
    esquinas: rectanguloRespaldo(img.width, img.height, op.margenRespaldo),
    confianza: 0,
    respaldo: true,
  };

  const { plano: gris, factor } = luminanciaReducida(img, op.ladoDeteccion);
  if (gris.width < 16 || gris.height < 16) return respaldo;

  // Radio del cierre ~1% del lado largo: mayor que un trazo de texto.
  const radio = Math.max(2, Math.round(Math.max(gris.width, gris.height) / 110));
  const suave = desenfocarCaja(desenfocarCaja(cerrar(gris, radio), 1), 1);
  const grad = gradientes(suave);

  const candidatos: Cuadrilatero[] = [];
  const bordes = canny(grad);
  for (const poligono of poligonosDeComponentes(dilatarMascara(bordes, gris.width, gris.height), gris.width, gris.height)) {
    const q = cuadrilateroDeCasco(poligono);
    if (q) candidatos.push(q);
  }
  const umbral = otsu(suave);
  for (const claro of [true, false]) {
    const mascara = new Uint8Array(suave.data.length);
    for (let i = 0; i < mascara.length; i++) {
      mascara[i] = (suave.data[i] > umbral) === claro ? 1 : 0;
    }
    for (const poligono of poligonosDeComponentes(mascara, gris.width, gris.height)) {
      const q = cuadrilateroDeCasco(poligono);
      if (q) candidatos.push(q);
    }
  }

  const areaImg = gris.width * gris.height;
  let mejor: { q: Cuadrilatero; puntaje: number } | null = null;
  for (const q of candidatos) {
    const puntaje = puntuar(q, grad, areaImg);
    if (puntaje > (mejor?.puntaje ?? 0)) mejor = { q, puntaje };
  }
  if (!mejor || mejor.puntaje < op.umbralConfianza) {
    return { ...respaldo, confianza: mejor?.puntaje ?? 0 };
  }
  return {
    esquinas: limitarCuadrilatero(
      escalarCuadrilatero(mejor.q, 1 / factor),
      img.width,
      img.height,
    ),
    confianza: mejor.puntaje,
    respaldo: false,
  };
}

/** Luminancia promediada por bloques directamente desde RGBA. */
export function luminanciaReducida(
  img: ImagenRGBA,
  ladoMax: number,
): { plano: Plano; factor: number } {
  const factor = Math.min(1, ladoMax / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * factor));
  const h = Math.max(1, Math.round(img.height * factor));
  const out = new Float32Array(w * h);
  const sx = img.width / w;
  const sy = img.height / h;
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let s = 0;
      for (let yy = y0; yy < y1; yy++) {
        let j = (yy * img.width + x0) * 4;
        for (let xx = x0; xx < x1; xx++, j += 4) {
          s += 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
        }
      }
      out[y * w + x] = s / ((y1 - y0) * (x1 - x0));
    }
  }
  return { plano: { width: w, height: h, data: out }, factor: w / img.width };
}

interface Gradientes {
  width: number;
  height: number;
  magnitud: Float32Array;
  gx: Float32Array;
  gy: Float32Array;
  /** Magnitud a partir de la cual un píxel cuenta como borde "débil". */
  umbralBajo: number;
  umbralAlto: number;
}

/** Sobel 3×3 y umbrales automáticos a partir de la distribución de magnitudes. */
function gradientes(p: Plano): Gradientes {
  const { width: w, height: h, data } = p;
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  const mag = new Float32Array(w * h);
  let max = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const a = data[i - w - 1], b = data[i - w], c = data[i - w + 1];
      const d = data[i - 1], f = data[i + 1];
      const g = data[i + w - 1], k = data[i + w], l = data[i + w + 1]; // prettier-ignore
      const sx = c + 2 * f + l - (a + 2 * d + g);
      const sy = g + 2 * k + l - (a + 2 * b + c);
      gx[i] = sx;
      gy[i] = sy;
      const m = Math.hypot(sx, sy);
      mag[i] = m;
      if (m > max) max = m;
    }
  }
  // Tras el cierre y el desenfoque casi todo es plano: los bordes del
  // documento están en la cola alta. Umbrales por percentil de una muestra,
  // con un piso relativo al máximo para fotos con poco contraste.
  const muestra: number[] = [];
  const paso = Math.max(1, Math.floor(mag.length / 20000));
  for (let i = 0; i < mag.length; i += paso) muestra.push(mag[i]);
  muestra.sort((u, v) => u - v);
  const p90 = muestra[Math.floor(muestra.length * 0.9)] ?? 0;
  const umbralAlto = Math.max(p90, max * 0.12, 8);
  return {
    width: w,
    height: h,
    magnitud: mag,
    gx,
    gy,
    umbralAlto,
    umbralBajo: umbralAlto * 0.4,
  };
}

/** Canny: supresión de no máximos + histéresis. Devuelve máscara 0/1. */
function canny(g: Gradientes): Uint8Array {
  const { width: w, height: h, magnitud: m, gx, gy } = g;
  const nms = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = m[i];
      if (v < g.umbralBajo) continue;
      const ang = Math.atan2(gy[i], gx[i]);
      // Dirección del gradiente cuantizada a 0°, 45°, 90°, 135°.
      const oct = Math.round(((ang < 0 ? ang + Math.PI : ang) * 4) / Math.PI) % 4;
      const off = oct === 0 ? 1 : oct === 1 ? w + 1 : oct === 2 ? w : w - 1;
      if (v >= m[i + off] && v >= m[i - off]) nms[i] = v;
    }
  }
  const out = new Uint8Array(w * h);
  const pila = new Int32Array(w * h);
  for (let i = 0; i < nms.length; i++) {
    if (nms[i] < g.umbralAlto || out[i]) continue;
    let tope = 0;
    pila[tope++] = i;
    out[i] = 1;
    while (tope > 0) {
      const j = pila[--tope];
      const x = j % w;
      const y = (j - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const k = yy * w + xx;
          if (!out[k] && nms[k] >= g.umbralBajo) {
            out[k] = 1;
            pila[tope++] = k;
          }
        }
      }
    }
  }
  return out;
}

/** Dilata una máscara 1 px para unir bordes casi tocándose. */
function dilatarMascara(m: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(m.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!m[y * w + x]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < w) out[yy * w + xx] = 1;
        }
      }
    }
  }
  return out;
}

/** Umbral de Otsu de un plano con valores 0–255. */
export function otsu(p: Plano): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < p.data.length; i++) {
    hist[Math.max(0, Math.min(255, Math.round(p.data[i])))]++;
  }
  const total = p.data.length;
  let sumaTotal = 0;
  for (let v = 0; v < 256; v++) sumaTotal += v * hist[v];
  let pesoFondo = 0;
  let sumaFondo = 0;
  let mejorVar = -1;
  let umbral = 127;
  for (let v = 0; v < 256; v++) {
    pesoFondo += hist[v];
    if (pesoFondo === 0) continue;
    const pesoFrente = total - pesoFondo;
    if (pesoFrente === 0) break;
    sumaFondo += v * hist[v];
    const mf = sumaFondo / pesoFondo;
    const mt = (sumaTotal - sumaFondo) / pesoFrente;
    const varEntre = pesoFondo * pesoFrente * (mf - mt) ** 2;
    if (varEntre > mejorVar) {
      mejorVar = varEntre;
      umbral = v;
    }
  }
  return umbral;
}

/** Máximo de componentes (los más grandes) que se convierten en candidatos. */
const MAX_COMPONENTES = 4;

/**
 * Componentes conexos (8-vecindad) de una máscara. Por cada uno de los más
 * grandes devuelve su casco convexo, calculado con los extremos izquierdo y
 * derecho de cada fila (bastan para el casco).
 */
function poligonosDeComponentes(
  mascara: Uint8Array,
  w: number,
  h: number,
): Punto[][] {
  const etiqueta = new Int32Array(w * h);
  const pila = new Int32Array(w * h);
  const minFila = new Int32Array(h);
  const maxFila = new Int32Array(h);
  const minimoPixeles = (w + h) / 2;
  const encontrados: { extremos: Punto[]; caja: number }[] = [];
  let siguiente = 0;

  for (let inicio = 0; inicio < mascara.length; inicio++) {
    if (!mascara[inicio] || etiqueta[inicio]) continue;
    siguiente++;
    minFila.fill(w);
    maxFila.fill(-1);
    let x0 = w, x1 = -1, y0 = h, y1 = -1, n = 0; // prettier-ignore
    let tope = 0;
    pila[tope++] = inicio;
    etiqueta[inicio] = siguiente;
    while (tope > 0) {
      const j = pila[--tope];
      const x = j % w;
      const y = (j - x) / w;
      n++;
      if (x < minFila[y]) minFila[y] = x;
      if (x > maxFila[y]) maxFila[y] = x;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const k = yy * w + xx;
          if (mascara[k] && !etiqueta[k]) {
            etiqueta[k] = siguiente;
            pila[tope++] = k;
          }
        }
      }
    }
    if (n < minimoPixeles) continue;
    const extremos: Punto[] = [];
    for (let y = y0; y <= y1; y++) {
      if (maxFila[y] < 0) continue;
      extremos.push({ x: minFila[y], y }, { x: maxFila[y], y });
    }
    encontrados.push({ extremos, caja: (x1 - x0 + 1) * (y1 - y0 + 1) });
  }

  return encontrados
    .sort((a, b) => b.caja - a.caja)
    .slice(0, MAX_COMPONENTES)
    .map((c) => cascoConvexo(c.extremos));
}

/** Casco convexo (cadena monótona de Andrew), en sentido horario en pantalla. */
export function cascoConvexo(puntos: Punto[]): Punto[] {
  const p = [...puntos].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cruz = (o: Punto, a: Punto, b: Punto) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const inferior: Punto[] = [];
  for (const q of p) {
    while (inferior.length >= 2 && cruz(inferior[inferior.length - 2], inferior[inferior.length - 1], q) <= 0) inferior.pop(); // prettier-ignore
    inferior.push(q);
  }
  const superior: Punto[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (superior.length >= 2 && cruz(superior[superior.length - 2], superior[superior.length - 1], q) <= 0) superior.pop(); // prettier-ignore
    superior.push(q);
  }
  return inferior.slice(0, -1).concat(superior.slice(0, -1));
}

/** Douglas-Peucker sobre un polígono cerrado. */
function simplificar(poligono: Punto[], epsilon: number): Punto[] {
  if (poligono.length <= 4) return poligono;
  // Partir por los dos puntos más lejanos entre sí.
  let a = 0;
  let b = 0;
  let mejor = -1;
  for (let i = 0; i < poligono.length; i++) {
    for (let j = i + 1; j < poligono.length; j++) {
      const d = (poligono[i].x - poligono[j].x) ** 2 + (poligono[i].y - poligono[j].y) ** 2;
      if (d > mejor) {
        mejor = d;
        a = i;
        b = j;
      }
    }
  }
  const tramo1 = poligono.slice(a, b + 1);
  const tramo2 = poligono.slice(b).concat(poligono.slice(0, a + 1));
  const r1 = dp(tramo1, epsilon);
  const r2 = dp(tramo2, epsilon);
  return r1.slice(0, -1).concat(r2.slice(0, -1));
}

function dp(puntos: Punto[], epsilon: number): Punto[] {
  if (puntos.length < 3) return puntos;
  const a = puntos[0];
  const b = puntos[puntos.length - 1];
  const largo = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  let indice = 0;
  let dmax = 0;
  for (let i = 1; i < puntos.length - 1; i++) {
    const p = puntos[i];
    const d = Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / largo;
    if (d > dmax) {
      dmax = d;
      indice = i;
    }
  }
  if (dmax <= epsilon) return [a, b];
  const izq = dp(puntos.slice(0, indice + 1), epsilon);
  const der = dp(puntos.slice(indice), epsilon);
  return izq.slice(0, -1).concat(der);
}

/**
 * Cuadrilátero que mejor aproxima un casco convexo: se simplifica el casco,
 * se eligen los 4 vértices de mayor área y luego se refinan las esquinas
 * intersectando rectas ajustadas a cada lado (recupera las esquinas
 * redondeadas de una credencial).
 */
export function cuadrilateroDeCasco(casco: Punto[]): Cuadrilatero | null {
  if (casco.length < 4) return null;
  let perimetro = 0;
  for (let i = 0; i < casco.length; i++) {
    const a = casco[i];
    const b = casco[(i + 1) % casco.length];
    perimetro += Math.hypot(a.x - b.x, a.y - b.y);
  }
  let eps = perimetro * 0.01;
  let simple = simplificar(casco, eps);
  while (simple.length > 16 && eps < perimetro * 0.1) {
    eps *= 1.5;
    simple = simplificar(casco, eps);
  }
  if (simple.length < 4) return null;

  // Los 4 vértices de mayor área.
  const n = simple.length;
  let mejor: [number, number, number, number] | null = null;
  let mejorArea = -1;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      for (let k = j + 1; k < n; k++)
        for (let l = k + 1; l < n; l++) {
          const area = areaPoligono([simple[i], simple[j], simple[k], simple[l]]);
          if (area > mejorArea) {
            mejorArea = area;
            mejor = [i, j, k, l];
          }
        }
  if (!mejor) return null;
  const vertices = mejor.map((i) => simple[i]);
  const refinado = refinarEsquinas(casco, vertices);
  return ordenarEsquinas(refinado ?? vertices);
}

/** Recta ajustada (mínimos cuadrados totales) a los puntos del casco entre dos vértices. */
function refinarEsquinas(casco: Punto[], vertices: Punto[]): Punto[] | null {
  const idx = vertices.map((v) => casco.findIndex((p) => p.x === v.x && p.y === v.y));
  if (idx.some((i) => i < 0)) return null;
  const rectas: { p: Punto; d: Punto }[] = [];
  for (let s = 0; s < 4; s++) {
    const a = idx[s];
    const b = idx[(s + 1) % 4];
    const tramo: Punto[] = [];
    for (let i = a; ; i = (i + 1) % casco.length) {
      tramo.push(casco[i]);
      if (i === b) break;
    }
    // Solo la parte central del lado: los extremos están en la curva de la esquina.
    const recorte = Math.floor(tramo.length * 0.2);
    const centro = tramo.length > 4 ? tramo.slice(recorte, tramo.length - recorte) : tramo;
    rectas.push(ajustarRecta(centro.length >= 2 ? centro : tramo));
  }
  const esquinas: Punto[] = [];
  for (let s = 0; s < 4; s++) {
    const r1 = rectas[(s + 3) % 4];
    const r2 = rectas[s];
    const det = r1.d.x * r2.d.y - r1.d.y * r2.d.x;
    if (Math.abs(det) < 1e-6) return null;
    const t = ((r2.p.x - r1.p.x) * r2.d.y - (r2.p.y - r1.p.y) * r2.d.x) / det;
    const c = { x: r1.p.x + t * r1.d.x, y: r1.p.y + t * r1.d.y };
    // Un refinamiento que se aleja mucho del vértice original no es confiable.
    const v = vertices[s];
    if (Math.hypot(c.x - v.x, c.y - v.y) > 0.15 * Math.sqrt(areaPoligono(vertices))) {
      return null;
    }
    esquinas.push(c);
  }
  return esquinas;
}

function ajustarRecta(puntos: Punto[]): { p: Punto; d: Punto } {
  const n = puntos.length;
  const mx = puntos.reduce((s, p) => s + p.x, 0) / n;
  const my = puntos.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0, sxy = 0, syy = 0; // prettier-ignore
  for (const p of puntos) {
    sxx += (p.x - mx) ** 2;
    sxy += (p.x - mx) * (p.y - my);
    syy += (p.y - my) ** 2;
  }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { p: { x: mx, y: my }, d: { x: Math.cos(ang), y: Math.sin(ang) } };
}

/**
 * 0–1: fracción del perímetro sobre un borde real, penalizada si el
 * cuadrilátero es demasiado pequeño/grande o tiene ángulos imposibles.
 */
function puntuar(q: Cuadrilatero, g: Gradientes, areaImg: number): number {
  if (!esConvexo(q)) return 0;
  const frac = areaPoligono(q) / areaImg;
  if (frac < AREA_MIN || frac > AREA_MAX) return 0;
  if (angulosInteriores(q).some((a) => a < ANGULO_MIN || a > ANGULO_MAX)) return 0;

  const { width: w, height: h, magnitud } = g;
  let muestras = 0;
  let conBorde = 0;
  for (let s = 0; s < 4; s++) {
    const a = q[s];
    const b = q[(s + 1) % 4];
    const largo = Math.hypot(b.x - a.x, b.y - a.y);
    const pasos = Math.max(2, Math.floor(largo / 2));
    // Normal al lado, para buscar el borde a ±2 px.
    const nx = -(b.y - a.y) / (largo || 1);
    const ny = (b.x - a.x) / (largo || 1);
    for (let t = 1; t < pasos; t++) {
      const px = a.x + ((b.x - a.x) * t) / pasos;
      const py = a.y + ((b.y - a.y) * t) / pasos;
      muestras++;
      for (let o = -2; o <= 2; o++) {
        const x = Math.round(px + nx * o);
        const y = Math.round(py + ny * o);
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        if (magnitud[y * w + x] >= g.umbralBajo) {
          conBorde++;
          break;
        }
      }
    }
  }
  const soporte = muestras ? conBorde / muestras : 0;
  // Ligera preferencia por documentos que llenan más la foto.
  return soporte * (0.85 + 0.15 * Math.min(1, frac / 0.4));
}
