import { AuthenticationError, RateLimitError } from 'openai';
import {
  calcularEspera,
  clasificarErrorOpenAI,
  CONFIG_REINTENTOS_POR_DEFECTO,
  conReintentosOpenAI,
  esperaDeHeaders,
  tokensImagen,
} from './openai-errores.util';

const error429 = (code: string, headers: Record<string, string> = {}) =>
  new RateLimitError(
    429,
    {
      code,
      message: code,
      type: code === 'insufficient_quota' ? code : 'requests',
    },
    code,
    new Headers(headers),
  );

describe('clasificarErrorOpenAI', () => {
  it('429 insufficient_quota → sin saldo (no se reintenta)', () => {
    const e = clasificarErrorOpenAI(error429('insufficient_quota'));
    expect(e.tipo).toBe('sin_saldo');
    expect(e.mensaje).toMatch(/^OpenAI sin saldo: recarga crédito/);
  });

  it('429 rate_limit_exceeded → límite por minuto, con retry-after', () => {
    const e = clasificarErrorOpenAI(
      error429('rate_limit_exceeded', { 'retry-after': '7' }),
    );
    expect(e.tipo).toBe('limite_por_minuto');
    expect(e.esperaMs).toBe(7000);
    expect(e.mensaje).toMatch(/^Límite por minuto de OpenAI: se reintentará/);
  });

  it('401 → key inválida', () => {
    const e = clasificarErrorOpenAI(
      new AuthenticationError(
        401,
        { message: 'bad key' },
        'bad key',
        new Headers(),
      ),
    );
    expect(e.tipo).toBe('key_invalida');
  });

  it('error de fetch directo (Responses API) con el mismo formato', () => {
    const e = clasificarErrorOpenAI({
      status: 429,
      code: 'insufficient_quota',
      headers: new Headers(),
      message: 'x',
    });
    expect(e.tipo).toBe('sin_saldo');
  });
});

describe('esperas', () => {
  it('retry-after-ms tiene prioridad; retry-after en segundos o fecha', () => {
    expect(
      esperaDeHeaders(
        new Headers({ 'retry-after-ms': '1500', 'retry-after': '9' }),
      ),
    ).toBe(1500);
    expect(esperaDeHeaders(new Headers({ 'retry-after': '2' }))).toBe(2000);
    const ahora = Date.parse('2026-09-30T12:00:00Z');
    expect(
      esperaDeHeaders(
        new Headers({ 'retry-after': 'Wed, 30 Sep 2026 12:00:05 GMT' }),
        ahora,
      ),
    ).toBe(5000);
    expect(esperaDeHeaders(new Headers())).toBeNull();
  });

  it('exponencial con tope si OpenAI no sugiere espera', () => {
    const cfg = { maxIntentos: 5, esperaBaseMs: 1000, esperaMaxMs: 5000 };
    const sinAzar = () => 0.5;
    expect(calcularEspera(1, cfg, null, sinAzar)).toBe(1000);
    expect(calcularEspera(2, cfg, null, sinAzar)).toBe(2000);
    expect(calcularEspera(4, cfg, null, sinAzar)).toBe(5000);
    expect(calcularEspera(1, cfg, 3000, sinAzar)).toBe(3250);
  });
});

describe('conReintentosOpenAI', () => {
  const cfg = { ...CONFIG_REINTENTOS_POR_DEFECTO, maxIntentos: 3 };
  const sinEspera = () => Promise.resolve();

  it('reintenta el límite por minuto y termina bien', async () => {
    let n = 0;
    const esperas: number[] = [];
    const r = await conReintentosOpenAI(
      () =>
        ++n < 3
          ? Promise.reject(
              error429('rate_limit_exceeded', { 'retry-after': '1' }),
            )
          : Promise.resolve('ok'),
      cfg,
      (_e, ms) => esperas.push(ms),
      sinEspera,
    );
    expect(r).toBe('ok');
    expect(n).toBe(3);
    expect(esperas).toEqual([1250, 1250]);
  });

  it('se rinde tras el máximo de intentos', async () => {
    let n = 0;
    await expect(
      conReintentosOpenAI(
        () => (n++, Promise.reject(error429('rate_limit_exceeded'))),
        cfg,
        undefined,
        sinEspera,
      ),
    ).rejects.toBeInstanceOf(RateLimitError);
    expect(n).toBe(3);
  });

  it('sin saldo NO se reintenta', async () => {
    let n = 0;
    await expect(
      conReintentosOpenAI(
        () => (n++, Promise.reject(error429('insufficient_quota'))),
        cfg,
        undefined,
        sinEspera,
      ),
    ).rejects.toBeInstanceOf(RateLimitError);
    expect(n).toBe(1);
  });
});

describe('tokensImagen (fórmula publicada por OpenAI)', () => {
  it('gpt-4o: 85 + 170 por tile de 512 tras ajustar a 768 de lado corto', () => {
    // 1483×861 → 1323×768 → 3×2 tiles
    expect(tokensImagen('gpt-4o', 1483, 861, 'high')).toBe(85 + 170 * 6);
    expect(tokensImagen('gpt-4o', 1024, 918, 'low')).toBe(85);
  });

  it('gpt-4o-mini cobra ~33× más por imagen', () => {
    expect(tokensImagen('gpt-4o-mini', 1483, 861, 'high')).toBe(
      2833 + 5667 * 6,
    );
  });
});
