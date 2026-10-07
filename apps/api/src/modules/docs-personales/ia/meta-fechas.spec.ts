import { Types } from 'mongoose';
import { cambiosPorAnalisis } from './cambios-analisis';
import {
  ResultadoExtraccionFechas,
  sinFechas,
  VERSION_CANALIZACION,
} from './extraer-fechas-doc-personal';
import {
  cambiosDeFechas,
  completarFecha,
  CONFIANZA_NUMERICA,
} from './meta-fechas';
import {
  metaFechasCurso,
  metaFechasDocPersonal,
} from './meta-fechas-derivadas';

const fecha = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (d?: Date | null) => d?.toISOString().slice(0, 10);

describe('completarFecha (fechas parciales para calcular)', () => {
  it('vencimiento: año → 31/12, mes → último día', () => {
    expect(completarFecha('2033-01-01', 'anio', 'fechaVencimiento')).toBe(
      '2033-12-31',
    );
    expect(completarFecha('2026-02-01', 'mes', 'fechaVencimiento')).toBe(
      '2026-02-28',
    );
  });
  it('emisión: año → 01/01, mes → día 1; día tal cual', () => {
    expect(completarFecha('2023-07-15', 'anio', 'fechaEmision')).toBe(
      '2023-01-01',
    );
    expect(completarFecha('2026-04-15', 'mes', 'fechaEmision')).toBe(
      '2026-04-01',
    );
    expect(completarFecha('2026-04-15', 'dia', 'fechaEmision')).toBe(
      '2026-04-15',
    );
  });
});

describe('confianza numérica', () => {
  it('alta 0.9, media 0.7, baja 0.4', () => {
    expect(CONFIANZA_NUMERICA).toEqual({ alta: 0.9, media: 0.7, baja: 0.4 });
  });
});

describe('cambiosDeFechas (historial)', () => {
  it('solo los campos que cambiaron, con valor anterior y nuevo', () => {
    const c = cambiosDeFechas(
      {
        fechaEmision: fecha('2023-01-01'),
        fechaVencimiento: fecha('2033-12-31'),
      },
      { fechaEmision: 'anio', fechaVencimiento: 'anio' },
      {
        fechaEmision: fecha('2023-01-01'),
        fechaVencimiento: fecha('2034-12-31'),
      },
      { fechaEmision: 'anio', fechaVencimiento: 'anio' },
      { fuente: 'manual', motivo: 'Corrección manual', en: new Date() },
    );
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({
      campo: 'fechaVencimiento',
      anterior: { valor: '2033-12-31', precision: 'anio' },
      nuevo: { valor: '2034-12-31', precision: 'anio' },
    });
  });
});

/** Resultado de IA con fechas dadas (sin datos reales). */
function analisis(fechas: {
  fechaEmision?: string | null;
  fechaVencimiento?: string | null;
}): ResultadoExtraccionFechas {
  const det = (v: string | null | undefined) => ({
    valor: v ?? null,
    textoLiteral: v ?? null,
    etiqueta: null,
    confianza: v ? ('alta' as const) : ('baja' as const),
    precision: 'dia' as const,
  });
  return {
    modelo: 'gpt-4o-2024-11-20',
    versionCanalizacion: VERSION_CANALIZACION,
    resultado: {
      ...sinFechas(true, ''),
      errorMensaje: undefined,
      fechaEmision: fechas.fechaEmision ?? null,
      fechaVencimiento: fechas.fechaVencimiento ?? null,
      confianza: {
        fechaEmision: 'alta',
        fechaInicio: 'baja',
        fechaVencimiento: 'alta',
      },
      detalle: {
        fechaEmision: det(fechas.fechaEmision),
        fechaInicio: det(null),
        fechaVencimiento: det(fechas.fechaVencimiento),
      },
      revisar: false,
      motivosRevision: [],
    },
  };
}

