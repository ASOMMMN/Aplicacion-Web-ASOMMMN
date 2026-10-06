import {
  origenVencimientoDeCurso,
  resolverVencimientoCurso,
  sumarAnios,
} from './regla-vencimiento-curso';

describe('resolverVencimientoCurso (regla de 5 años)', () => {
  it('T1: inicio 25/06/2022 sin vencimiento → 25/06/2027', () => {
    const r = resolverVencimientoCurso({ fechaInicio: '2022-06-25' });
    expect(r.fechaVencimiento).toBe('2027-06-25');
  });

  it('T2: inicio 01/02/2025 con vencimiento 31/01/2030 → 31/01/2030', () => {
    const r = resolverVencimientoCurso({
      fechaInicio: '2025-02-01',
      fechaVencimientoDocumento: '2030-01-31',
    });
    expect(r.fechaVencimiento).toBe('2030-01-31');
    expect(r.origen).toBe('DOCUMENTO');
  });

  it('T3: inicio 26/04/2024 con vencimiento 25/04/2029 → 25/04/2029 (no 26/04/2029)', () => {
    const r = resolverVencimientoCurso({
      fechaInicio: '2024-04-26',
      fechaVencimientoDocumento: '2029-04-25',
    });
    expect(r.fechaVencimiento).toBe('2029-04-25');
    expect(r.origen).toBe('DOCUMENTO');
  });

  it('T4: inicio 25/06/2022 sin vencimiento → origen CALCULADO_5_ANOS', () => {
    const r = resolverVencimientoCurso({ fechaInicio: '2022-06-25' });
    expect(r.origen).toBe('CALCULADO_5_ANOS');
    expect(r.base).toEqual({ campo: 'fechaInicio', fecha: '2022-06-25' });
  });

  it('T5: sin inicio, sin emisión, sin vencimiento → REQUIERE_REVISION', () => {
    const r = resolverVencimientoCurso({});
    expect(r).toEqual({
      fechaVencimiento: null,
      origen: 'REQUIERE_REVISION',
      base: null,
    });
  });

  it('T6: inicio 29/02/2024 sin vencimiento → 28/02/2029', () => {
    const r = resolverVencimientoCurso({ fechaInicio: '2024-02-29' });
    expect(r.fechaVencimiento).toBe('2029-02-28');
  });

  it('sin inicio usa la emisión como base', () => {
    const r = resolverVencimientoCurso({ fechaEmision: '2023-03-06' });
    expect(r.fechaVencimiento).toBe('2028-03-06');
    expect(r.base).toEqual({ campo: 'fechaEmision', fecha: '2023-03-06' });
  });

  it('con inicio y emisión, la base es el inicio', () => {
    const r = resolverVencimientoCurso({
      fechaInicio: '2023-03-01',
      fechaEmision: '2023-03-06',
    });
    expect(r.fechaVencimiento).toBe('2028-03-01');
  });

  it('una fecha base inválida no cuenta (nunca inventa)', () => {
    expect(resolverVencimientoCurso({ fechaInicio: '2023-02-30' }).origen).toBe(
      'REQUIERE_REVISION',
    );
  });

  it('29/02 + 4 años sigue siendo 29/02 (año bisiesto)', () => {
    expect(sumarAnios('2024-02-29', 4)).toBe('2028-02-29');
  });
});

describe('origenVencimientoDeCurso (cursos guardados antes del campo)', () => {
  it('estimado → CALCULADO_5_ANOS; con vencimiento → DOCUMENTO', () => {
    expect(
      origenVencimientoDeCurso({
        fechaVencimiento: '2027-06-25',
        fechaVencimientoEstimada: true,
      }),
    ).toBe('CALCULADO_5_ANOS');
    expect(
      origenVencimientoDeCurso({
        fechaVencimiento: '2029-04-25',
        documentoExtra: { x: 1 },
      }),
    ).toBe('DOCUMENTO');
    // Sin documento, un vencimiento capturado no es "del documento".
    expect(
      origenVencimientoDeCurso({ fechaVencimiento: '2029-04-25' }),
    ).toBeNull();
  });

  it('sin vencimiento: con documento → REQUIERE_REVISION; sin documento → null', () => {
    expect(origenVencimientoDeCurso({ documentoExtra: { x: 1 } })).toBe(
      'REQUIERE_REVISION',
    );
    expect(origenVencimientoDeCurso({})).toBeNull();
  });

  it('si ya está guardado, se respeta', () => {
    expect(
      origenVencimientoDeCurso({
        origenVencimiento: 'SIN_VENCIMIENTO',
        fechaVencimiento: null,
      }),
    ).toBe('SIN_VENCIMIENTO');
  });
});
