import { createCanvas } from '@napi-rs/canvas';
import OpenAI, { RateLimitError } from 'openai';
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

describe('extraerFechasDocPersonal: errores 429 de OpenAI', () => {
  // Imagen sintética (sin datos reales): renglones negros sobre blanco.
  const png = (() => {
    const c = createCanvas(600, 400);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 600, 400);
    ctx.fillStyle = '#000';
    for (let y = 50; y < 350; y += 30) ctx.fillRect(50, y, 500, 12);
    return c.toBuffer('image/png');
  })();

  const error429 = (code: string) =>
    new RateLimitError(
      429,
      { code, message: code },
      code,
      new Headers({ 'retry-after': '1' }),
    );

  const clienteFalso = (fallas: Error[]) => {
    const crear = jest.fn(() => {
      const f = fallas.shift();
      return f
        ? Promise.reject(f)
        : Promise.resolve({
            choices: [{ message: { content: '{"tipoDetectado":"visa"}' } }],
            usage: { prompt_tokens: 1234, completion_tokens: 56 },
          });
    });
    return {
      crear,
      openai: { chat: { completions: { create: crear } } } as unknown as OpenAI,
    };
  };

  const base = {
    buffer: png,
    mimeType: 'image/png',
    tipo: 'visa' as const,
    apiKey: 'sk-test',
    modelo: 'gpt-4o',
    onError: () => undefined,
    dormir: () => Promise.resolve(),
  };

  it('límite por minuto: reintenta y termina bien, con tokens reales', async () => {
    const { crear, openai } = clienteFalso([
      error429('rate_limit_exceeded'),
      error429('rate_limit_exceeded'),
    ]);
    const r = await extraerFechasDocPersonal({ ...base, openai });
    expect(crear).toHaveBeenCalledTimes(3);
    expect(r.resultado.errorMensaje).toBeUndefined();
    expect(r.tokens).toMatchObject({
      entrada: 1234,
      salida: 56,
      reintentos429: 2,
    });
    expect(r.tokens!.estimadoEntrada).toBeGreaterThan(0);
    // El SDK no debe reintentar por su cuenta.
    expect((crear.mock.calls[0] as unknown[])[1]).toEqual({ maxRetries: 0 });
  });

  it('límite por minuto que no cede: error "se reintentará" clasificado', async () => {
    const { openai } = clienteFalso(
      Array.from({ length: 10 }, () => error429('rate_limit_exceeded')),
    );
    const r = await extraerFechasDocPersonal({
      ...base,
      openai,
      reintentos: { maxIntentos: 2, esperaBaseMs: 1, esperaMaxMs: 1 },
    });
    expect(r.errorOpenAI?.tipo).toBe('limite_por_minuto');
    expect(r.resultado.errorMensaje).toMatch(
      /^Límite por minuto de OpenAI: se reintentará/,
    );
  });

  it('sin saldo: un solo intento y mensaje de recarga', async () => {
    const { crear, openai } = clienteFalso([error429('insufficient_quota')]);
    const r = await extraerFechasDocPersonal({ ...base, openai });
    expect(crear).toHaveBeenCalledTimes(1);
    expect(r.errorOpenAI?.tipo).toBe('sin_saldo');
    expect(r.resultado.errorMensaje).toMatch(
      /^OpenAI sin saldo: recarga crédito/,
    );
  });
});
