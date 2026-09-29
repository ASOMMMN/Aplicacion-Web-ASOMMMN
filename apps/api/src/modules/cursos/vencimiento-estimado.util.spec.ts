import { esVencimientoInicioMasCincoAnios } from './vencimiento-estimado.util';

describe('esVencimientoInicioMasCincoAnios', () => {
  it('detecta exactamente inicio + 5 años (Date guardado en BD)', () => {
    expect(
      esVencimientoInicioMasCincoAnios(
        new Date('2024-03-01T00:00:00.000Z'),
        new Date('2029-03-01T00:00:00.000Z'),
      ),
    ).toBe(true);
  });

  it('detecta inicio + 5 años en strings (extracción del CV)', () => {
    expect(esVencimientoInicioMasCincoAnios('2021-11-15', '2026-11-15')).toBe(
      true,
    );
  });

  it('29 de febrero + 5 años = 1 de marzo (como lo hacía setFullYear)', () => {
    expect(esVencimientoInicioMasCincoAnios('2024-02-29', '2029-03-01')).toBe(
      true,
    );
  });

  it('no marca vencimientos distintos a +5 años', () => {
    expect(esVencimientoInicioMasCincoAnios('2024-03-01', '2029-03-02')).toBe(
      false,
    );
    expect(esVencimientoInicioMasCincoAnios('2024-03-01', '2027-03-01')).toBe(
      false,
    );
  });

  it('sin alguna de las fechas → false', () => {
    expect(esVencimientoInicioMasCincoAnios(null, '2029-03-01')).toBe(false);
    expect(esVencimientoInicioMasCincoAnios('2024-03-01', undefined)).toBe(
      false,
    );
    expect(esVencimientoInicioMasCincoAnios('no-es-fecha', '2029-03-01')).toBe(
      false,
    );
  });
});
