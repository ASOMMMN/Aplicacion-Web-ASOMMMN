import {
  LABEL_TIPO_DOC,
  TIPOS_DOC_PERSONAL,
  TIPOS_DOC_SIN_VENCIMIENTO,
  TipoDocPersonal,
} from '../docs-personales/constants/tipos-doc-personal';
import type { ItemBase } from './resumen-fechas.types';

export interface DocPersonalFechas {
  tipo: TipoDocPersonal;
  nombreOriginal: string;
  subidasEn: Date | string;
  fechaInicio?: Date | string | null;
  fechaEmision?: Date | string | null;
  fechaVencimiento?: Date | string | null;
}

const aISO = (valor: Date | string | null | undefined): string | null => {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

const aTiempo = (valor: Date | string): number => {
  const t = new Date(valor).getTime();
  return Number.isNaN(t) ? 0 : t;
};

/**
 * Una fila por tipo de documento personal, con la etiqueta del tipo y las
 * fechas del archivo más reciente (por subidasEn). Tipos sin archivos no
 * aparecen. Orden: el de TIPOS_DOC_PERSONAL.
 */
export function resumenDocumentosPersonales(
  docs: DocPersonalFechas[],
): ItemBase[] {
  const masReciente = new Map<TipoDocPersonal, DocPersonalFechas>();
  for (const doc of docs) {
    const previo = masReciente.get(doc.tipo);
    if (!previo || aTiempo(doc.subidasEn) > aTiempo(previo.subidasEn)) {
      masReciente.set(doc.tipo, doc);
    }
  }

  return TIPOS_DOC_PERSONAL.filter((tipo) => masReciente.has(tipo)).map(
    (tipo) => {
      const doc = masReciente.get(tipo)!;
      return {
        tipo: 'Documento personal' as const,
        nombre: LABEL_TIPO_DOC[tipo],
        detalle: doc.nombreOriginal,
        aplicaVencimiento: !TIPOS_DOC_SIN_VENCIMIENTO.includes(tipo),
        institucion: null,
        fechaInicio: aISO(doc.fechaInicio),
        fechaEmision: aISO(doc.fechaEmision),
        fechaVencimiento: aISO(doc.fechaVencimiento),
        fechaVencimientoEstimada: false,
        confianzaCV: null,
        nombreEnCV: null,
        discrepancia: null,
        origen: 'doc_personal' as const,
        fuente: ['Documentos personales'],
      };
    },
  );
}
