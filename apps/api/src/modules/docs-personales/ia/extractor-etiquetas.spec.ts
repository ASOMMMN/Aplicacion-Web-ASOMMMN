import { extraerPorEtiquetas, LecturaFecha } from './extractor-etiquetas';

// Textos con la estructura de documentos reales, sin datos personales.

const leer = (texto: string) =>
  extraerPorEtiquetas(texto, { pagina: 1, fuente: 'texto' });
const resumen = (ls: LecturaFecha[]) =>
  ls.map((l) => `${l.grupo}:${l.campo}=${l.clave}`);

describe('extraerPorEtiquetas', () => {
  it('constancia: fechas bilingües en texto largo; ignora el encabezado de impresión', () => {
    const texto = `Folio: 000000000/25
CONSTANCIA DE PARTICIPACIÓN
Certificate of Attendance
NOMBRE DE PRUEBA
Por haber concluido satisfactoriamente el curso de:
Gestión de Recursos De La Cámara de Máquinas
Duración del curso: (Hours course):
24 horas (24 hours )
Fecha de emisión (Date of issue):
11 de abril de 2025 (Apr 11th 2025)
Fecha de expiración (Date of expiry):
10 de abril de 2030 (Apr 10th 2030)
E.Firma:
U3ViZGlyZWN0b3IgLyBEZXB1dHkgRGlyZWN0b3I6IENhcC4=
11/4/25, 15:36 	NOMBRE DE PRUEBA-000000000/25`;
    expect(resumen(leer(texto))).toEqual([
      '0:fechaEmision=2025-04-11',
      '0:fechaVencimiento=2030-04-10',
    ]);
  });

  it('refrendo: dos tarjetas en la hoja → dos documentos; tolera ruido del OCR', () => {
    const texto = `Fecha de Expedición: — 10-09-2021 (dd'mmaaza)
Date of issuance 10-00-2021 (dd/mm/yyyy)
Fecha de Vencimiento: 20-08-2023 (dd/mmiaaaa)
Expiration Date 20-08-2023 (ddimmiyyyy)
Lugar de Expedición: Tampico, Tamps.
Fecha de Expedición: 09-05-2024
Date of issuance: 09-05-2024
Fecha de Vencimiento: 05-04-2029
Expiration Date: 05-04-2029
Lugar de Expedición: Capitanía de Puerto Regional`;
    const r = leer(texto);
    expect(r.filter((l) => l.grupo === 0).map((l) => l.clave)).toEqual([
      '2021-09-10',
      '2023-08-20',
      '2023-08-20',
    ]);
    expect(
      r.filter((l) => l.grupo === 1).map((l) => `${l.campo}=${l.clave}`),
    ).toEqual([
      'fechaEmision=2024-05-09',
      'fechaEmision=2024-05-09',
      'fechaVencimiento=2029-04-05',
      'fechaVencimiento=2029-04-05',
    ]);
  });

  it('certificado médico: etiquetas largas; ignora la fecha de nacimiento', () => {
    const texto = `Fecha de nacimiento / Date of birth: 01/02/1990
Fecha en la que se realizó el reconocimiento médico / Date on which medical examination was carried out: 19/12/2025
Fecha en la que expira el certificado médico / Expiration date of medical certificate: 19/12/2027`;
    expect(resumen(leer(texto))).toEqual([
      '0:fechaEmision=2025-12-19',
      '0:fechaVencimiento=2027-12-19',
    ]);
  });

  it('cadena original: DICTAMEN y VIGENCIA', () => {
    const r = leer('||FOLIO:0000|DICTAMEN:19/12/2025|VIGENCIA:19/12/2027||');
    expect(resumen(r)).toEqual([
      '0:fechaEmision=2025-12-19',
      '0:fechaVencimiento=2027-12-19',
    ]);
  });

  it('INE: solo año, con precisión año', () => {
    const r = leer(
      'AÑO DE REGISTRO 2010 00\nEMISIÓN 2016 VIGENCIA 2016 - 2026',
    );
    expect(r.map((l) => [l.campo, l.clave, l.precision])).toEqual([
      ['fechaEmision', '2016', 'anio'],
      ['fechaVencimiento', '2026', 'anio'],
    ]);
  });

  it('visa: formato 09FEB2022', () => {
    expect(
      resumen(leer('Issue Date 09FEB2022  Expiration Date 07FEB2032')),
    ).toEqual(['0:fechaEmision=2022-02-09', '0:fechaVencimiento=2032-02-07']);
  });

  it('sin etiqueta no hay fecha; "Lugar de expedición" y "Issue Port" no son etiquetas', () => {
    expect(
      leer(
        'Tampico, 12/03/2020\nLugar de Expedición: Tampico 12/03/2020\nIssue Port: 12/03/2020',
      ),
    ).toEqual([]);
  });

  it('un año suelto con etiqueta de día es un error de lectura, no una fecha', () => {
    expect(leer('Fecha de Vencimiento: 2008-2023')).toEqual([]);
  });

  it('curso: "Date of course" y "Date of completion" como emisión (inglés)', () => {
    expect(resumen(leer('Date of course: 12 June 2026'))).toEqual([
      '0:fechaEmision=2026-06-12',
    ]);
    expect(resumen(leer('Completion date: 12 June 2026'))).toEqual([
      '0:fechaEmision=2026-06-12',
    ]);
  });

  it('curso: "Fecha de curso" como emisión (español)', () => {
    expect(resumen(leer('Fecha de curso: 12 de junio de 2026'))).toEqual([
      '0:fechaEmision=2026-06-12',
    ]);
  });

  it('refrendo: "Date of revalidation" como emisión', () => {
    expect(resumen(leer('Date of revalidation: 12 June 2026'))).toEqual([
      '0:fechaEmision=2026-06-12',
    ]);
  });
});
