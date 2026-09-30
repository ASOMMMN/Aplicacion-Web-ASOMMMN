/**
 * Extractor DETERMINISTA de fechas por etiqueta, sobre texto (capa de texto
 * del PDF, OCR o cadena original). Es un lector independiente de la IA: si
 * ambos coinciden, la fecha es "Coincidente".
 *
 * Reglas:
 * - Solo fechas con una etiqueta explícita delante (etiquetas.ts), en la
 *   misma línea o la siguiente, con solo separadores o la etiqueta en otro
 *   idioma entre ambas ("Fecha de emisión (Date of issue):\n11 de abril…").
 * - Nunca: encabezados/pies de impresión ("11/4/25, 15:36"), nacimiento,
 *   sellos, firmas, folios, lugar de expedición (CONTEXTO_EXCLUIDO).
 * - Si el mismo campo reaparece con otra fecha, empieza otro documento
 *   (dos tarjetas de refrendo en una hoja, varias constancias en un PDF).
 */
import type { CampoFecha } from './extraer-fechas-doc-personal';
import { CONTEXTO_EXCLUIDO, ETIQUETAS } from './etiquetas';
import {
  claveFecha,
  leerFechaLiteral,
  PrecisionFecha,
  valorGuardado,
} from './formatos-fecha';

export type FuenteLectura = 'qr' | 'texto' | 'ocr' | 'ia1' | 'ia2';

export interface LecturaFecha {
  fuente: FuenteLectura;
  campo: CampoFecha;
  /** Texto literal de la etiqueta y de la fecha, tal como aparecen. */
  etiqueta: string;
  textoLiteral: string;
  /** Valor guardado (AAAA-MM-DD) y precisión, ambos desde el literal. */
  valor: string;
  precision: PrecisionFecha;
  /** Forma canónica para comparar lecturas: "2024-05-09", "2025-04", "2016". */
  clave: string;
  pagina: number;
  /** Documento dentro del archivo (0, 1…) según el orden de aparición. */
  grupo: number;
  /** Posición en el texto (para ordenar). */
  posicion: number;
}

/** Minúsculas y sin acentos conservando la longitud (índices alineados). */
export function normalizarMismaLongitud(t: string): string {
  return t
    .split('')
    .map((c) => (c.normalize('NFD')[0] ?? c).toLowerCase())
    .join('');
}

const MES =
  '(?:ene(?:ro)?|feb(?:rero|ruary)?|mar(?:zo|ch)?|abr(?:il)?|apr(?:il)?|may(?:o)?|jun(?:io|e)?|jul(?:io|y)?|ago(?:sto)?|aug(?:ust)?|sep(?:t(?:iembre|ember)?)?|set(?:iembre)?|oct(?:ubre|ober)?|nov(?:iembre|ember)?|dic(?:iembre)?|dec(?:ember)?|jan(?:uary)?)';

/** Candidatos a fecha (sobre texto normalizado). */
const PATRONES_FECHA: RegExp[] = [
  /(?<!\d)\d{4}\s?[-/.]\s?\d{1,2}\s?[-/.]\s?\d{1,2}(?!\d)/g,
  // Después de "CLAVE:" sí; después de una hora ("15:36") no.
  /(?<![\d/.-])(?<!\d:)\d{1,2}\s?[-/.]\s?\d{1,2}\s?[-/.]\s?(?:\d{4}|\d{2})(?![\d/.:])/g,
  new RegExp(`(?<!\\d)\\d{1,2}(?:st|nd|rd|th|°|º)?\\s*(?:de\\s+|[-/.]\\s*)?${MES}\\.?(?:\\s*/\\s*${MES}\\.?)?\\s*(?:de[l]?\\s+|[-/.,]\\s*)?\\d{4}(?!\\d)`, 'g'),
  new RegExp(`\\b${MES}\\.?\\s*\\d{1,2}(?:st|nd|rd|th)?\\s*,?\\s*\\d{4}(?!\\d)`, 'g'),
  new RegExp(`\\b${MES}\\.?\\s*(?:de[l]?\\s+|[-/.,]\\s*)?\\d{4}(?!\\d)`, 'g'),
  /(?<![\d/.-])(?:19|20)\d{2}(?:\s*[-–]\s*(?:19|20)\d{2})?(?![\d/.-])/g,
]; // prettier-ignore

interface Tramo {
  ini: number;
  fin: number;
}
interface Etiqueta extends Tramo {
  campo: CampoFecha;
}

