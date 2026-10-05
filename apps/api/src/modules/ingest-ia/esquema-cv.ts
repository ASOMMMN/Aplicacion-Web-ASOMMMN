/**
 * Esquema JSON estricto (Structured Outputs) de la extracción del CV.
 * Todos los campos van siempre; null donde el CV no trae el dato.
 */
const texto = { type: ['string', 'null'] } as const;
const fecha = {
  type: ['string', 'null'],
  description: 'YYYY-MM-DD, o null si no aparece en el CV.',
} as const;
const confianza = { type: 'string', enum: ['alta', 'media', 'baja'] } as const;

const objeto = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const lista = (items: unknown) => ({ type: 'array', items });

export const ESQUEMA_CV = objeto({
  nombre: texto,
  apellidos: texto,
  email: texto,
  telefono: texto,
  resumen: texto,
  estudios: lista(
    objeto({
      institucion: texto,
      grado: texto,
      area: texto,
      inicio: texto,
      fin: texto,
    }),
  ),
  experienciaLaboral: lista(
    objeto({
      empresa: texto,
      puesto: texto,
      inicio: texto,
      fin: texto,
      descripcion: texto,
    }),
  ),
  cursos: lista(
    objeto({
      nombre: texto,
      institucion: texto,
      fechaInicio: fecha,
      fechaEmision: fecha,
      fechaVencimiento: fecha,
      confianza: objeto({
        fechaInicio: confianza,
        fechaEmision: confianza,
        fechaVencimiento: confianza,
      }),
    }),
  ),
  habilidades: lista({ type: 'string' }),
  idiomas: lista(objeto({ idioma: texto, nivel: texto })),
});

export const FORMATO_CV = {
  type: 'json_schema' as const,
  json_schema: { name: 'datos_cv', strict: true, schema: ESQUEMA_CV },
};
