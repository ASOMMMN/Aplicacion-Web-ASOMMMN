import { elegirFechaDelLiteral } from './elegir-fecha-literal';
import { digitoVerificador } from './mrz';

const elegir = (
  literal: string,
  campo: 'fechaEmision' | 'fechaInicio' | 'fechaVencimiento',
  valorModelo?: string | null,
  etiquetaModelo?: string | null,
) => elegirFechaDelLiteral(literal, campo, { valorModelo, etiquetaModelo });

describe('elegirFechaDelLiteral: varias fechas en el literal', () => {
  it('caso del diagnóstico: el modelo acierta el vencimiento de un rango de vigencia', () => {
    const r = elegir(
      'Vigencia del 01/02/2023 al 01/02/2028',
      'fechaVencimiento',
      '2028-02-01',
    );
    expect(r?.fecha.iso).toBe('2028-02-01');
    expect(r?.dudosa).toBe(false);
  });

  it('caso del diagnóstico: literal "del X al Y" sin palabra vigencia pero con etiqueta de vigencia del modelo', () => {
    const r = elegir(
      'del 01/02/2023 al 01/02/2028',
      'fechaVencimiento',
      '2028-02-01',
      'Vigencia',
    );
    expect(r?.fecha.iso).toBe('2028-02-01');
    expect(r?.motivo).toBe('rango');
  });

  it('rango de vigencia: inicio = X y vencimiento = Y aunque el modelo se equivoque', () => {
    const literal = 'Vigencia: del 01/02/2023 al 01/02/2028';
    expect(elegir(literal, 'fechaInicio', null)?.fecha.iso).toBe('2023-02-01');
    expect(elegir(literal, 'fechaVencimiento', '2023-02-01')?.fecha.iso).toBe(
      '2028-02-01',
    );
  });

  it('"valid from X to Y" en inglés', () => {
    const literal = 'Certificate valid from 10 MAR 2024 to 09 MAR 2029';
    expect(elegir(literal, 'fechaInicio')?.fecha.iso).toBe('2024-03-10');
    expect(elegir(literal, 'fechaVencimiento')?.fecha.iso).toBe('2029-03-09');
  });

  it('periodo de impartición (sin etiqueta de vigencia): el fin NUNCA es el vencimiento', () => {
    const literal = 'Impartido del 10/06/2024 al 14/06/2024';
    const venc = elegir(literal, 'fechaVencimiento', '2024-06-14');
    expect(venc).toBeNull();
    const inicio = elegir(literal, 'fechaInicio');
    expect(inicio?.fecha.iso).toBe('2024-06-10');
    expect(inicio?.rangoEsVigencia).toBe(false);
    expect(inicio?.finRango?.iso).toBe('2024-06-14');
  });

  it('dos fechas con etiqueta: la más cercana a la etiqueta del campo', () => {
    const literal = 'Expedición: 09/02/2022 Vencimiento: 09/02/2027';
    expect(elegir(literal, 'fechaEmision')?.fecha.iso).toBe('2022-02-09');
    expect(elegir(literal, 'fechaVencimiento')?.fecha.iso).toBe('2027-02-09');
    // El modelo dio el valor correcto: se acepta.
    expect(elegir(literal, 'fechaVencimiento', '2027-02-09')?.motivo).toBe(
      'modelo',
    );
  });

  it('solo año: el año pegado a la etiqueta, no el último', () => {
    const literal = 'EMISIÓN 2021 VIGENCIA 2031';
    expect(elegir(literal, 'fechaEmision')?.fecha.anio).toBe(2021);
    expect(elegir(literal, 'fechaVencimiento')?.fecha.anio).toBe(2031);
  });

  it('sin etiquetas ni coincidencia con el modelo: la más probable, marcada dudosa', () => {
    const r = elegir(
      '03/05/2021 y 03/05/2026',
      'fechaVencimiento',
      '2030-01-01',
    );
    expect(r?.fecha.iso).toBe('2026-05-03');
    expect(r?.dudosa).toBe(true);
    const e = elegir('03/05/2021 y 03/05/2026', 'fechaEmision');
    expect(e?.fecha.iso).toBe('2021-05-03');
    expect(e?.dudosa).toBe(true);
  });

  it('el modelo invirtió día y mes: se reconoce y se corrige a dd/mm', () => {
    const r = elegir('03/04/2025', 'fechaEmision', '2025-03-04');
    expect(r?.motivo).toBe('modelo_invertido');
    expect(r?.fecha.iso).toBe('2025-04-03');
  });

  it('MRZ en el literal del vencimiento', () => {
    const nac = '850315';
    const venc = '271219';
    const linea = `G12345678${digitoVerificador('G12345678')}MEX${nac}${digitoVerificador(nac)}F${venc}${digitoVerificador(venc)}${'<'.repeat(14)}00`;
    const r = elegir(linea, 'fechaVencimiento', null);
    expect(r?.motivo).toBe('mrz');
    expect(r?.fecha.iso).toBe('2027-12-19');
  });

  it('sin fechas → null', () => {
    expect(elegir('ver reverso', 'fechaEmision', '2020-01-01')).toBeNull();
  });
});
