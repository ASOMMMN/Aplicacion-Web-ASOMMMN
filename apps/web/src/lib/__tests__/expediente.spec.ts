import { contarTiposEntregados, esDocEvaluable, esTipoDocOpcional } from '../expediente';

const TIPOS = [
  'CURP',
  'INE',
  'acta_nacimiento',
  'visa',
  'pasaporte',
  'vacuna_fiebre_amarilla',
  'constancia_participacion',
  'certificado_medico',
  'libreta_identidad_maritima',
  'certificado_competencia',
  'refrendo',
];
const conArchivo = (...tipos: string[]) => tipos.map((tipo) => ({ tipo, cantidad: 1 }));

describe('contarTiposEntregados', () => {
  it('el total son los 8 tipos requeridos', () => {
    expect(contarTiposEntregados(TIPOS, []).total).toBe(8);
  });

  it('caso QA "9/8": los opcionales entregados no suman al numerador', () => {
    const requeridos = TIPOS.filter((t) => !esTipoDocOpcional(t));
    const r = contarTiposEntregados(TIPOS, conArchivo(...requeridos, 'vacuna_fiebre_amarilla', 'refrendo', 'visa'));
    expect(r).toEqual({ entregados: 8, total: 8 });
  });

  it('ignora tipos con cantidad 0 y tipos desconocidos', () => {
    const r = contarTiposEntregados(TIPOS, [
      { tipo: 'CURP', cantidad: 0 },
      { tipo: 'INE', cantidad: 2 },
      { tipo: 'otro', cantidad: 1 },
    ]);
    expect(r).toEqual({ entregados: 1, total: 8 });
  });
});

describe('esDocEvaluable', () => {
  it('los requeridos siempre; los opcionales (visa, vacuna, refrendo) solo con archivo', () => {
    expect(esDocEvaluable('CURP', 0)).toBe(true);
    expect(esDocEvaluable('visa', 0)).toBe(false);
    expect(esDocEvaluable('visa', 1)).toBe(true);
    expect(esDocEvaluable('refrendo', 1)).toBe(true);
    expect(esDocEvaluable('vacuna_fiebre_amarilla', 0)).toBe(false);
  });
});
