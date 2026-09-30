import {
  claveFecha,
  formatearConPrecision,
  leerFechaLiteral,
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
