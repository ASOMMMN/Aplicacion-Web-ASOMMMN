/**
 * Tipos que sabe leer la canalización de extracción de fechas: los
 * documentos personales y "curso" (cursos y certificaciones STCW/OMI).
 *
 * "curso" no está en TIPOS_DOC_PERSONAL a propósito: no es un documento
 * personal y no debe aparecer en esa lista ni en su esquema de Mongo.
 */
import {
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
