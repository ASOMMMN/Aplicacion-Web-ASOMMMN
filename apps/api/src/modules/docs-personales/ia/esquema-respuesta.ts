/**
 * Esquema JSON estricto (Structured Outputs) de la respuesta del modelo.
 *
 * Con `strict: true` el modelo solo puede devolver exactamente esta forma:
 * todos los campos presentes, enums cerrados y null donde no hay dato. Así
 * no hay JSON inválido ni campos con formatos inventados, y la respuesta
 * varía menos entre corridas. La validación en código sigue aplicándose.
 */
import { TIPOS_DOC_PERSONAL } from '../constants/tipos-doc-personal';
import type { TipoDocumentoIa } from './tipos-documento-ia';

const textoONulo = (description: string) => ({
  type: ['string', 'null'],
  description,
});

const FECHA = {
  type: 'object',
  additionalProperties: false,
  required: ['valor', 'textoLiteral', 'etiqueta', 'confianza', 'precision'],
  properties: {
    valor: textoONulo('AAAA-MM-DD, o null si la fecha no aparece.'),
    textoLiteral: textoONulo(
      'Copia exacta del fragmento del documento con la fecha.',
    ),
    etiqueta: textoONulo('Etiqueta que acompaña a la fecha en el documento.'),
    confianza: { type: 'string', enum: ['alta', 'media', 'baja'] },
    precision: { type: 'string', enum: ['dia', 'mes', 'anio'] },
  },
} as const;

/** Campos extra de cursos y certificaciones (tipo "curso"). */
const CAMPOS_CURSO = {
  nombreCurso: textoONulo(
    'Nombre oficial del curso o certificación, del cuerpo del documento.',
  ),
  institucion: textoONulo('Institución o centro que expide el documento.'),
  fechaFinCurso: FECHA,
} as const;

export const NOMBRE_ESQUEMA = 'fechas_documento';

/** Esquema para el tipo indicado (los cursos agregan nombre, institución y fin). */
export function esquemaRespuesta(
  tipo: TipoDocumentoIa,
): Record<string, unknown> {
  const esCurso = tipo === 'curso';
  const properties: Record<string, unknown> = {
    tipoDetectado: {
      type: 'string',
      enum: [...TIPOS_DOC_PERSONAL, 'curso', 'otro'],
      description: 'Qué documento es según su contenido.',
    },
    confianzaTipo: {
      type: 'string',
      enum: ['alta', 'media', 'baja'],
      description: 'Qué tan seguro es el tipo detectado.',
    },
    formatoFechaIndicado: {
      type: ['string', 'null'],
      enum: ['dd/mm/aaaa', 'mm/dd/aaaa', null],
      description:
        'Solo si el documento declara por escrito el formato de sus fechas; si no, null.',
    },
    fechaEmision: FECHA,
    fechaInicio: FECHA,
    fechaVencimiento: FECHA,
    ...(esCurso ? CAMPOS_CURSO : {}),
  };
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  };
}

/** response_format de Chat Completions. */
export const formatoChat = (tipo: TipoDocumentoIa) => ({
  type: 'json_schema' as const,
  json_schema: {
    name: NOMBRE_ESQUEMA,
    strict: true,
    schema: esquemaRespuesta(tipo),
  },
});

/** text.format de la Responses API. */
export const formatoResponses = (tipo: TipoDocumentoIa) => ({
  type: 'json_schema' as const,
  name: NOMBRE_ESQUEMA,
  strict: true,
  schema: esquemaRespuesta(tipo),
});
