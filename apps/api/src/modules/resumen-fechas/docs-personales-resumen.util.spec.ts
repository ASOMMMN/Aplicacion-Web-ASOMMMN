import { resumenDocumentosPersonales } from './docs-personales-resumen.util';

describe('resumenDocumentosPersonales', () => {
  it('una fila por tipo, con la etiqueta del tipo y el archivo más reciente', () => {
    const r = resumenDocumentosPersonales([
      {
        tipo: 'pasaporte',
        nombreOriginal: 'IMG_2034.jpg',
        subidasEn: new Date('2024-01-10T15:00:00Z'),
        fechaVencimiento: new Date('2025-01-10T00:00:00Z'),
      },
      {
        tipo: 'pasaporte',
        nombreOriginal: 'pasaporte-renovado.pdf',
        subidasEn: new Date('2026-02-01T15:00:00Z'),
        fechaEmision: new Date('2026-01-20T00:00:00Z'),
        fechaVencimiento: new Date('2036-01-20T00:00:00Z'),
      },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].nombre).toBe('Pasaporte');
    expect(r[0].detalle).toBe('pasaporte-renovado.pdf');
    expect(r[0].fechaEmision).toBe('2026-01-20');
    expect(r[0].fechaVencimiento).toBe('2036-01-20');
    expect(r[0].origen).toBe('doc_personal');
  });

  it('un archivo nuevo sin fechas (p. ej. el reverso) no hace desaparecer las del anterior', () => {
    const [r] = resumenDocumentosPersonales([
      {
        tipo: 'libreta_identidad_maritima',
        nombreOriginal: 'libreta-2020.pdf',
        subidasEn: '2020-05-01T00:00:00Z',
        fechaVencimiento: '2025-05-01T00:00:00Z',
      },
      {
        tipo: 'libreta_identidad_maritima',
        nombreOriginal: 'libreta-nueva.jpg',
        subidasEn: '2026-06-01T00:00:00Z',
      },
    ]);
    expect(r.detalle).toBe('libreta-2020.pdf');
    expect(r.fechaVencimiento).toBe('2025-05-01');
    expect(r.aplicaVencimiento).toBe(true);
  });

  it('sin fechas en ningún archivo: el más reciente (muestra su estado)', () => {
    const [r] = resumenDocumentosPersonales([
      {
        tipo: 'visa',
        nombreOriginal: 'visa-vieja.jpg',
        subidasEn: '2020-05-01T00:00:00Z',
      },
      {
        tipo: 'visa',
        nombreOriginal: 'visa-nueva.jpg',
        subidasEn: '2026-06-01T00:00:00Z',
      },
    ]);
    expect(r.detalle).toBe('visa-nueva.jpg');
    expect(r.fechaVencimiento).toBeNull();
  });

  it('CURP, acta de nacimiento y vacuna de fiebre amarilla no vencen', () => {
    const r = resumenDocumentosPersonales(
      (['CURP', 'acta_nacimiento', 'vacuna_fiebre_amarilla'] as const).map(
        (tipo) => ({
          tipo,
          nombreOriginal: `${tipo}.pdf`,
          subidasEn: '2025-01-01',
        }),
      ),
    );
    expect(r.map((d) => d.aplicaVencimiento)).toEqual([false, false, false]);
  });

  it('los tipos que sí vencen quedan con aplicaVencimiento aunque no tengan fecha', () => {
    const tipos = [
      'INE',
      'visa',
      'pasaporte',
      'constancia_participacion',
      'certificado_medico',
      'libreta_identidad_maritima',
      'certificado_competencia',
    ] as const;
    const r = resumenDocumentosPersonales(
      tipos.map((tipo) => ({
        tipo,
        nombreOriginal: `${tipo}.pdf`,
        subidasEn: '2025-01-01',
      })),
    );
    expect(r).toHaveLength(tipos.length);
    expect(r.every((d) => d.aplicaVencimiento)).toBe(true);
  });

  it('sin documentos → sin filas', () => {
    expect(resumenDocumentosPersonales([])).toEqual([]);
  });
});

const id = (n: string) => ({ toString: () => n });

