import { calcularEstadoVigencia, hoyISO } from './vigencia.util';

describe('calcularEstadoVigencia', () => {
  const HOY = '2026-09-29';

  it('sin fecha de vencimiento → sin_fecha', () => {
    expect(calcularEstadoVigencia(null, HOY)).toEqual({
      estadoVigencia: 'sin_fecha',
      diasParaVencer: null,
    });
    expect(calcularEstadoVigencia(undefined, HOY).estadoVigencia).toBe(
      'sin_fecha',
    );
    expect(calcularEstadoVigencia('no-es-fecha', HOY).estadoVigencia).toBe(
      'sin_fecha',
    );
  });

  it('venció ayer → vencido con días negativos', () => {
    expect(calcularEstadoVigencia('2026-09-28', HOY)).toEqual({
      estadoVigencia: 'vencido',
      diasParaVencer: -1,
    });
  });

  it('vence hoy → sigue vigente hoy (por vencer)', () => {
    expect(calcularEstadoVigencia('2026-09-29', HOY)).toEqual({
      estadoVigencia: 'por_vencer',
      diasParaVencer: 0,
    });
  });

  it('justo en el umbral de 6 meses → por_vencer; un día después → vigente', () => {
    expect(calcularEstadoVigencia('2027-03-29', HOY).estadoVigencia).toBe(
      'por_vencer',
    );
    expect(calcularEstadoVigencia('2027-03-30', HOY).estadoVigencia).toBe(
      'vigente',
    );
  });

  it('umbral respeta fin de mes (31-ago + 6 meses = 28-feb)', () => {
    expect(
      calcularEstadoVigencia('2027-02-28', '2026-08-31').estadoVigencia,
    ).toBe('por_vencer');
    expect(
      calcularEstadoVigencia('2027-03-01', '2026-08-31').estadoVigencia,
    ).toBe('vigente');
  });

  it('acepta un umbral distinto', () => {
    expect(calcularEstadoVigencia('2026-12-01', HOY, 1).estadoVigencia).toBe(
      'vigente',
    );
  });
});

describe('hoyISO', () => {
  it('usa la fecha de México, no la UTC', () => {
    // 2026-09-30 03:00 UTC = 2026-09-29 21:00 en Ciudad de México
    expect(hoyISO(new Date('2026-09-30T03:00:00Z'))).toBe('2026-09-29');
  });
});
