import { esquemaRespuesta } from './esquema-respuesta';

describe('esquemaRespuesta', () => {
  it('documento personal: sin campos de curso; todos los campos obligatorios', () => {
    const e = esquemaRespuesta('pasaporte') as {
      required: string[];
      properties: Record<string, unknown>;
      additionalProperties: boolean;
    };
    expect(e.additionalProperties).toBe(false);
    expect(e.required).toEqual(Object.keys(e.properties));
    expect(e.properties).not.toHaveProperty('nombreCurso');
    expect(e.properties.formatoFechaIndicado).toMatchObject({
      enum: ['dd/mm/aaaa', 'mm/dd/aaaa', null],
    });
  });

  it('curso: agrega nombre, institución y fin del curso', () => {
    const e = esquemaRespuesta('curso') as { required: string[] };
    expect(e.required).toEqual(
      expect.arrayContaining(['nombreCurso', 'institucion', 'fechaFinCurso']),
    );
  });
});
