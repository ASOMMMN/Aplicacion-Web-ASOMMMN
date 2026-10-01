import { combinarFuentes, EntradaCombinacion } from './combinar-fuentes';
import type {
  CampoFecha,
  Confianza,
  FechaDetectada,
} from './extraer-fechas-doc-personal';
import { extraerPorEtiquetas } from './extractor-etiquetas';
import type { PrecisionFecha } from './formatos-fecha';
import { leerCadena } from './qr-cadena';

// Textos con la estructura de documentos reales, sin datos personales.

const texto = (t: string, pagina = 1) =>
  extraerPorEtiquetas(t, { pagina, fuente: 'texto' });

/** Respuesta de la IA ya validada: { campo: [valor, precision?] }. */
function ia(
  fechas: Partial<Record<CampoFecha, [string, PrecisionFecha?]>>,
  confianza: Confianza = 'alta',
): EntradaCombinacion['ia'] {
  const campos: CampoFecha[] = [
    'fechaEmision',
    'fechaInicio',
    'fechaVencimiento',
  ];
  const detalle = Object.fromEntries(
    campos.map((c): [CampoFecha, FechaDetectada] => {
      const f = fechas[c];
      return [
        c,
        {
          valor: f?.[0] ?? null,
          precision: f?.[1] ?? 'dia',
          textoLiteral: f?.[0] ?? null,
          etiqueta: null,
          confianza: f ? confianza : 'baja',
        },
      ];
    }),
  ) as Record<CampoFecha, FechaDetectada>;
  const conf = Object.fromEntries(
    campos.map((c) => [c, fechas[c] ? confianza : 'baja']),
  ) as Record<CampoFecha, Confianza>;
  return { detalle, confianza: conf };
}

const REFRENDO = `Fecha de Expedición: 09-05-2024
Date of issuance: 09-05-2024
Fecha de Vencimiento: 09-05-2029
Expiration Date: 09-05-2029`;

const DOS_REFRENDOS = `Fecha de Expedición: 10-09-2021
Fecha de Vencimiento: 20-08-2023
Lugar de Expedición: Tampico, Tamps.
Fecha de Expedición: 09-05-2024
Fecha de Vencimiento: 09-05-2029`;

