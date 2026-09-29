import {
  extraerFechasDocPersonal,
  normalizarConfianza,
  normalizarFechaIa,
} from './extraer-fechas-doc-personal';

describe('normalizarFechaIa', () => {
  it('acepta YYYY-MM-DD de calendario válido', () => {
    expect(normalizarFechaIa('2031-01-15')).toBe('2031-01-15');
    expect(normalizarFechaIa(' 2024-02-29 ')).toBe('2024-02-29');
  });

  it('rechaza formatos distintos y fechas imposibles', () => {
    expect(normalizarFechaIa('15/01/2031')).toBeNull();
    expect(normalizarFechaIa('2023-02-29')).toBeNull();
    expect(normalizarFechaIa(null)).toBeNull();
    expect(normalizarFechaIa(20310115)).toBeNull();
  });
});

describe('normalizarConfianza', () => {
  it('solo alta|media|baja; lo demás → baja', () => {
    expect(normalizarConfianza('alta')).toBe('alta');
    expect(normalizarConfianza('ALTA')).toBe('baja');
    expect(normalizarConfianza(undefined)).toBe('baja');
  });
});

describe('extraerFechasDocPersonal (sin llamar a OpenAI)', () => {
  const base = {
    buffer: Buffer.from('x'),
    mimeType: 'image/png',
    tipo: 'pasaporte' as const,
    apiKey: 'sk-test',
    modelo: 'gpt-4o-mini',
  };

  it('sin API key → iaDisponible false', async () => {
    const { resultado, origen } = await extraerFechasDocPersonal({
      ...base,
      apiKey: '',
    });
    expect(resultado.iaDisponible).toBe(false);
    expect(resultado.fechaVencimiento).toBeNull();
    expect(origen).toBeUndefined();
  });

  it('archivo vacío → error sin llamar al modelo', async () => {
    const { resultado } = await extraerFechasDocPersonal({
      ...base,
      buffer: Buffer.alloc(0),
    });
    expect(resultado.errorMensaje).toBe('El archivo está vacío.');
  });

  it('formato no soportado → error sin llamar al modelo', async () => {
    const { resultado } = await extraerFechasDocPersonal({
      ...base,
      mimeType: 'application/msword',
    });
    expect(resultado.iaDisponible).toBe(true);
    expect(resultado.errorMensaje).toMatch(/no compatible/);
  });
});
