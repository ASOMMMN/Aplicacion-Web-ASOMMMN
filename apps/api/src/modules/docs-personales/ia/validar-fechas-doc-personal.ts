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
import { leerFechaLiteral, valorGuardado } from './formatos-fecha';
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

export { leerFechaLiteral } from './formatos-fecha';

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

  // 1-2. El valor y la precisión salen SIEMPRE del texto literal, nunca de
  // lo que diga el modelo ("EMISIÓN 2016" es año aunque el modelo dé
  // 2016-01-01). Sin literal legible, la fecha se descarta.
  for (const campo of Object.keys(detalle) as CampoFecha[]) {
    const f = detalle[campo];
    if (!f.valor && !f.textoLiteral) continue;

    const lectura = leerFechaLiteral(
      f.textoLiteral,
      respuesta.formatoFechaIndicado,
    );
    if (!lectura) {
      if (f.valor) {
        const motivo = `La ${NOMBRE_CAMPO[campo]} (${f.valor}) no aparece como fecha en el texto "${f.textoLiteral ?? ''}"; se dejó vacía.`;
        marcar(campo, motivo);
        descartadas.push(motivo);
      }
      f.valor = null;
      f.precision = 'dia';
      continue;
    }

    if (
      tipo === 'INE' &&
      campo === 'fechaVencimiento' &&
      lectura.precision === 'anio'
    ) {
      // Única excepción: la vigencia de la INE (solo año) vence el 31/12
      // del último año.
      f.valor = `${Math.max(...lectura.anios)}-12-31`;
      f.precision = 'anio';
      continue;
    }

    if (lectura.precision !== 'dia') {
      // Fecha parcial: se guarda con su precisión, nunca como día.
      f.valor = valorGuardado(lectura, campo);
      f.precision = lectura.precision;
      f.confianza = minConfianza(f.confianza, 'media');
      continue;
    }

    f.precision = 'dia';
    if (f.valor && f.valor !== lectura.iso) {
      if (f.valor === lectura.invertida) {
        f.confianza = minConfianza(f.confianza, 'media');
        motivos.push(
          `Se corrigió día/mes de la ${NOMBRE_CAMPO[campo]} ("${f.textoLiteral}" se lee como dd/mm).`,
        );
      } else {
        marcar(
          campo,
          `La ${NOMBRE_CAMPO[campo]} (${f.valor}) no coincide con el texto "${f.textoLiteral}"; se usó la del texto.`,
        );
      }
    } else if (lectura.ambigua) {
      f.confianza = minConfianza(f.confianza, 'media');
    }
    f.valor = lectura.iso;
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
