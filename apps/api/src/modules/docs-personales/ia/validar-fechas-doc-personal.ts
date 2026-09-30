/**
 * Validación en código de las fechas que devuelve el modelo.
 *
 * El modelo propone; aquí se verifica contra la evidencia (texto literal)
 * y contra reglas del tipo de documento:
 * 1. Día/mes: la fecha se vuelve a leer del texto literal como dd/mm (o el
 *    formato declarado). Si el modelo invirtió día y mes, se corrige.
 * 2. INE: vigencia solo con año → 31/12 de ese año, precisión "anio".
 * 3. Orden: el vencimiento debe ser posterior a la emisión y al inicio.
 * 4. Duración plausible por tipo (RANGOS_VIGENCIA).
 * 5. Tipo sospechoso: el contenido no corresponde al tipo elegido.
 *
 * Nunca descarta una fecha por implausible: la conserva con confianza baja
 * y la marca "Revisar" para que el evaluador la confirme.
 */
import {
  TIPOS_DOC_PERSONAL,
  TipoDocPersonal,
} from '../constants/tipos-doc-personal';
import type {
  CampoFecha,
  Confianza,
  ExtraerDocPersonalIaResponse,
  FechaDetectada,
} from './extraer-fechas-doc-personal';

// ── Rangos de vigencia (vencimiento − emisión) ─────────────────────────────

export type RangoVigencia =
  | { tipo: 'maximo'; anios: number; nota?: string }
  | { tipo: 'exacto'; anios: number[]; toleranciaDias: number };

/** Aprobados; tipos sin entrada no tienen rango (no vencen o es variable). */
export const RANGOS_VIGENCIA: Partial<Record<TipoDocPersonal, RangoVigencia>> =
  {
    certificado_medico: { tipo: 'maximo', anios: 2 },
    pasaporte: { tipo: 'exacto', anios: [1, 3, 6, 10], toleranciaDias: 31 },
    visa: { tipo: 'maximo', anios: 10 },
    libreta_identidad_maritima: {
      tipo: 'maximo',
      anios: 5,
      nota: 'vigencia oficial por confirmar',
    },
    certificado_competencia: { tipo: 'maximo', anios: 5 },
    refrendo: { tipo: 'maximo', anios: 5 },
    INE: { tipo: 'maximo', anios: 11 },
  };

/** Tipos cuyo vencimiento se descarta si el modelo lo devuelve. */
const TIPOS_SIN_VENCIMIENTO_NUNCA: TipoDocPersonal[] = [
  'CURP',
  'acta_nacimiento',
];

// ── Utilidades de fecha ────────────────────────────────────────────────────

const MESES: Record<string, number> = {
  ene: 1,
  jan: 1,
  feb: 2,
  mar: 3,
  abr: 4,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  aug: 8,
  sep: 9,
  set: 9,
  oct: 10,
  nov: 11,
  dic: 12,
  dec: 12,
};

