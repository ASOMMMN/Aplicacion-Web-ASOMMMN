import { estadoExtraccion } from './estado-extraccion';

describe('estadoExtraccion', () => {
  it('usa el estado guardado', () => {
    expect(
      estadoExtraccion({
        extraccionEstado: 'error',
        extraccionError:
          'Error de OpenAI: sin crédito o cuota agotada (HTTP 429).',
      }),
    ).toEqual({
      estado: 'error',
      error: 'Error de OpenAI: sin crédito o cuota agotada (HTTP 429).',
    });
    expect(estadoExtraccion({ extraccionEstado: 'sin_fechas' })).toEqual({
      estado: 'sin_fechas',
      error: null,
    });
  });

  it('documentos anteriores al campo: sin análisis ni fechas → pendiente', () => {
    expect(estadoExtraccion({}).estado).toBe('pendiente');
  });

  it('documentos anteriores con fechas (flujo viejo) → ok', () => {
    expect(
      estadoExtraccion({ fechaVencimiento: new Date('2030-01-01') }).estado,
    ).toBe('ok');
  });

  it('analizado sin estado guardado: error, ok o sin_fechas', () => {
    expect(
      estadoExtraccion({ analisisIa: { error: 'PDF ilegible: x' } }),
    ).toEqual({ estado: 'error', error: 'PDF ilegible: x' });
    expect(estadoExtraccion({ analisisIa: {} }).estado).toBe('sin_fechas');
  });
});
