import { normalizarRespuesta } from './extraer-fechas-doc-personal';
import {
  leerFechaLiteral,
  validarFechasDocPersonal,
} from './validar-fechas-doc-personal';
import type { TipoDocPersonal } from '../constants/tipos-doc-personal';

const HOY = '2026-09-30';

const fecha = (
  valor: string | null,
  textoLiteral: string | null,
  extra: Record<string, unknown> = {},
) => ({ valor, textoLiteral, etiqueta: null, confianza: 'alta', ...extra });

const validar = (tipo: TipoDocPersonal, crudo: Record<string, unknown>) =>
  validarFechasDocPersonal(
    tipo,
    normalizarRespuesta({
      fechaEmision: fecha(null, null),
      fechaInicio: fecha(null, null),
      fechaVencimiento: fecha(null, null),
      ...crudo,
    }),
    HOY,
  );

describe('leerFechaLiteral', () => {
  it('numéricas como dd/mm salvo formato mm/dd declarado', () => {
    expect(leerFechaLiteral('12/03/2025')?.iso).toBe('2025-03-12');
    expect(leerFechaLiteral('12/03/2025', 'mm/dd/yyyy')?.iso).toBe(
      '2025-12-03',
    );
  });

  it('meses con letra en español e inglés', () => {
    expect(leerFechaLiteral('19 DIC 2025')?.iso).toBe('2025-12-19');
    expect(leerFechaLiteral('09FEB2022')?.iso).toBe('2022-02-09');
    expect(leerFechaLiteral('19 DEC/DIC 2025')?.iso).toBe('2025-12-19');
  });
});

describe('validarFechasDocPersonal', () => {
  it('corrige día/mes invertidos contra el texto literal', () => {
    const r = validar('certificado_medico', {
      fechaEmision: fecha('2025-12-03', '12/03/2025'),
      fechaVencimiento: fecha('2027-12-03', '12/03/2027'),
    });
    expect(r.fechaEmision).toBe('2025-03-12');
    expect(r.fechaVencimiento).toBe('2027-03-12');
    expect(r.motivosRevision.join(' ')).toMatch(/día\/mes/);
  });

  it('INE: vigencia solo con año → 31/12 de ese año', () => {
    const r = validar('INE', {
      fechaVencimiento: fecha(null, 'VIGENCIA 2021 - 2031', {
        precision: 'anio',
      }),
    });
    expect(r.fechaVencimiento).toBe('2031-12-31');
    expect(r.detalle?.fechaVencimiento.precision).toBe('anio');
  });

  it('solo año fuera de la INE: se guarda con precisión año, nunca como día', () => {
    const r = validar('pasaporte', {
      fechaEmision: fecha('2020-01-01', '2020'),
    });
    expect(r.fechaEmision).toBe('2020-01-01');
    expect(r.detalle?.fechaEmision.precision).toBe('anio');
  });

  it('INE: emisión solo con año → precisión año aunque el modelo dé día (caso real)', () => {
    // El modelo devolvió 2016-01-01 con precisión "dia" y el texto "EMISIÓN 2016".
    const r = validar('INE', {
      fechaEmision: fecha('2016-01-01', 'EMISIÓN 2016', { precision: 'dia' }),
      fechaVencimiento: fecha('2026-01-01', 'VIGENCIA 2016 - 2026'),
    });
    expect(r.detalle?.fechaEmision.precision).toBe('anio');
    expect(r.detalle?.fechaVencimiento).toMatchObject({
      valor: '2026-12-31',
      precision: 'anio',
    });
  });

  it('fecha sin literal legible se descarta aunque el modelo dé un valor', () => {
    const r = validar('visa', {
      fechaEmision: fecha('2021-10-16', 'ver reverso'),
    });
    expect(r.fechaEmision).toBeNull();
    expect(r.fechasDescartadas).toHaveLength(1);
  });

  it('vencimiento anterior a la emisión → Revisar', () => {
    const r = validar('visa', {
      fechaEmision: fecha('2024-05-10', '10/05/2024'),
      fechaVencimiento: fecha('2023-05-10', '10/05/2023'),
    });
    expect(r.revisar).toBe(true);
    expect(r.confianza.fechaVencimiento).toBe('baja');
  });

  it('rango por tipo: pasaporte 10 años ok, 7 años → Revisar', () => {
    const ok = validar('pasaporte', {
      fechaEmision: fecha('2020-02-09', '09/02/2020'),
      fechaVencimiento: fecha('2030-02-09', '09/02/2030'),
    });
    expect(ok.revisar).toBe(false);

    const raro = validar('pasaporte', {
      fechaEmision: fecha('2020-02-09', '09/02/2020'),
      fechaVencimiento: fecha('2027-02-09', '09/02/2027'),
    });
    expect(raro.revisar).toBe(true);
    // No se descarta: se conserva para que el evaluador la confirme.
    expect(raro.fechaVencimiento).toBe('2027-02-09');
  });

  it('certificado médico de más de 2 años → Revisar', () => {
    const r = validar('certificado_medico', {
      fechaEmision: fecha('2024-01-15', '15/01/2024'),
      fechaVencimiento: fecha('2027-01-15', '15/01/2027'),
    });
    expect(r.revisar).toBe(true);
  });

  it('CURP no vence: el vencimiento se descarta', () => {
    const r = validar('CURP', {
      fechaVencimiento: fecha('2030-01-01', '01/01/2030'),
    });
    expect(r.fechaVencimiento).toBeNull();
    expect(r.fechasDescartadas).toHaveLength(1);
  });

  it('tipo sospechoso cuando el contenido es de otro tipo', () => {
    const r = validar('visa', { tipoDetectado: 'pasaporte' });
    expect(r.tipoSospechoso).toEqual({
      tipoElegido: 'visa',
      tipoDetectado: 'pasaporte',
    });
  });
});

