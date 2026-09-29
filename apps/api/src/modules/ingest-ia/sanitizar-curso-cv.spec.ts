import { sanitizarCursoCV } from './openai-ia.service';

describe('sanitizarCursoCV', () => {
  it('conserva fechas válidas y su confianza', () => {
    const r = sanitizarCursoCV({
      nombre: 'Formación básica en seguridad',
      fechaEmision: '2023-06-10',
      fechaVencimiento: '2028-06-10',
      confianza: { fechaEmision: 'alta', fechaVencimiento: 'media' },
    });
    expect(r.fechaEmision).toBe('2023-06-10');
    expect(r.fechaVencimiento).toBe('2028-06-10');
    expect(r.fechaInicio).toBeNull();
    expect(r.confianza).toEqual({
      fechaInicio: 'baja',
      fechaEmision: 'alta',
      fechaVencimiento: 'media',
    });
  });

  it('descarta fechas mal formadas o imposibles en lugar de guardarlas', () => {
    const r = sanitizarCursoCV({
      nombre: 'Primeros auxilios',
      fechaInicio: '2024', // solo año
      fechaEmision: '15/03/2024', // formato no normalizado
      fechaVencimiento: '2025-02-30', // día inexistente
    });
    expect(r.fechaInicio).toBeNull();
    expect(r.fechaEmision).toBeNull();
    expect(r.fechaVencimiento).toBeNull();
  });

  it('ignora valores de confianza fuera de alta|media|baja', () => {
    const r = sanitizarCursoCV({
      nombre: 'Lucha contra incendios',
      fechaVencimiento: '2027-01-01',
      confianza: { fechaVencimiento: 'muy alta' as never },
    });
    expect(r.confianza?.fechaVencimiento).toBeUndefined();
  });

  it('sin fecha, la confianza queda en baja aunque el modelo diga alta', () => {
    const r = sanitizarCursoCV({
      nombre: 'Radar ARPA',
      fechaVencimiento: null,
      confianza: { fechaVencimiento: 'alta' },
    });
    expect(r.confianza?.fechaVencimiento).toBe('baja');
  });
});
