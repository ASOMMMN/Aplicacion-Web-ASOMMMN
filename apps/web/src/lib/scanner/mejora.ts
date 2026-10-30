/**
 * Mejora de la página ya enderezada:
 *  1. Iluminación: se estima el "papel" (cierre morfológico de la luminancia
 *     a baja resolución + desenfoque) y se divide entre él. Quita sombras y
 *     luz despareja sin cambiar la proporción entre canales, así que el
 *     color de fotos, hologramas y sellos se conserva.
 *  2. Contraste: estiramiento por percentiles (punto negro y blanco).
 *  3. Nitidez: máscara de enfoque sobre la luminancia.
 *  4. Modo: color, gris, o blanco y negro con umbral adaptativo (Sauvola).
 */
import {
  ampliarPlano,
  cerrar,
  crearImagen,
  desenfocarCaja,
  luminancia,
  percentil,
  reducirPlano,
  type Plano,
} from './imagen';
import type { ImagenRGBA, ModoMejora } from './tipos';

interface AjustesModo {
  /** Ganancia máxima de la corrección de iluminación (limita el "lavado" de fotos oscuras). */
  gananciaMax: number;
  /** Punto negro máximo del estiramiento (más alto = negros más profundos, fotos más duras). */
  negroMax: number;
  /** Intensidad de la máscara de enfoque. */
  nitidez: number;
}

export const AJUSTES_MEJORA: Record<ModoMejora, AjustesModo> = {
  color: { gananciaMax: 2.3, negroMax: 40, nitidez: 0.5 },
  gris: { gananciaMax: 2.5, negroMax: 60, nitidez: 0.7 },
  bn: { gananciaMax: 3, negroMax: 80, nitidez: 0 },
};

/** Luminancia objetivo del papel tras corregir la iluminación. */
const BLANCO_PAPEL = 245;
/** Resolución a la que se estima la iluminación. */
const LADO_FONDO = 256;

export function mejorarImagen(img: ImagenRGBA, modo: ModoMejora): ImagenRGBA {
  const aj = AJUSTES_MEJORA[modo];
  const { width: w, height: h } = img;
  const lum = luminancia(img);

  // 1. Ganancia por píxel = papel objetivo / iluminación estimada.
  const fondo = estimarFondo(lum);
  const ganancia = new Float32Array(w * h);
  for (let i = 0; i < ganancia.length; i++) {
    const g = BLANCO_PAPEL / Math.max(1, fondo.data[i]);
    ganancia[i] = Math.max(0.9, Math.min(aj.gananciaMax, g));
  }
  const corregida = new Float32Array(w * h);
  for (let i = 0; i < corregida.length; i++) {
    corregida[i] = Math.min(255, lum.data[i] * ganancia[i]);
  }
  const planoCorregido: Plano = { width: w, height: h, data: corregida };

  // 2. Estiramiento de contraste.
  const negro = Math.min(aj.negroMax, percentil(planoCorregido, 0.005));
  const blanco = Math.max(negro + 40, Math.min(252, percentil(planoCorregido, 0.98)));
  const escala = 255 / (blanco - negro);
  const estirar = (v: number) => (v - negro) * escala;

  // 3. Nitidez: detalle = luminancia − su versión desenfocada.
  const detalle = new Float32Array(w * h);
  if (aj.nitidez > 0) {
    const borrosa = desenfocarCaja(planoCorregido, 1);
    for (let i = 0; i < detalle.length; i++) {
      detalle[i] = aj.nitidez * (corregida[i] - borrosa.data[i]) * escala;
    }
  }

  if (modo === 'bn') return binarizar(planoCorregido);

  const out = crearImagen(w, h);
  const src = img.data;
  const dst = out.data;
  for (let i = 0, j = 0; i < corregida.length; i++, j += 4) {
    if (modo === 'gris') {
      const v = estirar(corregida[i]) + detalle[i];
      dst[j] = dst[j + 1] = dst[j + 2] = v;
    } else {
      const g = ganancia[i];
      dst[j] = estirar(Math.min(255, src[j] * g)) + detalle[i];
      dst[j + 1] = estirar(Math.min(255, src[j + 1] * g)) + detalle[i];
      dst[j + 2] = estirar(Math.min(255, src[j + 2] * g)) + detalle[i];
    }
    dst[j + 3] = 255;
  }
  return out;
}

/**
 * Iluminación del papel: a baja resolución, el cierre (máximo y luego
 * mínimo) borra el texto y los trazos, que son oscuros y delgados; el
 * desenfoque suaviza. Se amplía de vuelta al tamaño original.
 */
export function estimarFondo(lum: Plano): Plano {
  const { plano: chico } = reducirPlano(lum, LADO_FONDO);
  const lado = Math.max(chico.width, chico.height);
  // Ventana amplia (~12% del lado): cubre texto y trazos, y buena parte de
  // una foto de credencial (que suele tener fondo claro), para no "lavarla".
  const radio = Math.max(2, Math.round(lado * 0.06));
  const suave = desenfocarCaja(cerrar(chico, radio), Math.max(1, Math.round(radio * 0.75)));
  return ampliarPlano(suave, lum.width, lum.height);
}

/** Sauvola: umbral local = media · (1 + k · (desviación / R − 1)). */
const SAUVOLA_K = 0.25;
const SAUVOLA_R = 128;

function binarizar(p: Plano): ImagenRGBA {
  const { width: w, height: h, data } = p;
  const radio = Math.max(7, Math.round(Math.max(w, h) / 80));
  const cuadrados = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) cuadrados[i] = data[i] * data[i];
  const media = desenfocarCaja(p, radio).data;
  const mediaCuadrados = desenfocarCaja({ width: w, height: h, data: cuadrados }, radio).data;
  const out = crearImagen(w, h);
  const dst = out.data;
  for (let i = 0, j = 0; i < data.length; i++, j += 4) {
    const m = media[i];
    const s = Math.sqrt(Math.max(0, mediaCuadrados[i] - m * m));
    const t = m * (1 + SAUVOLA_K * (s / SAUVOLA_R - 1));
    const v = data[i] > t ? 255 : 0;
    dst[j] = dst[j + 1] = dst[j + 2] = v;
    dst[j + 3] = 255;
  }
  return out;
}
