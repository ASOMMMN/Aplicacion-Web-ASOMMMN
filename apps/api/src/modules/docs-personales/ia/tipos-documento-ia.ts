/**
 * Tipos que sabe leer la canalización de extracción de fechas: los
 * documentos personales y "curso" (cursos y certificaciones STCW/OMI).
 *
 * "curso" no está en TIPOS_DOC_PERSONAL a propósito: no es un documento
 * personal y no debe aparecer en esa lista ni en su esquema de Mongo.
 */
import {
  LABEL_TIPO_DOC,
  TIPOS_DOC_PERSONAL,
  TipoDocPersonal,
} from '../constants/tipos-doc-personal';

export type TipoDocumentoIa = TipoDocPersonal | 'curso';

export const TIPOS_DOCUMENTO_IA: readonly TipoDocumentoIa[] = [
  ...TIPOS_DOC_PERSONAL,
  'curso',
];

export const esTipoDocumentoIa = (v: unknown): v is TipoDocumentoIa =>
  typeof v === 'string' &&
  (TIPOS_DOCUMENTO_IA as readonly string[]).includes(v);

/** Etiqueta legible del tipo (para prompts y mensajes). */
export const etiquetaTipoIa = (tipo: TipoDocumentoIa): string =>
  tipo === 'curso' ? 'Curso o certificación' : LABEL_TIPO_DOC[tipo];
