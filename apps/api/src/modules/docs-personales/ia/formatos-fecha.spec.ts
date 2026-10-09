import {
  claveFecha,
  formatearConPrecision,
  detectarIndicadorFormato,
  expandirNumerosEnLetras,
  formatoPorFechasDelDocumento,
  leerFechaLiteral,
  leerFechasLiteral,
  valorGuardado,
} from './formatos-fecha';

const iso = (t: string, f?: string) => leerFechaLiteral(t, f)?.iso;

describe('leerFechaLiteral: formatos con día', () => {
  it.each([
    ['09-05-2024', '2024-05-09'],
    ['09/05/2024', '2024-05-09'],
    ['09.05.2024', '2024-05-09'],
    ['09 05 2024', '2024-05-09'],
    ['2024-05-09', '2024-05-09'],
    ['10-09-2021 (dd/mm/aaaa)', '2021-09-10'],
    ['11 de abril de 2025', '2025-04-11'],
    ['11 de abril de 2025 (Apr 11th 2025)', '2025-04-11'],
    ['Apr 11th 2025', '2025-04-11'],
    ['April 11, 2025', '2025-04-11'],
    ['09 MAY 2024', '2024-05-09'],
    ['09MAY2024', '2024-05-09'],
    ['MAY 09 2024', '2024-05-09'],
    ['19 DEC/DIC 2025', '2025-12-19'],
    ['1° de septiembre de 2023', '2023-09-01'],
    ['05-04-29', '2029-04-05'],
  ])('%s → %s', (texto, esperado) => {
    const f = leerFechaLiteral(texto);
    expect(f?.precision).toBe('dia');
    expect(f?.iso).toBe(esperado);
  });

  it('dd/mm por defecto; mm/dd solo si el documento lo declara', () => {
    expect(iso('12/03/2025')).toBe('2025-03-12');
    expect(iso('12/03/2025', 'mm/dd/yyyy')).toBe('2025-12-03');
    expect(leerFechaLiteral('12/03/2025')?.ambigua).toBe(true);
  });

  it('fechas imposibles no se aceptan como día', () => {
    expect(leerFechaLiteral('31/02/2024')?.precision).not.toBe('dia');
  });
});

describe('leerFechaLiteral: fechas escritas completamente con palabras', () => {
  it.each([
    ['veinticuatro de mayo de dos mil diecisiete', '2017-05-24'],
    ['veinticuatro de mayo del dos mil diecisiete', '2017-05-24'],
    ['primero de enero de dos mil veinticuatro', '2024-01-01'],
    ['a los nueve días del mes de mayo de dos mil diecisiete', '2017-05-09'],
    [
      'treinta y uno de diciembre de mil novecientos noventa y siete',
      '1997-12-31',
    ],
    ['twenty-fourth of May 2017', '2017-05-24'],
    ['twenty fourth of May 2017', '2017-05-24'],
    ['first of January 2024', '2024-01-01'],
    ['thirty-first of December 1997', '1997-12-31'],
  ])('%s → %s', (texto, esperado) => {
    const f = leerFechaLiteral(texto);
    expect(f?.precision).toBe('dia');
    expect(f?.iso).toBe(esperado);
  });

  it('un año solo en letras (sin día) da precisión año', () => {
    const f = leerFechaLiteral('dos mil diecisiete')!;
    expect(f.precision).toBe('anio');
    expect(f.anio).toBe(2017);
  });
});

describe('expandirNumerosEnLetras', () => {
  it('convierte día y año en letras a dígitos (español)', () => {
    expect(
      expandirNumerosEnLetras('veinticuatro de mayo de dos mil diecisiete'),
    ).toBe('24 de mayo de 2017');
  });

  it('convierte día en letras a dígitos (inglés), año ya numérico', () => {
    expect(expandirNumerosEnLetras('twenty-fourth of may 2017')).toBe(
      '24 of may 2017',
    );
  });

  it('texto sin números en letras queda igual', () => {
    expect(expandirNumerosEnLetras('fecha de expedición: 24/05/2017')).toBe(
      'fecha de expedición: 24/05/2017',
    );
  });

  it('una "y" suelta sin número alrededor no se toca', () => {
    expect(expandirNumerosEnLetras('mayo y junio')).toBe('mayo y junio');
  });
});

describe('leerFechaLiteral: fechas parciales (precisión desde el texto)', () => {
  it.each([
    ['EMISIÓN 2016', 'anio', '2016'],
    ['2016', 'anio', '2016'],
    ['VIGENCIA 2021 - 2031', 'anio', '2031'],
    ['abril de 2025', 'mes', '2025-04'],
    ['APR 2025', 'mes', '2025-04'],
    ['04/2025', 'mes', '2025-04'],
  ])('%s → %s', (texto, precision, clave) => {
    const f = leerFechaLiteral(texto)!;
    expect(f.precision).toBe(precision);
    expect(claveFecha(f)).toBe(clave);
  });

  it('sin fecha → null', () => {
    expect(leerFechaLiteral('ver reverso')).toBeNull();
    expect(leerFechaLiteral('24 horas')).toBeNull();
  });
});