describe('combinarFuentes', () => {
  it('QR sola: basta para "Coincidente", sin IA', () => {
    const r = combinarFuentes({
      lecturas: leerCadena('DICTAMEN:19/12/2025|VIGENCIA:19/12/2027', 1),
      ia: null,
    });
    expect(r.grupos).toHaveLength(1);
    expect(r.principal).toBe(0);
    expect(r.fuentes.fechaEmision).toMatchObject({
      valor: '2025-12-19',
      fuente: 'qr',
      coincidente: true,
    });
    expect(r.fuentes.fechaVencimiento).toMatchObject({
      valor: '2027-12-19',
      fuente: 'qr',
      coincidente: true,
    });
    expect(r.confianza.fechaVencimiento).toBe('alta');
    expect(r.motivosRevision).toEqual([]);
  });

  it('QR y cadena original en el texto de la misma página: un solo documento', () => {
    const r = combinarFuentes({
      lecturas: [
        ...leerCadena('DICTAMEN:19/12/2025|VIGENCIA:19/12/2027', 1),
        ...texto('Cadena original:\nDICTAMEN:19/12/2025|VIGENCIA:19/12/2027'),
      ],
      ia: null,
    });
    expect(r.grupos).toHaveLength(1);
    expect(r.fuentes.fechaVencimiento.lecturas.map((l) => l.fuente)).toEqual([
      'qr',
      'texto',
    ]);
    expect(r.motivosRevision).toEqual([]);
  });

  it('etiqueta + IA coincidentes: "Coincidente" y confianza alta', () => {
    const r = combinarFuentes({
      lecturas: texto(REFRENDO),
      ia: ia(
        { fechaEmision: ['2024-05-09'], fechaVencimiento: ['2029-05-09'] },
        'media',
      ),
    });
    expect(r.fuentes.fechaVencimiento).toMatchObject({
      valor: '2029-05-09',
      fuente: 'texto',
      coincidente: true,
    });
    expect(r.fuentes.fechaVencimiento.lecturas.map((l) => l.fuente)).toEqual([
      'texto',
      'texto',
      'ia',
    ]);
    expect(r.confianza).toEqual({
      fechaEmision: 'alta',
      fechaInicio: 'baja',
      fechaVencimiento: 'alta',
    });
    expect(r.motivosRevision).toEqual([]);
  });

  it('etiqueta + IA en conflicto: gana la etiqueta y se marca con ambos valores', () => {
    const r = combinarFuentes({
      lecturas: texto(REFRENDO),
      ia: ia({
        fechaEmision: ['2024-05-09'],
        fechaVencimiento: ['2029-04-05'],
      }),
    });
    expect(r.fuentes.fechaVencimiento).toMatchObject({
      valor: '2029-05-09',
      fuente: 'texto',
      coincidente: false,
    });
    expect(r.confianza.fechaVencimiento).toBe('baja');
    expect(r.fuentes.fechaEmision.coincidente).toBe(true);
    expect(r.motivosRevision).toHaveLength(1);
    expect(r.motivosRevision[0]).toContain(
      'etiqueta del texto dice 09/05/2029',
    );
    expect(r.motivosRevision[0]).toContain('la IA dice 05/04/2029');
  });

  it('solo IA: el resultado es el de la IA tal cual', () => {
    const r = combinarFuentes({
      lecturas: [],
      ia: ia({ fechaVencimiento: ['2027-01-31'] }, 'media'),
    });
    expect(r.principal).toBeNull();
    expect(r.grupos).toEqual([]);
    expect(r.fuentes.fechaVencimiento).toMatchObject({
      valor: '2027-01-31',
      fuente: 'ia',
      coincidente: false,
    });
    expect(r.fuentes.fechaEmision).toMatchObject({ valor: null, fuente: null });
    expect(r.confianza.fechaVencimiento).toBe('media');
    expect(r.motivosRevision).toEqual([]);
  });

  it('dos refrendos: gana el vencimiento más reciente y se avisa', () => {
    const r = combinarFuentes({
      lecturas: texto(DOS_REFRENDOS),
      ia: ia({
        fechaEmision: ['2024-05-09'],
        fechaVencimiento: ['2029-05-09'],
      }),
    });
    expect(r.grupos).toHaveLength(2);
    expect(r.principal).toBe(1);
    expect(r.grupos[0].fechas.fechaVencimiento?.valor).toBe('2023-08-20');
    expect(r.grupos[1].principal).toBe(true);
    expect(r.fuentes.fechaEmision.valor).toBe('2024-05-09');
    expect(r.fuentes.fechaVencimiento).toMatchObject({
      valor: '2029-05-09',
      coincidente: true,
    });
    expect(r.motivosRevision).toEqual([
      'Se detectaron 2 documentos en el archivo; se usó el de vencimiento más reciente (09/05/2029).',
    ]);
  });

  it('precisión distinta: "2016" y "2016-01-01" no coinciden', () => {
    const r = combinarFuentes({
      lecturas: texto('EMISIÓN 2016\nVIGENCIA 2016 - 2026'),
      ia: ia({
        fechaEmision: ['2016-01-01', 'dia'],
        fechaVencimiento: ['2026-12-31', 'anio'],
      }),
    });
    expect(r.fuentes.fechaEmision).toMatchObject({
      valor: '2016-01-01',
      precision: 'anio',
      fuente: 'texto',
      coincidente: false,
    });
    expect(r.fuentes.fechaVencimiento).toMatchObject({
      valor: '2026-12-31',
      precision: 'anio',
      coincidente: true,
    });
    expect(r.motivosRevision).toEqual([
      'La emisión difiere: etiqueta del texto dice 2016; la IA dice 01/01/2016. Se usó la de etiqueta del texto.',
    ]);
  });

  it('IA que coincide con un documento que no es el principal: "Revisar"', () => {
    const r = combinarFuentes({
      lecturas: texto(DOS_REFRENDOS),
      ia: ia({
        fechaEmision: ['2021-09-10'],
        fechaVencimiento: ['2023-08-20'],
      }),
    });
    expect(r.fuentes.fechaVencimiento).toMatchObject({
      valor: '2029-05-09',
      coincidente: false,
    });
    expect(r.confianza.fechaVencimiento).toBe('baja');
    expect(r.motivosRevision).toContain(
      'La IA leyó la vencimiento (20/08/2023) de otro documento del archivo (documento 1); se usó la del documento principal (09/05/2029, etiqueta del texto).',
    );
  });

  it('IA con un campo que solo tiene otro documento: no se mezcla con el principal', () => {
    const r = combinarFuentes({
      lecturas: texto(
        'Fecha de Expedición: 10-09-2021\nFecha de Vencimiento: 20-08-2023\nFecha de Vencimiento: 09-05-2029',
      ),
      ia: ia({
        fechaEmision: ['2021-09-10'],
        fechaVencimiento: ['2029-05-09'],
      }),
    });
    expect(r.grupos).toHaveLength(2);
    expect(r.fuentes.fechaEmision).toMatchObject({ valor: null, fuente: null });
    expect(
      r.motivosRevision.some((m) =>
        m.includes('no se usó en el documento principal'),
      ),
    ).toBe(true);
  });

  it('fechas verificadas: se calcula la evidencia pero sin motivos de revisión', () => {
    const r = combinarFuentes({
      lecturas: texto(DOS_REFRENDOS),
      ia: ia({ fechaVencimiento: ['2023-08-20'] }),
      fechasVerificadas: true,
    });
    expect(r.grupos).toHaveLength(2);
    expect(r.fuentes.fechaVencimiento.valor).toBe('2029-05-09');
    expect(r.motivosRevision).toEqual([]);
  });
});
