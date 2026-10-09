/**
 * Elige, de las fechas de un texto literal, la que corresponde a un campo.
 *
 * El modelo a veces copia un fragmento con varias fechas ("del 01/02/2023 al
 * 01/02/2028", "EMISIÓN 2021 VIGENCIA 2031"). Antes se tomaba la primera y
 * se descartaba el valor correcto del modelo. Orden de decisión:
 *
 * 1. MRZ (vencimiento): la fecha protegida por el dígito verificador.
 * 2. Rango con etiqueta de vigencia ("vigencia del X al Y", "valid from X
 *    to Y"): inicio = X, vencimiento = Y. Un rango sin etiqueta de vigencia
 *    (periodo de impartición) da el inicio, nunca el vencimiento.
 * 3. El valor del modelo coincide con una de las fechas (o con su lectura
 *    día/mes invertida): se usa esa fecha.
 * 4. La fecha más cercana a una etiqueta del campo.
 * 5. Una sola fecha: esa.
 * 6. Sin resolver: la más probable (vencimiento → la más tardía; emisión e
 *    inicio → la más temprana), marcada como dudosa.
 *
 * Módulo puro.
 */
import type { CampoFecha } from './extraer-fechas-doc-personal';
import {
  expandirNumerosEnLetras,
  FechaLeida,
  leerFechasLiteral,
  normalizarTexto,
  valorGuardado,
} from './formatos-fecha';
import { leerMrz } from './mrz';

export type MotivoEleccion =
  | 'mrz'
  | 'rango'
  | 'modelo'
  | 'modelo_invertido'
  | 'etiqueta'
  | 'unica'
  | 'mas_probable';

export interface EleccionFecha {
  fecha: FechaLeida;
  motivo: MotivoEleccion;
  /** Varias fechas y ninguna regla las distinguió: confianza baja y Revisar. */
  dudosa: boolean;
  /** Todas las fechas legibles del literal. */
  candidatas: FechaLeida[];
  /** Fin del periodo cuando el literal es un rango (vigencia o impartición). */
  finRango?: FechaLeida;
  /** El rango lleva etiqueta de vigencia. */
  rangoEsVigencia?: boolean;
}

/** Etiquetas por campo para medir cercanía (sobre texto normalizado). */
const ETIQUETAS_CAMPO: Record<CampoFecha, RegExp> = {
  fechaVencimiento:
    /vencimiento|vence\b|vigencia|vigente|expira|expiry|expiration|expires|caducidad|valid(?:o|a)? (?:hasta|until|thru|through)|valid until|hasta/g,
  fechaEmision:
    /emision|emitid[oa]|expedicion|expedid[oa]|se expide|issue|issued|issuance|otorgamiento|dictamen|refrendo|vacunacion|inscripcion/g,
  fechaInicio:
    /inicio|start|valid(?:o|a)? desde|vigente desde|valid from|desde|\bdel\b|\bfrom\b/g,
};

const VIGENCIA = /vigencia|vigente|valid|validez|vence|vencimiento|expir|caduc/;
const INICIO_RANGO =
  /(?:\bdel|\bdesde|\bfrom|\bde|vigencia|valid(?:o|a|ez)?|validity)\s*:?\s*$/;
const UNION_RANGO = /^\s*(?:al|a|hasta|to|through|until|thru|-|–)\s*$/;

const coincideValor = (f: FechaLeida, campo: CampoFecha, valor: string) =>
  f.iso === valor || valorGuardado(f, campo) === valor;

/** Rango "X al Y" dentro del literal (dos fechas seguidas unidas por "al"/"to"). */
function buscarRango(
  t: string,
  fechas: FechaLeida[],
): { desde: FechaLeida; hasta: FechaLeida } | null {
  for (let i = 0; i + 1 < fechas.length; i++) {
    const [x, y] = [fechas[i], fechas[i + 1]];
    if (!UNION_RANGO.test(t.slice(x.fin, y.ini))) continue;
    const antes = t.slice(Math.max(0, x.ini - 30), x.ini);
    // "2021 - 2031" ya es un solo rango de años; aquí se pide "del/desde/from".
    if (
      INICIO_RANGO.test(antes) ||
      /\b(?:al|to|hasta)\b/.test(t.slice(x.fin, y.ini))
    ) {
      return { desde: x, hasta: y };
    }
  }
  return null;
}