describe('resumenDocumentosPersonales: varios archivos del mismo tipo', () => {
  it('gana el de vencimiento más lejano con confianza ≥ media; sus fechas van en bloque', () => {
    const [r] = resumenDocumentosPersonales([
      {
        _id: id('viejo'),
        tipo: 'pasaporte',
        nombreOriginal: 'pasaporte-2016.pdf',
        subidasEn: '2026-03-01T00:00:00Z',
        fechaEmision: '2016-01-10',
        fechaVencimiento: '2026-01-09',
        detalleFechasIa: { fechaVencimiento: { confianza: 'alta' } },
      },
      {
        _id: id('nuevo'),
        tipo: 'pasaporte',
        nombreOriginal: 'pasaporte-2026.pdf',
        subidasEn: '2026-02-01T00:00:00Z',
        fechaVencimiento: '2036-01-20',
        detalleFechasIa: { fechaVencimiento: { confianza: 'media' } },
      },
    ]);
    expect(r.detalle).toBe('pasaporte-2026.pdf');
    expect(r.fechaVencimiento).toBe('2036-01-20');
    // NUNCA la emisión de un pasaporte con el vencimiento de otro.
    expect(r.fechaEmision).toBeNull();
    expect(r.docPersonal?.id).toBe('nuevo');
    expect(r.docPersonal?.archivosDelTipo).toBe(2);
  });

  it('un vencimiento con confianza baja no gana a uno confiable', () => {
    const [r] = resumenDocumentosPersonales([
      {
        tipo: 'visa',
        nombreOriginal: 'dudosa.jpg',
        subidasEn: '2026-05-01T00:00:00Z',
        fechaVencimiento: '2040-01-01',
        detalleFechasIa: { fechaVencimiento: { confianza: 'baja' } },
      },
      {
        tipo: 'visa',
        nombreOriginal: 'visa.pdf',
        subidasEn: '2026-01-01T00:00:00Z',
        fechaVencimiento: '2029-05-09',
        detalleFechasIa: { fechaVencimiento: { confianza: 'alta' } },
      },
    ]);
    expect(r.detalle).toBe('visa.pdf');
  });

  it('las fechas verificadas siempre ganan', () => {
    const [r] = resumenDocumentosPersonales([
      {
        tipo: 'certificado_medico',
        nombreOriginal: 'verificado.pdf',
        subidasEn: '2025-01-01T00:00:00Z',
        fechaVencimiento: '2026-12-01',
        fechasVerificadas: { verificadoEn: new Date() },
      },
      {
        tipo: 'certificado_medico',
        nombreOriginal: 'otro.pdf',
        subidasEn: '2026-01-01T00:00:00Z',
        fechaVencimiento: '2027-12-01',
        detalleFechasIa: { fechaVencimiento: { confianza: 'alta' } },
      },
    ]);
    expect(r.detalle).toBe('verificado.pdf');
    expect(r.fechaVencimiento).toBe('2026-12-01');
  });

  it('anverso y reverso (mismo vencimiento): completa el campo vacío y dice de qué archivo salió', () => {
    const [r] = resumenDocumentosPersonales([
      {
        _id: id('anverso'),
        tipo: 'INE',
        nombreOriginal: 'ine-anverso.jpg',
        subidasEn: '2026-04-01T10:00:00Z',
        fechaVencimiento: '2031-12-31',
        precisionFechas: { fechaVencimiento: 'anio' },
      },
      {
        _id: id('reverso'),
        tipo: 'INE',
        nombreOriginal: 'ine-reverso.jpg',
        subidasEn: '2026-04-03T10:00:00Z',
        fechaEmision: '2021-01-01',
        fechaVencimiento: '2031-12-31',
        precisionFechas: { fechaEmision: 'anio', fechaVencimiento: 'anio' },
        detalleFechasIa: { fechaVencimiento: { confianza: 'baja' } },
      },
    ]);
    expect(r.detalle).toBe('ine-anverso.jpg');
    expect(r.fechaEmision).toBe('2021-01-01');
    expect(r.precisionFechas?.fechaEmision).toBe('anio');
    expect(r.docPersonal?.fechasDeOtroArchivo).toEqual({
      fechaEmision: { id: 'reverso', nombre: 'ine-reverso.jpg' },
    });
  });

  it('subidos juntos (sin fechas que se contradigan) cuentan como el mismo documento', () => {
    const [r] = resumenDocumentosPersonales([
      {
        tipo: 'libreta_identidad_maritima',
        nombreOriginal: 'pagina-datos.jpg',
        subidasEn: '2026-04-01T10:00:00Z',
        fechaVencimiento: '2030-02-09',
      },
      {
        tipo: 'libreta_identidad_maritima',
        nombreOriginal: 'pagina-2.jpg',
        subidasEn: '2026-04-01T10:05:00Z',
        fechaEmision: '2025-02-10',
        detalleFechasIa: { fechaEmision: { confianza: 'alta' } },
      },
    ]);
    expect(r.fechaEmision).toBe('2025-02-10');
  });

  it('otro documento (vencimiento distinto, subido en otra fecha) no completa campos', () => {
    const [r] = resumenDocumentosPersonales([
      {
        tipo: 'pasaporte',
        nombreOriginal: 'nuevo.pdf',
        subidasEn: '2026-04-01T10:00:00Z',
        fechaVencimiento: '2036-01-20',
      },
      {
        tipo: 'pasaporte',
        nombreOriginal: 'viejo.pdf',
        subidasEn: '2024-01-01T10:00:00Z',
        fechaEmision: '2016-01-10',
        fechaVencimiento: '2026-01-09',
      },
    ]);
    expect(r.fechaEmision).toBeNull();
  });
});
