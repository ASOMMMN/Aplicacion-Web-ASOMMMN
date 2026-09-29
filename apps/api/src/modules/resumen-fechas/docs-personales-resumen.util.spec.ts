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

  it('usa el archivo más reciente aunque no tenga fechas (no mezcla con el anterior)', () => {
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
    expect(r.detalle).toBe('libreta-nueva.jpg');
    expect(r.fechaVencimiento).toBeNull();
    expect(r.aplicaVencimiento).toBe(true); // → "Sin fecha", no "No aplica"
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