/** Distancia de la fecha a la etiqueta del campo más cercana que la precede. */
function distanciaEtiqueta(
  t: string,
  campo: CampoFecha,
  f: FechaLeida,
): number {
  let mejor = Infinity;
  for (const m of t.matchAll(new RegExp(ETIQUETAS_CAMPO[campo].source, 'g'))) {
    const finEtiqueta = m.index + m[0].length;
    if (finEtiqueta > f.ini) continue;
    // Otra etiqueta (de otro campo) en medio: esta fecha no es de este campo.
    const entre = t.slice(finEtiqueta, f.ini);
    const otra = (Object.keys(ETIQUETAS_CAMPO) as CampoFecha[]).some(
      (c) => c !== campo && new RegExp(ETIQUETAS_CAMPO[c].source).test(entre),
    );
    if (!otra) mejor = Math.min(mejor, f.ini - finEtiqueta);
  }
  return mejor;
}

export interface OpcionesEleccion {
  valorModelo?: string | null;
  /** Formato numérico comprobado en el documento (no el del modelo). */
  formato?: string | null;
  /** Etiqueta que reportó el modelo (cuenta para saber si es vigencia). */
  etiquetaModelo?: string | null;
}

export function elegirFechaDelLiteral(
  literal: string | null | undefined,
  campo: CampoFecha,
  opciones: OpcionesEleccion = {},
): EleccionFecha | null {
  if (!literal) return null;
  const { valorModelo, formato, etiquetaModelo } = opciones;

  if (campo === 'fechaVencimiento') {
    const mrz = leerMrz(literal);
    if (mrz) {
      const [y, m, d] = mrz.vencimiento.split('-').map(Number);
      const fecha: FechaLeida = { precision: 'dia', anio: y, mes: m, dia: d, iso: mrz.vencimiento, invertida: null, ambigua: false, anios: [y], ini: 0, fin: 0 }; // prettier-ignore
      return { fecha, motivo: 'mrz', dudosa: false, candidatas: [fecha] };
    }
  }

  // Mismo texto que usa internamente leerFechasLiteral: si el literal trae
  // un número en letras ("veinticuatro de mayo de dos mil diecisiete"), su
  // longitud cambia al convertirlo a dígitos y las posiciones ini/fin de
  // las fechas ya no corresponderían a normalizarTexto(literal) a secas.
  const t = expandirNumerosEnLetras(normalizarTexto(literal));
  let candidatas = leerFechasLiteral(literal, formato);
  if (candidatas.length === 0) return null;
  const todas = candidatas;

  const rango = buscarRango(t, candidatas);
  const rangoEsVigencia = Boolean(
    rango &&
    VIGENCIA.test(
      `${t.slice(0, rango.desde.ini)} ${normalizarTexto(etiquetaModelo ?? '')}`,
    ),
  );
  const extra = rango ? { finRango: rango.hasta, rangoEsVigencia } : {};

  if (rango) {
    if (campo === 'fechaInicio') {
      return {
        fecha: rango.desde,
        motivo: 'rango',
        dudosa: false,
        candidatas: todas,
        ...extra,
      };
    }
    if (campo === 'fechaVencimiento') {
      if (rangoEsVigencia) {
        return {
          fecha: rango.hasta,
          motivo: 'rango',
          dudosa: false,
          candidatas: todas,
          ...extra,
        };
      }
      // Periodo de impartición: ninguna de sus fechas es el vencimiento.
      candidatas = candidatas.filter(
        (f) => f !== rango.desde && f !== rango.hasta,
      );
      if (candidatas.length === 0) return null;
    }
  }

  if (valorModelo) {
    const exacta = candidatas.find((f) => coincideValor(f, campo, valorModelo));
    if (exacta) {
      return {
        fecha: exacta,
        motivo: 'modelo',
        dudosa: false,
        candidatas: todas,
        ...extra,
      };
    }
    const invertida = candidatas.find((f) => f.invertida === valorModelo);
    if (invertida) {
      return {
        fecha: invertida,
        motivo: 'modelo_invertido',
        dudosa: false,
        candidatas: todas,
        ...extra,
      };
    }
  }

  if (candidatas.length === 1) {
    return {
      fecha: candidatas[0],
      motivo: 'unica',
      dudosa: false,
      candidatas: todas,
      ...extra,
    };
  }

  const distancias = candidatas.map((f) => distanciaEtiqueta(t, campo, f));
  const minima = Math.min(...distancias);
  if (
    Number.isFinite(minima) &&
    distancias.filter((d) => d === minima).length === 1
  ) {
    return {
      fecha: candidatas[distancias.indexOf(minima)],
      motivo: 'etiqueta',
      dudosa: false,
      candidatas: todas,
      ...extra,
    };
  }

  const orden = [...candidatas].sort((a, b) =>
    valorGuardado(a, campo).localeCompare(valorGuardado(b, campo)),
  );
  return {
    fecha: campo === 'fechaVencimiento' ? orden[orden.length - 1] : orden[0],
    motivo: 'mas_probable',
    dudosa: true,
    candidatas: todas,
    ...extra,
  };
}