/** Quita tramos contenidos en otro más largo. */
function sinSolapes<T extends Tramo>(tramos: T[]): T[] {
  const orden = [...tramos].sort(
    (a, b) => a.ini - b.ini || b.fin - b.ini - (a.fin - a.ini),
  );
  const r: T[] = [];
  for (const t of orden) {
    const prev = r[r.length - 1];
    if (prev && t.ini < prev.fin) {
      if (t.fin - t.ini > prev.fin - prev.ini) r[r.length - 1] = t;
      continue;
    }
    r.push(t);
  }
  return r;
}

/** Entre etiqueta y fecha solo puede haber separadores o texto corto sin dígitos. */
function hueco(n: string, etiquetas: Etiqueta[], de: Etiqueta, hasta: number) {
  const entre = n.slice(de.fin, hasta);
  if (entre.length > 70) return false;
  if (/\d/.test(entre)) return false;
  if ((entre.match(/\n/g) ?? []).length > 2) return false;
  if ((entre.match(/[a-z]/g) ?? []).length > 40) return false;
  // Otra etiqueta en medio solo si es del mismo campo (la versión en inglés).
  return !etiquetas.some(
    (e) => e.ini >= de.fin && e.ini < hasta && e.campo !== de.campo,
  );
}

export function extraerPorEtiquetas(
  texto: string,
  opciones: {
    pagina: number;
    fuente: FuenteLectura;
    formatoIndicado?: string | null;
  },
): LecturaFecha[] {
  if (!texto) return [];
  const n = normalizarMismaLongitud(texto);

  const etiquetas = sinSolapes(
    ETIQUETAS.flatMap(({ campo, patron }) =>
      [...n.matchAll(new RegExp(patron.source, 'g'))].map((m) => ({
        campo,
        ini: m.index,
        fin: m.index + m[0].length,
      })),
    ),
  );
  const candidatos = sinSolapes(
    PATRONES_FECHA.flatMap((p) =>
      [...n.matchAll(new RegExp(p.source, 'g'))].flatMap((m) => {
        const fecha = leerFechaLiteral(
          texto.slice(m.index, m.index + m[0].length),
          opciones.formatoIndicado,
        );
        return fecha
          ? [{ ini: m.index, fin: m.index + m[0].length, fecha }]
          : [];
      }),
    ),
  );

  const usados = new Set<number>();
  const lecturas: Array<Omit<LecturaFecha, 'grupo'>> = [];
  for (const e of etiquetas) {
    const c = candidatos.find(
      (d) => d.ini >= e.fin && d.ini - e.fin <= 70 && !usados.has(d.ini),
    );
    if (!c || !hueco(n, etiquetas, e, c.ini)) continue;

    // Contexto: la línea de la etiqueta (y la de la fecha) no debe hablar de
    // nacimiento, impresión, sellos, lugar de expedición, etc.
    const iniLinea = n.lastIndexOf('\n', e.ini) + 1;
    const finLinea = n.indexOf('\n', c.fin);
    const contexto = n.slice(iniLinea, finLinea < 0 ? n.length : finLinea);
    if (CONTEXTO_EXCLUIDO.test(contexto)) continue;

    // Solo año: se acepta únicamente con etiqueta estilo INE ("VIGENCIA
    // 2021 - 2031", "EMISIÓN 2016"); con otra etiqueta un año suelto suele
    // ser un error de lectura ("20-08-2023" leído "2008-2023").
    if (
      c.fecha.precision === 'anio' &&
      !/^(?:vigencia|emision)$/.test(n.slice(e.ini, e.fin).trim())
    ) {
      continue;
    }
    usados.add(c.ini);
    lecturas.push({
      fuente: opciones.fuente,
      campo: e.campo,
      etiqueta: texto.slice(e.ini, e.fin).trim(),
      textoLiteral: texto.slice(c.ini, c.fin).trim(),
      valor: valorGuardado(c.fecha, e.campo),
      precision: c.fecha.precision,
      clave: claveFecha(c.fecha),
      pagina: opciones.pagina,
      posicion: c.ini,
    });
  }

  // Grupos (documentos): el mismo campo con otra fecha abre uno nuevo.
  lecturas.sort((a, b) => a.posicion - b.posicion);
  let grupo = 0;
  let actual = new Map<CampoFecha, string>();
  return lecturas.map((l) => {
    const previa = actual.get(l.campo);
    if (previa !== undefined && previa !== l.clave) {
      grupo++;
      actual = new Map();
    }
    actual.set(l.campo, l.clave);
    return { ...l, grupo };
  });
}
