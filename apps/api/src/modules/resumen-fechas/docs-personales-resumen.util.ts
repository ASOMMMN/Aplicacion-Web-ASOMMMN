import {
  LABEL_TIPO_DOC,
  TIPOS_DOC_PERSONAL,
  TIPOS_DOC_SIN_VENCIMIENTO,
  TipoDocPersonal,
} from '../docs-personales/constants/tipos-doc-personal';
import type { ItemBase } from './resumen-fechas.types';
import type { PrecisionFechas } from '../docs-personales/schemas/doc-personal.schema';
import {
  EstadoExtraccion,
  estadoExtraccion,
} from '../docs-personales/ia/estado-extraccion';
import {
  claveDeValor,
  resumenFuentes,
} from '../docs-personales/ia/combinar-fuentes';
import {
  PropuestaFechasIa,
  resumenPropuesta,
} from '../docs-personales/ia/cambios-analisis';
import type { Confianza } from '../docs-personales/ia/extraer-fechas-doc-personal';

export interface DocPersonalFechas {
  _id?: { toString(): string };
  tipo: TipoDocPersonal;
  nombreOriginal: string;
  subidasEn: Date | string;
  fechaInicio?: Date | string | null;
  fechaEmision?: Date | string | null;
  fechaVencimiento?: Date | string | null;
  revisarFechas?: boolean;
  motivosRevision?: string[];
  fechasVerificadas?: unknown;
  extraccionEstado?: EstadoExtraccion | null;
  precisionFechas?: PrecisionFechas;
  extraccionError?: string | null;
  analisisIa?: { error?: string } | null;
  detalleFechasIa?: unknown;
  propuestaFechasIa?: PropuestaFechasIa | null;
}

type Campo = 'fechaEmision' | 'fechaInicio' | 'fechaVencimiento';
const CAMPOS: Campo[] = ['fechaEmision', 'fechaInicio', 'fechaVencimiento'];

/** Archivos subidos con menos de esto de diferencia: el mismo documento (anverso/reverso). */
export const VENTANA_SUBIDOS_JUNTOS_MS = 15 * 60 * 1000;