describe('valorGuardado y formato con precisión', () => {
  it('parcial: inicio del periodo en emisión, fin en vencimiento', () => {
    const anio = leerFechaLiteral('2016')!;
    expect(valorGuardado(anio, 'fechaEmision')).toBe('2016-01-01');
    expect(valorGuardado(anio, 'fechaVencimiento')).toBe('2016-12-31');
    const mes = leerFechaLiteral('02/2024')!;
    expect(valorGuardado(mes, 'fechaVencimiento')).toBe('2024-02-29');
  });

  it('se muestra con la precisión real', () => {
    expect(formatearConPrecision('2016-01-01', 'anio')).toBe('2016');
    expect(formatearConPrecision('2025-04-01', 'mes')).toBe('04/2025');
    expect(formatearConPrecision('2024-05-09', 'dia')).toBe('09/05/2024');
  });
});

describe('leerFechasLiteral: todas las fechas, en orden', () => {
  it('rango "del X al Y" → dos fechas', () => {
    const fs = leerFechasLiteral('del 01/02/2023 al 01/02/2028');
    expect(fs.map((f) => f.iso)).toEqual(['2023-02-01', '2028-02-01']);
    expect(fs[0].ini).toBeLessThan(fs[1].ini);
  });

  it('"EMISIÓN 2021 VIGENCIA 2031" → dos años separados', () => {
    const fs = leerFechasLiteral('EMISIÓN 2021 VIGENCIA 2031');
    expect(fs.map((f) => [f.precision, f.anio])).toEqual([
      ['anio', 2021],
      ['anio', 2031],
    ]);
  });

  it('"VIGENCIA 2021 - 2031" sigue siendo un solo rango de años', () => {
    const fs = leerFechasLiteral('VIGENCIA 2021 - 2031');
    expect(fs).toHaveLength(1);
    expect(fs[0].anios).toEqual([2021, 2031]);
  });

  it('una fecha completa ilegible no se degrada a año', () => {
    expect(leerFechasLiteral('10-00-2021')).toEqual([]);
  });
});

describe('dd MMM aa (mes con letra y año de 2 dígitos)', () => {
  it.each([
    ['19 DEC 27', '2027-12-19'],
    ['19DEC27', '2027-12-19'],
    ['09 FEB 22', '2022-02-09'],
    ['01-ENE-30', '2030-01-01'],
  ])('%s → %s', (texto, esperado) => {
    expect(leerFechaLiteral(texto)?.iso).toBe(esperado);
  });

  it('no confunde un año de 4 dígitos', () => {
    expect(leerFechaLiteral('19 DEC 2027')?.iso).toBe('2027-12-19');
  });
});

describe('ambigüedad dd/mm: se calcula siempre', () => {
  it('03/04/2025 sin formato → dd/mm y ambigua', () => {
    const f = leerFechaLiteral('03/04/2025')!;
    expect(f.iso).toBe('2025-04-03');
    expect(f.ambigua).toBe(true);
  });

  it('03/04/2025 con formato declarado: sigue marcada ambigua', () => {
    expect(leerFechaLiteral('03/04/2025', 'dd/mm/aaaa')?.ambigua).toBe(true);
    expect(leerFechaLiteral('03/04/2025', 'mm/dd/aaaa')?.ambigua).toBe(true);
  });

  it('día > 12 no es ambigua', () => {
    expect(leerFechaLiteral('13/04/2025')?.ambigua).toBe(false);
  });
});

describe('detectarIndicadorFormato', () => {
  it.each([
    ['Fecha de expedición (dd/mm/aaaa): 03/04/2025', 'dd/mm/aaaa'],
    ['DD MM YYYY', 'dd/mm/aaaa'],
    ['Date of issue (MM/DD/YYYY)', 'mm/dd/aaaa'],
    ['día/mes/año', 'dd/mm/aaaa'],
  ])('%s → %s', (texto, esperado) => {
    expect(detectarIndicadorFormato(texto)).toBe(esperado);
  });

  it('sin indicador o con ambos → null', () => {
    expect(detectarIndicadorFormato('Fecha: 03/04/2025')).toBeNull();
    expect(detectarIndicadorFormato('dd/mm/aaaa', 'mm/dd/yyyy')).toBeNull();
    expect(detectarIndicadorFormato(null, undefined)).toBeNull();
  });
});

describe('formatoPorFechasDelDocumento', () => {
  it('otra fecha con el primer número > 12 confirma dd/mm', () => {
    expect(
      formatoPorFechasDelDocumento(
        'Fecha de expedición: 03/04/2025\nFecha de vencimiento: 25/12/2030',
      ),
    ).toBe('dd/mm/aaaa');
  });

  it('otra fecha con el segundo número > 12 confirma mm/dd', () => {
    expect(
      formatoPorFechasDelDocumento(
        'Issue date: 03/04/2025\nExpiration date: 12/25/2030',
      ),
    ).toBe('mm/dd/aaaa');
  });

  it('fechas que implican ambos formatos → conflicto', () => {
    expect(
      formatoPorFechasDelDocumento(
        'Documento 1: 25/12/2025\nDocumento 2: 12/25/2030',
      ),
    ).toBe('conflicto');
  });

  it('sin ninguna fecha no ambigua en el documento → null', () => {
    expect(
      formatoPorFechasDelDocumento('Fecha de expedición: 03/04/2025'),
    ).toBeNull();
    expect(formatoPorFechasDelDocumento(null, undefined)).toBeNull();
  });
});