describe('validarFechasDocPersonal: casos del diagnóstico', () => {
  it('03/04/2025 sin formato comprobado → 3 de abril, confianza media como máximo', () => {
    const r = validar('certificado_competencia', {
      fechaEmision: fecha('2025-04-03', '03/04/2025'),
    });
    expect(r.fechaEmision).toBe('2025-04-03');
    expect(r.confianza.fechaEmision).toBe('media');
  });

  it('03/04/2025 aunque el modelo declare "mm/dd": sin indicador en el documento sigue siendo dd/mm', () => {
    // normalizarRespuesta conserva lo que dijo el modelo; extraerFechasDocPersonal
    // lo reemplaza por el formato comprobado (null si el documento no lo indica).
    const r = validarFechasDocPersonal(
      'certificado_competencia',
      {
        ...normalizarRespuesta({
          fechaEmision: fecha('2025-03-04', '03/04/2025'),
          fechaInicio: fecha(null, null),
          fechaVencimiento: fecha(null, null),
        }),
        formatoFechaIndicado: null,
      },
      HOY,
    );
    expect(r.fechaEmision).toBe('2025-04-03');
    expect(r.motivosRevision.join(' ')).toMatch(/día\/mes/);
  });

  it('03/04/2025 con indicador "mm/dd/aaaa" comprobado en el documento → 4 de marzo', () => {
    const r = validarFechasDocPersonal(
      'visa',
      {
        ...normalizarRespuesta({
          fechaEmision: fecha('2025-03-04', '03/04/2025'),
          fechaInicio: fecha(null, null),
          fechaVencimiento: fecha(null, null),
        }),
        formatoFechaIndicado: 'mm/dd/aaaa',
      },
      HOY,
    );
    expect(r.fechaEmision).toBe('2025-03-04');
    expect(r.confianza.fechaEmision).toBe('alta');
  });

  it('"del 01/02/2023 al 01/02/2028" con etiqueta de vigencia → vencimiento 2028 (antes se guardaba 2023)', () => {
    const r = validar('certificado_competencia', {
      fechaEmision: fecha('2023-02-01', '01/02/2023'),
      fechaVencimiento: fecha('2028-02-01', 'del 01/02/2023 al 01/02/2028', {
        etiqueta: 'Vigencia',
      }),
    });
    expect(r.fechaVencimiento).toBe('2028-02-01');
    expect(r.revisar).toBe(false);
  });

  it('INE "EMISIÓN 2021 VIGENCIA 2031" en ambos literales → emisión 2021, vencimiento 2031-12-31', () => {
    const literal = 'EMISIÓN 2021 VIGENCIA 2031';
    const r = validar('INE', {
      fechaEmision: fecha(null, literal),
      fechaVencimiento: fecha('2031-12-31', literal),
    });
    expect(r.fechaEmision).toBe('2021-01-01');
    expect(r.detalle?.fechaEmision.precision).toBe('anio');
    expect(r.fechaVencimiento).toBe('2031-12-31');
  });

  it('"19 DEC 27" ya no se descarta', () => {
    const r = validar('visa', {
      fechaEmision: fecha('2017-12-20', '20 DEC 17'),
      fechaVencimiento: fecha('2027-12-19', '19 DEC 27'),
    });
    expect(r.fechaVencimiento).toBe('2027-12-19');
    expect(r.fechasDescartadas).toHaveLength(0);
  });

  it('varias fechas sin forma de distinguirlas → la más probable, confianza baja y Revisar', () => {
    const r = validar('certificado_competencia', {
      fechaVencimiento: fecha('2030-01-01', '15/05/2021 15/05/2026'),
    });
    expect(r.fechaVencimiento).toBe('2026-05-15');
    expect(r.confianza.fechaVencimiento).toBe('baja');
    expect(r.revisar).toBe(true);
  });

  it('"hoy" por defecto es el de México: la emisión de hoy en México no está en el futuro', () => {
    // Sin parámetro `hoy`: solo se comprueba que use la fecha local de México
    // (una emisión de hoy nunca se marca como futura).
    const { hoyISO } = jest.requireActual<
      typeof import('../../../common/utils/fecha-mexico.util')
    >('../../../common/utils/fecha-mexico.util');
    const hoy = hoyISO();
    const [y, m, d] = hoy.split('-');
    const r = validarFechasDocPersonal(
      'visa',
      normalizarRespuesta({
        fechaEmision: fecha(hoy, `${d}/${m}/${y}`),
        fechaInicio: fecha(null, null),
        fechaVencimiento: fecha(null, null),
      }),
    );
    expect(r.motivosRevision.join(' ')).not.toMatch(/futuro/);
  });
});
