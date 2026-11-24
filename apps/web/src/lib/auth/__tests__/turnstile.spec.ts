/**
 * Turnstile en la web: sin clave de sitio no se exige ni se manda token
 * (desarrollo local); con clave, el botón espera el token y el body lo lleva
 * como `turnstileToken`. Y la CSP abre challenges.cloudflare.com solo donde
 * hace falta.
 */
type ModTurnstile = typeof import('../turnstile');

function cargar(siteKey: string | undefined): ModTurnstile {
  const antes = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (siteKey === undefined) delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  else process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = siteKey;
  let mod!: ModTurnstile;
  jest.isolateModules(() => {
    mod = jest.requireActual<ModTurnstile>('../turnstile');
  });
  if (antes === undefined) delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  else process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = antes;
  return mod;
}

describe('Turnstile (web)', () => {
  it.each([undefined, '', '   '])('sin clave de sitio (%p): apagado, sin token en el body', (clave) => {
    const t = cargar(clave);
    expect(t.turnstileActivo).toBe(false);
    expect(t.faltaTokenTurnstile('')).toBe(false);
    expect(t.conTurnstile({ email: 'a@b.mx' }, '')).toEqual({ email: 'a@b.mx' });
  });

  it('con clave de sitio: el botón espera el token y el body lo lleva', () => {
    const t = cargar('1x00000000000000000000AA');
    expect(t.turnstileActivo).toBe(true);
    expect(t.faltaTokenTurnstile('')).toBe(true);
    expect(t.faltaTokenTurnstile('tok')).toBe(false);
    expect(t.conTurnstile({ email: 'a@b.mx' }, 'tok')).toEqual({
      email: 'a@b.mx',
      turnstileToken: 'tok',
    });
    expect(t.URL_SCRIPT_TURNSTILE.startsWith('https://challenges.cloudflare.com/')).toBe(true);
  });
});

describe('CSP de next.config.ts', () => {
  async function csp(): Promise<Record<string, string>> {
    const antes = { ...process.env };
    Object.assign(process.env, {
      NEXT_PUBLIC_API_URL: 'https://api.ejemplo.test',
      NEXT_PUBLIC_S3_HOST: 'bucket.s3.ejemplo.test',
      NODE_ENV: 'production',
    });
    try {
      let config!: { headers: () => Promise<{ headers: { key: string; value: string }[] }[]> };
      jest.isolateModules(() => {
        config = (jest.requireActual('../../../../next.config') as { default: typeof config }).default;
      });
      const [{ headers }] = await config.headers();
      const valor = headers.find((h) => h.key === 'Content-Security-Policy')!.value;
      return Object.fromEntries(
        valor.split(';').map((d) => {
          const [nombre, ...resto] = d.trim().split(/\s+/);
          return [nombre, resto.join(' ')];
        }),
      );
    } finally {
      process.env = antes;
    }
  }

  it('permite challenges.cloudflare.com solo en script-src, frame-src y connect-src', async () => {
    const d = await csp();
    const cf = 'https://challenges.cloudflare.com';
    expect(d['script-src']).toBe(`'self' 'unsafe-inline' ${cf}`);
    expect(d['frame-src']).toBe(`'self' https://bucket.s3.ejemplo.test ${cf}`);
    expect(d['connect-src']).toBe(`'self' https://api.ejemplo.test ${cf}`);
    for (const [nombre, valor] of Object.entries(d)) {
      if (!['script-src', 'frame-src', 'connect-src'].includes(nombre)) {
        expect(valor).not.toContain('cloudflare');
      }
    }
    // El resto sigue igual que antes.
    expect(d['default-src']).toBe("'self'");
    expect(d['img-src']).toBe("'self' data: blob: https://bucket.s3.ejemplo.test");
    expect(d['object-src']).toBe("'none'");
    expect(d['frame-ancestors']).toBe("'none'");
    expect(d['form-action']).toBe("'self'");
    expect(d['script-src']).not.toContain('unsafe-eval');
  });
});
