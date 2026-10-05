/**
 * Zona de lectura mecánica (MRZ, ICAO 9303): la fecha de vencimiento en
 * formato AAMMDD, protegida por un dígito verificador.
 *
 * - TD3 (pasaporte) y MRV-A/MRV-B (visas): 2 líneas de 44 o 36 caracteres;
 *   en la 2.ª línea, nacimiento en 13-18 y vencimiento en 21-26 (+ dígito 27).
 * - TD1 (credenciales, p. ej. reverso de la INE): 3 líneas de 30; en la 2.ª,
 *   nacimiento en 0-5 y vencimiento en 8-13 (+ dígito 14).
 *
 * El vencimiento siempre es 20xx. La fecha de nacimiento se ignora. Si el
 * dígito verificador no coincide (error de lectura), no se devuelve nada.
 */

export interface LecturaMrz {
  /** AAAA-MM-DD */
  vencimiento: string;
  formato: 'TD3' | 'TD1';
  /** Línea de la MRZ de donde salió (evidencia). */
  linea: string;
}

const VALOR: Record<string, number> = Object.fromEntries<number>([
  ['<', 0],
  ...'0123456789'.split('').map((c, i): [string, number] => [c, i]),
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    .split('')
    .map((c, i): [string, number] => [c, i + 10]),
]);

/** Dígito verificador ICAO (pesos 7, 3, 1). */
export function digitoVerificador(campo: string): number {
  const pesos = [7, 3, 1];
  let suma = 0;
  for (let i = 0; i < campo.length; i++) {
    suma += (VALOR[campo[i]] ?? 0) * pesos[i % 3];
  }
  return suma % 10;
}

function fechaVencimiento(aammdd: string, digito: string): string | null {
  if (!/^\d{6}$/.test(aammdd) || !/^\d$/.test(digito)) return null;
  if (digitoVerificador(aammdd) !== +digito) return null;
  const y = 2000 + +aammdd.slice(0, 2);
  const m = +aammdd.slice(2, 4);
  const d = +aammdd.slice(4, 6);
  const f = new Date(Date.UTC(y, m - 1, d));
  if (f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** 2.ª línea de TD3/MRV: documento, nacionalidad, nacimiento, sexo, vencimiento. */
const LINEA2_TD3 = /^[A-Z0-9<]{9}[0-9<][A-Z<]{3}\d{6}\d[MFX<]\d{6}\d/;
/** 2.ª línea de TD1: nacimiento, sexo, vencimiento, nacionalidad. */
const LINEA2_TD1 = /^\d{6}\d[MFX<]\d{6}\d[A-Z<]{3}/;

/** Líneas candidatas: mayúsculas, sin espacios, solo [A-Z0-9<]. */
function lineasMrz(texto: string): string[] {
  return texto
    .toUpperCase()
    .replace(/[«‹]/g, '<')
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ''))
    .filter((l) => /^[A-Z0-9<]{28,46}$/.test(l) && l.includes('<'));
}

/**
 * Busca una MRZ en el texto (capa de texto del PDF o literal del modelo).
 * Acepta también solo la línea con las fechas.
 */
export function leerMrz(texto: string | null | undefined): LecturaMrz | null {
  if (!texto) return null;
  for (const linea of lineasMrz(texto)) {
    if (
      (linea.length === 44 || linea.length === 36) &&
      LINEA2_TD3.test(linea)
    ) {
      const venc = fechaVencimiento(linea.slice(21, 27), linea[27]);
      if (venc) return { vencimiento: venc, formato: 'TD3', linea };
    }
    if (linea.length === 30 && LINEA2_TD1.test(linea)) {
      const venc = fechaVencimiento(linea.slice(8, 14), linea[14]);
      if (venc) return { vencimiento: venc, formato: 'TD1', linea };
    }
  }
  return null;
}
