import { calcularProgresoExpediente } from './progreso-expediente.util';
import {
  CLAVES_REQUISITO,
  REQUISITOS_EXPEDIENTE,
} from '../constants/expediente.constants';

const REQUERIDOS_DOCS = [
  'CURP',
  'INE',
  'acta_nacimiento',
  'pasaporte',
  'constancia_participacion',
  'certificado_medico',
  'libreta_identidad_maritima',
  'certificado_competencia',
];
const OPCIONALES = ['vacuna_fiebre_amarilla', 'visa', 'refrendo'];

describe('calcularProgresoExpediente', () => {
  it('requeridos = 8 documentos personales + cv + vacante; opcionales = vacuna, visa, refrendo', () => {
    const requeridos = REQUISITOS_EXPEDIENTE.filter((r) => r.requerido).map(
      (r) => r.clave,
    );
    const opcionales = REQUISITOS_EXPEDIENTE.filter((r) => !r.requerido).map(
      (r) => r.clave,
    );
    expect(requeridos.sort()).toEqual(
      [...REQUERIDOS_DOCS, 'cv', 'vacante'].sort(),
    );
    expect(opcionales.sort()).toEqual([...OPCIONALES].sort());
  });

  it('visa y refrendo se pueden evaluar (están en CLAVES_REQUISITO)', () => {
    expect(CLAVES_REQUISITO).toEqual(
      expect.arrayContaining(['visa', 'refrendo']),
    );
  });

  it('expediente vacío: 0 %, faltan los 10 requeridos y se evalúan 10', () => {
    const p = calcularProgresoExpediente({
      tiposEntregados: [],
      tieneCV: false,
      tieneVacante: false,
    });
    expect(p).toMatchObject({
      porcentajeExpediente: 0,
      requeridosTotal: 10,
      requeridosCumplidos: 0,
      docsTotal: 10,
      docsEvaluados: 0,
    });
    expect(p.requisitosFaltantes).toHaveLength(10);
  });

  it('caso QA "9/8": con los requeridos y 2 opcionales el avance es 100 %, no más', () => {
    const p = calcularProgresoExpediente({
      tiposEntregados: [
        ...REQUERIDOS_DOCS,
        'vacuna_fiebre_amarilla',
        'refrendo',
      ],
      tieneCV: true,
      tieneVacante: true,
    });
    expect(p.porcentajeExpediente).toBe(100);
    expect(p.requeridosCumplidos).toBe(p.requeridosTotal);
    expect(p.requisitosFaltantes).toEqual([]);
    // Los opcionales entregados se suman a lo evaluable, no al avance.
    expect(p.docsTotal).toBe(12);
    expect(p.clavesEvaluables).toEqual(
      expect.arrayContaining(['vacuna_fiebre_amarilla', 'refrendo']),
    );
    expect(p.clavesEvaluables).not.toContain('visa');
  });

  it('un opcional solo es evaluable si se entregó', () => {
    const sinVisa = calcularProgresoExpediente({
      tiposEntregados: ['CURP'],
      tieneCV: false,
      tieneVacante: false,
    });
    const conVisa = calcularProgresoExpediente({
      tiposEntregados: ['CURP', 'visa'],
      tieneCV: false,
      tieneVacante: false,
    });
    expect(sinVisa.clavesEvaluables).not.toContain('visa');
    expect(conVisa.clavesEvaluables).toContain('visa');
    expect(conVisa.porcentajeExpediente).toBe(sinVisa.porcentajeExpediente);
  });

  it('docsEvaluados nunca supera docsTotal', () => {
    const p = calcularProgresoExpediente({
      tiposEntregados: ['CURP'],
      tieneCV: true,
      tieneVacante: true,
      // visa evaluada pero sin archivo, clave legado y una repetida: no suman de más.
      clavesEvaluadas: ['CURP', 'CURP', 'cv', 'visa', 'general', 'desconocida'],
    });
    expect(p.docsEvaluados).toBe(2);
    expect(p.docsEvaluados).toBeLessThanOrEqual(p.docsTotal);
  });

  it('todo evaluado = docsEvaluados igual a docsTotal', () => {
    const tiposEntregados = [...REQUERIDOS_DOCS, 'visa'];
    const p = calcularProgresoExpediente({
      tiposEntregados,
      tieneCV: true,
      tieneVacante: true,
      clavesEvaluadas: [...tiposEntregados, 'cv', 'vacante'],
    });
    expect(p.docsEvaluados).toBe(p.docsTotal);
    expect(p.docsTotal).toBe(11);
  });

  it('el % se redondea y cuenta cv y vacante como requeridos', () => {
    const p = calcularProgresoExpediente({
      tiposEntregados: [],
      tieneCV: true,
      tieneVacante: true,
    });
    expect(p.porcentajeExpediente).toBe(20); // 2 de 10
  });
});