const aISO = (valor: Date | string | null | undefined): string | null => {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

const aTiempo = (valor: Date | string): number => {
  const t = new Date(valor).getTime();
  return Number.isNaN(t) ? 0 : t;
};

const ORDEN_CONFIANZA: Confianza[] = ['baja', 'media', 'alta'];

/**
 * Confianza guardada de una fecha. Verificada = alta. Sin evidencia (análisis
 * anteriores a detalleFechasIa) se considera "media".
 */
function confianzaDe(doc: DocPersonalFechas, campo: Campo): Confianza {
  if (doc.fechasVerificadas) return 'alta';
  const d = doc.detalleFechasIa as
    | Partial<Record<Campo, { confianza?: Confianza }>>
    | null
    | undefined;
  const c = d?.[campo]?.confianza;
  return c && ORDEN_CONFIANZA.includes(c) ? c : 'media';
}

const tieneFechas = (d: DocPersonalFechas) => CAMPOS.some((c) => aISO(d[c]));

const clave = (d: DocPersonalFechas, c: Campo) => {
  const v = aISO(d[c]);
  return v ? claveDeValor(v, d.precisionFechas?.[c] ?? 'dia') : null;
};

const masReciente = (a: DocPersonalFechas, b: DocPersonalFechas) =>
  aTiempo(b.subidasEn) - aTiempo(a.subidasEn);

/**
 * Documento ganador de un tipo:
 * 1. Verificado por un evaluador (si hay varios, el de vencimiento más
 *    lejano; empate → el más reciente).
 * 2. El de vencimiento más lejano con confianza ≥ media.
 * 3. El más reciente que tenga alguna fecha.
 * 4. El más reciente (sin fechas: muestra su estado de extracción).
 */
export function documentoGanador(docs: DocPersonalFechas[]): DocPersonalFechas {
  const porVencimiento = (a: DocPersonalFechas, b: DocPersonalFechas) =>
    (aISO(b.fechaVencimiento) ?? '').localeCompare(
      aISO(a.fechaVencimiento) ?? '',
    ) || masReciente(a, b);

  const verificados = docs.filter((d) => d.fechasVerificadas);
  if (verificados.length) return [...verificados].sort(porVencimiento)[0];

  const confiables = docs.filter(
    (d) =>
      aISO(d.fechaVencimiento) &&
      ORDEN_CONFIANZA.indexOf(confianzaDe(d, 'fechaVencimiento')) >= 1,
  );
  if (confiables.length) return [...confiables].sort(porVencimiento)[0];

  const conFechas = docs.filter(tieneFechas);
  if (conFechas.length) return [...conFechas].sort(masReciente)[0];

  return [...docs].sort(masReciente)[0];
}

/**
 * ¿Es el mismo documento físico que el ganador? (anverso/reverso o una
 * versión del mismo archivo): mismo vencimiento, o subidos juntos sin
 * contradecir ninguna fecha. Nunca combina un pasaporte con otro.
 */
export function mismoDocumentoFisico(
  ganador: DocPersonalFechas,
  otro: DocPersonalFechas,
): boolean {
  const contradice = CAMPOS.some((c) => {
    const a = clave(ganador, c);
    const b = clave(otro, c);
    return a !== null && b !== null && a !== b;
  });
  if (contradice) return false;
  const vg = clave(ganador, 'fechaVencimiento');
  if (vg !== null && vg === clave(otro, 'fechaVencimiento')) return true;
  return (
    Math.abs(aTiempo(ganador.subidasEn) - aTiempo(otro.subidasEn)) <=
    VENTANA_SUBIDOS_JUNTOS_MS
  );
}

/**
 * Una fila por tipo de documento personal. Combina TODOS los archivos del
 * tipo sin mezclar documentos distintos: las fechas salen en bloque del
 * documento ganador, y solo los campos vacíos se completan con archivos del
 * mismo documento físico (p. ej. la emisión en el reverso de la INE). Subir
 * un reverso sin fechas ya no hace "desaparecer" las fechas del anverso.
 * Tipos sin archivos no aparecen. Orden: el de TIPOS_DOC_PERSONAL.
 */
export function resumenDocumentosPersonales(
  docs: DocPersonalFechas[],
): ItemBase[] {
  const porTipo = new Map<TipoDocPersonal, DocPersonalFechas[]>();
  for (const doc of docs) {
    porTipo.set(doc.tipo, [...(porTipo.get(doc.tipo) ?? []), doc]);
  }

  return TIPOS_DOC_PERSONAL.filter((tipo) => porTipo.has(tipo)).map((tipo) => {
    const archivos = porTipo.get(tipo)!;
    const doc = documentoGanador(archivos);
    const extraccion = estadoExtraccion(doc);

    // Campos vacíos del ganador: del mismo documento físico (más confiable
    // primero; empate → el más reciente).
    const fechas = {} as Record<Campo, string | null>;
    const precision: PrecisionFechas = { ...(doc.precisionFechas ?? {}) };
    const deOtroArchivo: Partial<
      Record<Campo, { id: string; nombre: string }>
    > = {};
    const hermanos = archivos.filter(
      (d) => d !== doc && mismoDocumentoFisico(doc, d),
    );
    for (const c of CAMPOS) {
      fechas[c] = aISO(doc[c]);
      if (fechas[c]) continue;
      const fuente = hermanos
        .filter((d) => aISO(d[c]))
        .sort(
          (a, b) =>
            Number(Boolean(b.fechasVerificadas)) -
              Number(Boolean(a.fechasVerificadas)) ||
            ORDEN_CONFIANZA.indexOf(confianzaDe(b, c)) -
              ORDEN_CONFIANZA.indexOf(confianzaDe(a, c)) ||
            masReciente(a, b),
        )[0];
      if (!fuente) continue;
      fechas[c] = aISO(fuente[c]);
      precision[c] = fuente.precisionFechas?.[c] ?? 'dia';
      if (fuente._id) {
        deOtroArchivo[c] = {
          id: fuente._id.toString(),
          nombre: fuente.nombreOriginal,
        };
      }
    }

    const fuentes = resumenFuentes(
      doc.detalleFechasIa,
      Boolean(doc.fechasVerificadas),
    );
    return {
      tipo: 'Documento personal' as const,
      nombre: LABEL_TIPO_DOC[tipo],
      detalle: doc.nombreOriginal,
      aplicaVencimiento: !TIPOS_DOC_SIN_VENCIMIENTO.includes(tipo),
      institucion: null,
      fechaInicio: fechas.fechaInicio,
      fechaEmision: fechas.fechaEmision,
      fechaVencimiento: fechas.fechaVencimiento,
      ...(doc.precisionFechas || Object.keys(deOtroArchivo).length
        ? { precisionFechas: precision }
        : {}),
      fechaVencimientoEstimada: false,
      confianzaCV: null,
      nombreEnCV: null,
      discrepancia: null,
      origen: 'doc_personal' as const,
      fuente: ['Documentos personales'],
      ...(doc._id
        ? {
            docPersonal: {
              id: doc._id.toString(),
              revisarFechas: Boolean(doc.revisarFechas),
              motivosRevision: doc.motivosRevision ?? [],
              fechasVerificadas: Boolean(doc.fechasVerificadas),
              extraccionEstado: extraccion.estado,
              extraccionError: extraccion.error,
              propuesta: resumenPropuesta(doc.propuestaFechasIa),
              archivosDelTipo: archivos.length,
              ...(Object.keys(deOtroArchivo).length
                ? { fechasDeOtroArchivo: deOtroArchivo }
                : {}),
              ...fuentes,
            },
          }
        : {}),
    };
  });
}
