import { cambiosPorAnalisis } from './cambios-analisis';
import {
  ResultadoExtraccionFechas,
  sinFechas,
} from './extraer-fechas-doc-personal';

const AHORA = new Date('2026-09-30T12:00:00Z');

const exito = (): ResultadoExtraccionFechas => ({
  modelo: 'gpt-4o-mini',
  origen: 'pdf-visual',
  resultado: {
    ...sinFechas(true, ''),
    errorMensaje: undefined,
    fechaEmision: '2024-03-15',
    fechaVencimiento: '2026-03-14',
    revisar: true,
    motivosRevision: ['x'],
  },
});

/** En estos casos siempre hay cambios (no es límite por minuto). */
const cambios = (...a: Parameters<typeof cambiosPorAnalisis>) =>
  cambiosPorAnalisis(...a)!;

describe('cambiosPorAnalisis', () => {
  it('guarda fechas y la marca Revisar cuando el análisis salió bien', () => {
    const c = cambios(exito(), { ahora: AHORA });
    expect(c.fechaEmision?.toISOString()).toBe('2024-03-15T00:00:00.000Z');
    expect(c.fechaVencimiento?.toISOString()).toBe('2026-03-14T00:00:00.000Z');
    expect(c.revisarFechas).toBe(true);
    expect(c.analisisIa.analizadoEn).toBe(AHORA);
    expect(c.analisisIa).not.toHaveProperty('error');
  });

  it('con error no toca fechas pero registra el intento', () => {
    const c = cambios(
      { modelo: 'm', resultado: sinFechas(true, 'Error de OpenAI') },
      { ahora: AHORA },
    );
    expect(Object.keys(c).sort()).toEqual([
      'analisisIa',
      'extraccionError',
      'extraccionEstado',
    ]);
    expect(c.extraccionEstado).toBe('error');
    expect(c.extraccionError).toBe('Error de OpenAI');
    expect(c.analisisIa.error).toBe('Error de OpenAI');
  });

  it('con fechas verificadas por el evaluador no las sobrescribe', () => {
    const c = cambios(exito(), { fechasVerificadas: true });
    expect(c).not.toHaveProperty('fechaEmision');
    expect(c).not.toHaveProperty('fechaVencimiento');
    expect(c).not.toHaveProperty('revisarFechas');
    expect(c.analisisIa).toBeDefined();
  });

  it('estado ok con fechas; sin_fechas si el documento no las muestra', () => {
    expect(cambios(exito()).extraccionEstado).toBe('ok');

    const vacio = exito();
    Object.assign(vacio.resultado, {
      fechaEmision: null,
      fechaVencimiento: null,
    });
    expect(cambios(vacio)).toMatchObject({
      extraccionEstado: 'sin_fechas',
      extraccionError: null,
    });
  });

  it('todas las fechas descartadas por validación → error con motivo', () => {
    const r = exito();
    Object.assign(r.resultado, {
      fechaEmision: null,
      fechaVencimiento: null,
      fechasDescartadas: ['La emisión solo indica el año; se dejó vacía.'],
    });
    const c = cambios(r);
    expect(c.extraccionEstado).toBe('error');
    expect(c.extraccionError).toMatch(/^Fecha descartada por validación/);
  });

  it('límite por minuto de OpenAI → null: el documento no cambia ni queda en error', () => {
    const c = cambiosPorAnalisis({
      modelo: 'gpt-4o',
      errorOpenAI: {
        tipo: 'limite_por_minuto',
        status: 429,
        codigo: 'rate_limit_exceeded',
      },
      resultado: sinFechas(
        true,
        'Límite por minuto de OpenAI: se reintentará (rate_limit_exceeded).',
      ),
    });
    expect(c).toBeNull();
  });
});