describe('cambiosPorAnalisis: bloqueo por campo (corrección manual)', () => {
  const evaluador = new Types.ObjectId();
  const anterior = {
    fechaEmision: fecha('2020-01-10'),
    fechaVencimiento: fecha('2030-01-09'),
    precisionFechas: {},
    analisisIa: { versionCanalizacion: VERSION_CANALIZACION },
    metaFechas: {
      fechaEmision: {
        fuente: 'ia' as const,
        precision: 'dia' as const,
        bloqueada: false,
      },
      fechaVencimiento: {
        fuente: 'manual' as const,
        precision: 'dia' as const,
        bloqueada: true,
        editadoPor: evaluador,
      },
    },
  };

  it('una corrección manual sobrevive a "Volver a analizar"', () => {
    const c = cambiosPorAnalisis(
      analisis({ fechaEmision: '2020-01-10', fechaVencimiento: '2035-05-05' }),
      { anterior, fechasVerificadas: true },
    )!;
    expect(iso(c.fechaVencimiento)).toBe('2030-01-09');
    expect(c.metaFechas?.fechaVencimiento).toMatchObject({
      fuente: 'manual',
      bloqueada: true,
    });
    // Un campo bloqueado no genera propuesta.
    expect(c.propuestaFechasIa).toBeNull();
  });

  it('los campos no bloqueados sí se actualizan, con metadatos de la IA e historial', () => {
    const c = cambiosPorAnalisis(
      analisis({ fechaEmision: '2020-02-10', fechaVencimiento: '2035-05-05' }),
      {
        anterior: { ...anterior, analisisIa: {} },
        fechasVerificadas: true,
        motivo: 'Volver a analizar',
      },
    )!;
    expect(iso(c.fechaEmision)).toBe('2020-02-10');
    expect(c.metaFechas?.fechaEmision).toMatchObject({
      fuente: 'ia',
      confianza: 0.9,
      evidencia: '2020-02-10',
      bloqueada: false,
    });
    expect(c.historialFechas).toEqual([
      expect.objectContaining({
        campo: 'fechaEmision',
        anterior: { valor: '2020-01-10', precision: 'dia' },
        nuevo: { valor: '2020-02-10', precision: 'dia' },
        fuente: 'ia',
        motivo: 'Volver a analizar',
      }),
    ]);
  });

  it('"Desbloquear y reanalizar": el campo liberado acepta la lectura nueva sin propuesta', () => {
    const libre = {
      ...anterior,
      metaFechas: {
        ...anterior.metaFechas,
        fechaVencimiento: {
          ...anterior.metaFechas.fechaVencimiento,
          bloqueada: false,
        },
      },
    };
    const c = cambiosPorAnalisis(
      analisis({ fechaEmision: '2020-01-10', fechaVencimiento: '2035-05-05' }),
      { anterior: libre, camposLibres: ['fechaVencimiento'] },
    )!;
    expect(iso(c.fechaVencimiento)).toBe('2035-05-05');
    expect(c.propuestaFechasIa).toBeNull();
  });
});

describe('metaFechas derivados (registros anteriores al campo)', () => {
  it('documento verificado → manual y bloqueada, con quién y cuándo', () => {
    const quien = new Types.ObjectId();
    const m = metaFechasDocPersonal({
      fechaVencimiento: fecha('2030-01-09'),
      fechasVerificadas: {
        verificadoPor: quien,
        verificadoPorEmail: 'evaluador@ejemplo.mx',
        verificadoEn: fecha('2026-09-01'),
      },
    });
    expect(m.fechaVencimiento).toMatchObject({
      fuente: 'manual',
      bloqueada: true,
      editadoPorEmail: 'evaluador@ejemplo.mx',
    });
  });

  it('documento analizado → ia con confianza y evidencia; precisión inferida del texto', () => {
    const m = metaFechasDocPersonal({
      fechaVencimiento: fecha('2031-12-31'),
      detalleFechasIa: {
        fechaVencimiento: {
          confianza: 'media',
          textoLiteral: 'VIGENCIA 2021 - 2031',
        },
      },
    });
    expect(m.fechaVencimiento).toMatchObject({
      fuente: 'ia',
      precision: 'anio',
      confianza: 0.7,
      evidencia: 'VIGENCIA 2021 - 2031',
      bloqueada: false,
    });
  });

  it('curso: vencimiento estimado → regla; con documento → ia; sin documento → manual', () => {
    const conDoc = metaFechasCurso({
      fechaInicio: fecha('2022-06-25'),
      fechaVencimiento: fecha('2027-06-25'),
      origenVencimiento: 'CALCULADO_5_ANOS',
      documentoExtra: { x: 1 },
    });
    expect(conDoc.fechaVencimiento?.fuente).toBe('regla');
    expect(conDoc.fechaInicio?.fuente).toBe('ia');
    const sinDoc = metaFechasCurso({ fechaInicio: fecha('2022-06-25') });
    expect(sinDoc.fechaInicio?.fuente).toBe('manual');
  });
});