function isoValida(y: number, m: number, d: number): string | null {
  const f = new Date(Date.UTC(y, m - 1, d));
  if (
    f.getUTCFullYear() !== y ||
    f.getUTCMonth() !== m - 1 ||
    f.getUTCDate() !== d
  ) {
    return null;
  }
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const anioCompleto = (a: number) =>
  a >= 100 ? a : a <= 69 ? 2000 + a : 1900 + a;

export interface LecturaLiteral {
  /** Interpretación según el formato (dd/mm por defecto). */
  fecha: string | null;
  /** Interpretación con día y mes invertidos (solo numéricas). */
  invertida: string | null;
  /** Día y mes ≤ 12: la lectura depende del formato. */
  ambigua: boolean;
}

/**
 * Lee la primera fecha del texto literal. Numéricas: dd/mm/aaaa salvo que
 * el documento declare mm/dd. También "19 DIC 2025", "09FEB2022",
 * "19 DEC/DIC 2025".
 */
export function leerFechaLiteral(
  literal: string | null,
  formatoIndicado?: string | null,
): LecturaLiteral | null {
  if (!literal) return null;
  const t = literal.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  const num =
    /(\d{1,2})\s*[/\-.\s]\s*(\d{1,2})\s*[/\-.\s]\s*(\d{4}|\d{2})(?!\d)/.exec(t);
  if (num) {
    const a = Number(num[1]);
    const b = Number(num[2]);
    const y = anioCompleto(Number(num[3]));
    const mmdd = /^m/.test((formatoIndicado ?? '').trim().toLowerCase());
    const [d, m] = mmdd ? [b, a] : [a, b];
    return {
      fecha: isoValida(y, m, d),
      invertida: isoValida(y, d, m),
      ambigua: a <= 12 && b <= 12 && a !== b,
    };
  }

  const texto =
    /(\d{1,2})\s*[/\-.\s]?\s*([a-z]{3})[a-z]*\.?(?:\s*\/\s*[a-z]{3}[a-z]*\.?)?\s*[/\-.\s]?\s*(\d{4})/.exec(
      t,
    );
  if (texto && MESES[texto[2]]) {
    return {
      fecha: isoValida(Number(texto[3]), MESES[texto[2]], Number(texto[1])),
      invertida: null,
      ambigua: false,
    };
  }
  return null;
}

/** Años que aparecen en un literal sin fecha completa ("VIGENCIA 2021 - 2031"). */
export function aniosSueltos(literal: string | null): number[] {
  if (!literal || /\d{1,2}\s*[/\-.]\s*\d{1,2}\s*[/\-.]\s*\d{2,4}/.test(literal))
    return [];
  return [...literal.matchAll(/(?<!\d)(19|20)\d{2}(?!\d)/g)].map((m) =>
    Number(m[0]),
  );
}

const ORDEN_CONFIANZA: Confianza[] = ['baja', 'media', 'alta'];
const minConfianza = (a: Confianza, b: Confianza): Confianza =>
  ORDEN_CONFIANZA.indexOf(a) <= ORDEN_CONFIANZA.indexOf(b) ? a : b;

function sumarAnios(iso: string, anios: number): Date {
  const [y, m, d] = iso.split('-').map(Number);
  const f = new Date(Date.UTC(y + anios, m - 1, d));
  // 29-feb → 28-feb (no 1-mar)
  if (f.getUTCMonth() !== m - 1) f.setUTCDate(0);
  return f;
}

const aDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const DIA = 86_400_000;

// ── Validación ─────────────────────────────────────────────────────────────

export interface TipoSospechoso {
  tipoElegido: TipoDocPersonal;
  tipoDetectado: string;
}

export interface ResultadoValidado extends ExtraerDocPersonalIaResponse {
  /** Alguna fecha necesita confirmación del evaluador. */
  revisar: boolean;
  motivosRevision: string[];
  tipoSospechoso: TipoSospechoso | null;
  /** Fechas que el modelo propuso y la validación dejó vacías (con motivo). */
  fechasDescartadas: string[];
}

const NOMBRE_CAMPO: Record<CampoFecha, string> = {
  fechaEmision: 'emisión',
  fechaInicio: 'inicio',
  fechaVencimiento: 'vencimiento',
};

export function validarFechasDocPersonal(
  tipo: TipoDocPersonal,
  respuesta: ExtraerDocPersonalIaResponse,
  hoy: string = new Date().toISOString().slice(0, 10),
): ResultadoValidado {
  const motivos: string[] = [];
  const descartadas: string[] = [];
  const base: ResultadoValidado = {
    ...respuesta,
    revisar: false,
    motivosRevision: motivos,
    tipoSospechoso: null,
    fechasDescartadas: descartadas,
  };
  if (!respuesta.detalle || respuesta.errorMensaje) return base;

  const detalle = Object.fromEntries(
    Object.entries(respuesta.detalle).map(([k, v]) => [k, { ...v }]),
  ) as Record<CampoFecha, FechaDetectada>;
  const marcar = (
    campo: CampoFecha,
    motivo: string,
    confianza: Confianza = 'baja',
  ) => {
    detalle[campo].confianza = minConfianza(
      detalle[campo].confianza,
      confianza,
    );
    motivos.push(motivo);
  };

  // 1-2. Fecha contra su texto literal (día/mes, año suelto)
  for (const campo of Object.keys(detalle) as CampoFecha[]) {
    const f = detalle[campo];
    const anios = aniosSueltos(f.textoLiteral);

    if (tipo === 'INE' && campo === 'fechaVencimiento' && anios.length > 0) {
      // Vigencia de INE: solo año → 31/12 del último año.
      const valor = `${Math.max(...anios)}-12-31`;
      if (f.valor !== valor || f.precision !== 'anio') {
        f.valor = valor;
        f.precision = 'anio';
        f.confianza = f.confianza === 'baja' ? 'media' : f.confianza;
      }
      continue;
    }
    if (
      f.precision === 'anio' &&
      !(tipo === 'INE' && campo === 'fechaVencimiento')
    ) {
      // Solo año en otro campo/tipo: no se inventa día ni mes.
      if (f.valor) {
        const motivo = `La ${NOMBRE_CAMPO[campo]} solo indica el año; se dejó vacía.`;
        marcar(campo, motivo);
        descartadas.push(motivo);
      }
      f.valor = null;
      f.precision = 'dia';
      continue;
    }
    if (!f.valor) continue;

    const lectura = leerFechaLiteral(
      f.textoLiteral,
      respuesta.formatoFechaIndicado,
    );
    if (!lectura?.fecha) continue; // sin evidencia legible: se confía en el valor

    if (f.valor !== lectura.fecha) {
      if (f.valor === lectura.invertida) {
        f.valor = lectura.fecha;
        f.confianza = minConfianza(f.confianza, 'media');
        motivos.push(
          `Se corrigió día/mes de la ${NOMBRE_CAMPO[campo]} ("${f.textoLiteral}" se lee como dd/mm).`,
        );
      } else {
        marcar(
          campo,
          `La ${NOMBRE_CAMPO[campo]} (${f.valor}) no coincide con el texto "${f.textoLiteral}"; se usó la del texto.`,
        );
        f.valor = lectura.fecha;
      }
    } else if (lectura.ambigua && !respuesta.formatoFechaIndicado) {
      f.confianza = minConfianza(f.confianza, 'media');
    }
  }

  // Tipos que no vencen
  if (
    TIPOS_SIN_VENCIMIENTO_NUNCA.includes(tipo) &&
    detalle.fechaVencimiento.valor
  ) {
    descartadas.push(
      `Este tipo de documento no vence; se descartó el vencimiento ${detalle.fechaVencimiento.valor}.`,
    );
    detalle.fechaVencimiento = {
      ...detalle.fechaVencimiento,
      valor: null,
      confianza: 'baja',
    };
  }

  // Fechas imposibles por calendario
  for (const campo of ['fechaEmision', 'fechaInicio'] as CampoFecha[]) {
    const v = detalle[campo].valor;
    if (v && aDate(v).getTime() > aDate(hoy).getTime() + DIA) {
      marcar(campo, `La ${NOMBRE_CAMPO[campo]} (${v}) está en el futuro.`);
    }
  }

  // 3. Orden
  const venc = detalle.fechaVencimiento.valor;
  for (const campo of ['fechaEmision', 'fechaInicio'] as CampoFecha[]) {
    const v = detalle[campo].valor;
    if (venc && v && aDate(venc) <= aDate(v)) {
      marcar(
        'fechaVencimiento',
        `El vencimiento (${venc}) no es posterior a la ${NOMBRE_CAMPO[campo]} (${v}).`,
      );
      detalle[campo].confianza = 'baja';
    }
  }

  // 4. Duración plausible
  const desde = detalle.fechaEmision.valor ?? detalle.fechaInicio.valor;
  const rango = RANGOS_VIGENCIA[tipo];
  if (rango && venc && desde && aDate(venc) > aDate(desde)) {
    const fin = aDate(venc).getTime();
    const anios = (fin - aDate(desde).getTime()) / (365.25 * DIA);
    let ok: boolean;
    let esperado: string;
    if (rango.tipo === 'maximo') {
      ok = fin <= sumarAnios(desde, rango.anios).getTime() + DIA;
      esperado = `máximo ${rango.anios} años`;
    } else {
      ok = rango.anios.some(
        (n) =>
          Math.abs(fin - sumarAnios(desde, n).getTime()) <=
          rango.toleranciaDias * DIA,
      );
      esperado = `${rango.anios.join(', ')} años`;
    }
    if (!ok) {
      marcar(
        'fechaVencimiento',
        `Vigencia de ${anios.toFixed(1)} años no es plausible para este tipo (esperado ${esperado}${
          rango.tipo === 'maximo' && rango.nota ? `; ${rango.nota}` : ''
        }).`,
      );
    }
  }

  // 5. Tipo sospechoso
  const detectado = respuesta.tipoDetectado?.trim();
  const tipoSospechoso =
    detectado &&
    detectado !== tipo &&
    ([...TIPOS_DOC_PERSONAL, 'otro'] as string[]).includes(detectado)
      ? { tipoElegido: tipo, tipoDetectado: detectado }
      : null;

  return {
    ...respuesta,
    fechaEmision: detalle.fechaEmision.valor,
    fechaInicio: detalle.fechaInicio.valor,
    fechaVencimiento: detalle.fechaVencimiento.valor,
    confianza: {
      fechaEmision: detalle.fechaEmision.confianza,
      fechaInicio: detalle.fechaInicio.confianza,
      fechaVencimiento: detalle.fechaVencimiento.confianza,
    },
    detalle,
    revisar: motivos.length > 0,
    motivosRevision: motivos,
    tipoSospechoso,
    fechasDescartadas: descartadas,
  };
}
