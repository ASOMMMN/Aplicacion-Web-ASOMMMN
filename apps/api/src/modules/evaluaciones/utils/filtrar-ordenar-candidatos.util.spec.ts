import 'reflect-metadata';
import { CandidatoListaItemDto } from '../dto/evaluaciones-response.dto';
import { EstadoCandidato } from '../dto/listar-candidatos-query.dto';
import {
  filtrarOrdenarCandidatos,
  FiltrosCandidatosNormalizados,
} from './filtrar-ordenar-candidatos.util';

function item(overrides: Partial<CandidatoListaItemDto> = {}): CandidatoListaItemDto {
  return {
    postulanteId: `id-${Math.random().toString(36).slice(2)}`,
    nombreCompleto: 'Juan Pérez',
    nombre: 'Juan',
    apellidos: 'Pérez',
    email: 'juan@x.com',
    estadoPostulacion: 'en_proceso',
    ciudad: undefined,
    pais: undefined,
    vacante: undefined,
    tieneCV: false,
    versionCV: undefined,
    creadoEn: new Date('2026-01-10') as unknown as Date,
    actualizadoEn: new Date('2026-01-11') as unknown as Date,
    estadoExpediente: 'en_proceso',
    porcentajeExpediente: 0,
    requisitosFaltantes: [],
    semaforoClave: 'rojo',
    docsEvaluados: 0,
    docsTotal: 10,
    estadoEvaluacion: 'pendiente',
    estadoGeneral: 'incompleto',
    eliminado: false,
    eliminadoOrigen: undefined,
    eliminadoEn: undefined,
    eliminadoMotivo: undefined,
    eliminadoPorNombre: undefined,
    eliminadoPorEmail: undefined,
    ...overrides,
  } as CandidatoListaItemDto;
}

const enviadoEnVacio = new Map<string, Date | undefined>();

function correr(
  items: CandidatoListaItemDto[],
  filtros: FiltrosCandidatosNormalizados = {},
  vista: 'activos' | 'papelera' = 'activos',
  origenEliminacion?: 'admin' | 'self' | 'desconocido',
  enviadoEnPorPostulante = enviadoEnVacio,
) {
  return filtrarOrdenarCandidatos(
    items,
    filtros,
    vista,
    origenEliminacion,
    enviadoEnPorPostulante,
  );
}

describe('filtrarOrdenarCandidatos — filtros', () => {
  it('vista=activos excluye eliminados; vista=papelera solo eliminados', () => {
    const items = [
      item({ postulanteId: 'a', eliminado: false }),
      item({ postulanteId: 'b', eliminado: true, eliminadoOrigen: 'admin' }),
    ];

    expect(correr(items, {}, 'activos').data.map((i) => i.postulanteId)).toEqual(['a']);
    expect(correr(items, {}, 'papelera').data.map((i) => i.postulanteId)).toEqual(['b']);
  });

  it('origenEliminacion solo aplica en vista=papelera', () => {
    const items = [
      item({ postulanteId: 'a', eliminado: true, eliminadoOrigen: 'admin' }),
      item({ postulanteId: 'b', eliminado: true, eliminadoOrigen: 'self' }),
    ];

    const resultado = correr(items, {}, 'papelera', 'self');
    expect(resultado.data.map((i) => i.postulanteId)).toEqual(['b']);
  });

  it('q ignora búsquedas de menos de 2 caracteres', () => {
    const items = [item({ nombreCompleto: 'Juan Pérez' })];
    const resultado = correr(items, { q: 'j' });
    expect(resultado.data).toHaveLength(1);
  });

  it('q busca en nombre y correo, normalizado (sin acentos, insensible a mayúsculas)', () => {
    const items = [
      item({ postulanteId: 'a', nombreCompleto: 'José Hernández', email: 'jose@x.com' }),
      item({ postulanteId: 'b', nombreCompleto: 'Pedro Ruiz', email: 'pedro@x.com' }),
    ];

    expect(correr(items, { q: 'jose' }).data.map((i) => i.postulanteId)).toEqual(['a']);
    expect(correr(items, { q: 'JOSÉ' }).data.map((i) => i.postulanteId)).toEqual(['a']);
    expect(correr(items, { q: 'pedro@x' }).data.map((i) => i.postulanteId)).toEqual(['b']);
  });

  it('vacante es multiselect con semántica OR (substring, insensible a mayúsculas)', () => {
    const items = [
      item({ postulanteId: 'a', vacante: 'Capitán' }),
      item({ postulanteId: 'b', vacante: 'Oficial de Máquinas' }),
      item({ postulanteId: 'c', vacante: 'Contramaestre' }),
    ];

    const resultado = correr(items, { vacante: ['capitán', 'máquinas'] });
    expect(resultado.data.map((i) => i.postulanteId).sort()).toEqual(['a', 'b']);
  });

  it('estado es multiselect sobre estadoGeneral con semántica OR', () => {
    const items = [
      item({ postulanteId: 'a', estadoGeneral: 'incompleto' }),
      item({ postulanteId: 'b', estadoGeneral: 'en_proceso' }),
      item({ postulanteId: 'c', estadoGeneral: 'completo' }),
    ];

    const resultado = correr(items, {
      estado: ['incompleto', 'completo'] as EstadoCandidato[],
    });
    expect(resultado.data.map((i) => i.postulanteId).sort()).toEqual(['a', 'c']);
  });

  it('fechaDesde/fechaHasta son un rango inclusivo (incluye el día completo de fechaHasta)', () => {
    const items = [
      item({ postulanteId: 'antes', creadoEn: new Date('2026-01-04') as unknown as Date }),
      item({ postulanteId: 'inicio', creadoEn: new Date('2026-01-05T00:00:00.000Z') as unknown as Date }),
      item({ postulanteId: 'medio', creadoEn: new Date('2026-01-07') as unknown as Date }),
      item({ postulanteId: 'fin', creadoEn: new Date('2026-01-10T23:59:00.000Z') as unknown as Date }),
      item({ postulanteId: 'despues', creadoEn: new Date('2026-01-11') as unknown as Date }),
    ];

    const resultado = correr(items, { fechaDesde: '2026-01-05', fechaHasta: '2026-01-10' });
    expect(resultado.data.map((i) => i.postulanteId).sort()).toEqual(['fin', 'inicio', 'medio']);
  });

  it('en vista=papelera, el rango de fechas aplica sobre eliminadoEn (no creadoEn)', () => {
    const items = [
      item({
        postulanteId: 'a',
        eliminado: true,
        creadoEn: new Date('2020-01-01') as unknown as Date,
        eliminadoEn: new Date('2026-01-06') as unknown as Date,
      }),
      item({
        postulanteId: 'b',
        eliminado: true,
        creadoEn: new Date('2026-01-06') as unknown as Date,
        eliminadoEn: new Date('2020-01-01') as unknown as Date,
      }),
    ];

    const resultado = correr(
      items,
      { fechaDesde: '2026-01-01', fechaHasta: '2026-01-31' },
      'papelera',
    );
    expect(resultado.data.map((i) => i.postulanteId)).toEqual(['a']);
  });

  it('avance: sin_avance=0%, parcial=1-99%, completo=100%', () => {
    const items = [
      item({ postulanteId: 'cero', porcentajeExpediente: 0 }),
      item({ postulanteId: 'medio', porcentajeExpediente: 50 }),
      item({ postulanteId: 'full', porcentajeExpediente: 100 }),
    ];

    expect(correr(items, { avance: 'sin_avance' }).data.map((i) => i.postulanteId)).toEqual(['cero']);
    expect(correr(items, { avance: 'parcial' }).data.map((i) => i.postulanteId)).toEqual(['medio']);
    expect(correr(items, { avance: 'completo' }).data.map((i) => i.postulanteId)).toEqual(['full']);
  });

  it('docs: ninguno=0 evaluados, parcial=0<evaluados<total, completo=evaluados===total', () => {
    const items = [
      item({ postulanteId: 'ninguno', docsEvaluados: 0, docsTotal: 10 }),
      item({ postulanteId: 'parcial', docsEvaluados: 5, docsTotal: 10 }),
      item({ postulanteId: 'completo', docsEvaluados: 10, docsTotal: 10 }),
    ];

    expect(correr(items, { docs: 'ninguno' }).data.map((i) => i.postulanteId)).toEqual(['ninguno']);
    expect(correr(items, { docs: 'parcial' }).data.map((i) => i.postulanteId)).toEqual(['parcial']);
    expect(correr(items, { docs: 'completo' }).data.map((i) => i.postulanteId)).toEqual(['completo']);
  });

  it('actividadAntesDe incluye solo candidatos cuya última actividad fue en o antes del corte', () => {
    const items = [
      item({ postulanteId: 'inactivo', actualizadoEn: new Date('2026-01-01') as unknown as Date }),
      item({ postulanteId: 'justo-en-corte', actualizadoEn: new Date('2026-01-08') as unknown as Date }),
      item({ postulanteId: 'activo', actualizadoEn: new Date('2026-01-15') as unknown as Date }),
    ];

    const resultado = correr(items, { actividadAntesDe: '2026-01-08' });
    expect(resultado.data.map((i) => i.postulanteId).sort()).toEqual(['inactivo', 'justo-en-corte']);
  });

  it('combina filtros con AND entre tipos distintos', () => {
    const items = [
      item({ postulanteId: 'match', vacante: 'Capitán', porcentajeExpediente: 50 }),
      item({ postulanteId: 'solo-vacante', vacante: 'Capitán', porcentajeExpediente: 100 }),
      item({ postulanteId: 'solo-avance', vacante: 'Otra', porcentajeExpediente: 50 }),
    ];

    const resultado = correr(items, { vacante: ['Capitán'], avance: 'parcial' });
    expect(resultado.data.map((i) => i.postulanteId)).toEqual(['match']);
  });

  it('conteos refleja la distribución completa, sin aplicar el filtro `estado`', () => {
    const items = [
      item({ postulanteId: 'a', estadoGeneral: 'incompleto' }),
      item({ postulanteId: 'b', estadoGeneral: 'en_proceso' }),
      item({ postulanteId: 'c', estadoGeneral: 'completo' }),
    ];

    const resultado = correr(items, { estado: ['incompleto'] as EstadoCandidato[] });
    expect(resultado.data).toHaveLength(1);
    expect(resultado.conteos).toEqual({
      incompleto: 1,
      en_proceso: 1,
      completo: 1,
      enviado: 0,
      evaluado: 0,
    });
  });
});

describe('filtrarOrdenarCandidatos — orden', () => {
  it('estadoGeneral ordena por rango de flujo, no alfabéticamente', () => {
    const items = [
      item({ postulanteId: 'evaluado', estadoGeneral: 'evaluado' }),
      item({ postulanteId: 'incompleto', estadoGeneral: 'incompleto' }),
      item({ postulanteId: 'enviado', estadoGeneral: 'enviado' }),
      item({ postulanteId: 'completo', estadoGeneral: 'completo' }),
      item({ postulanteId: 'en_proceso', estadoGeneral: 'en_proceso' }),
    ];

    const asc = correr(items, { ordenarPor: 'estadoGeneral', direccion: 'asc' });
    expect(asc.data.map((i) => i.postulanteId)).toEqual([
      'incompleto',
      'en_proceso',
      'completo',
      'enviado',
      'evaluado',
    ]);

    const desc = correr(items, { ordenarPor: 'estadoGeneral', direccion: 'desc' });
    expect(desc.data.map((i) => i.postulanteId)).toEqual([
      'evaluado',
      'enviado',
      'completo',
      'en_proceso',
      'incompleto',
    ]);
  });

  it('docsEvaluados ordena por proporción evaluados/total, con desempate por conteo', () => {
    const items = [
      item({ postulanteId: 'bajo-conteo-alto', docsEvaluados: 8, docsTotal: 20 }), // 40%
      item({ postulanteId: 'alto', docsEvaluados: 9, docsTotal: 10 }), // 90%
      item({ postulanteId: 'empate-mas', docsEvaluados: 4, docsTotal: 10 }), // 40%, más conteo que 2/5
      item({ postulanteId: 'empate-menos', docsEvaluados: 2, docsTotal: 5 }), // 40%, menos conteo
    ];

    const asc = correr(items, { ordenarPor: 'docsEvaluados', direccion: 'asc' });
    expect(asc.data.map((i) => i.postulanteId)).toEqual([
      'empate-menos',
      'empate-mas',
      'bajo-conteo-alto',
      'alto',
    ]);
  });

  it('nombreCompleto ordena A-Z sin distinguir acentos', () => {
    const items = [
      item({ postulanteId: 'ursula', nombreCompleto: 'Úrsula Ramos' }),
      item({ postulanteId: 'ana', nombreCompleto: 'Ana Ibáñez' }),
      item({ postulanteId: 'bruno', nombreCompleto: 'Bruno Núñez' }),
    ];

    const resultado = correr(items, { ordenarPor: 'nombreCompleto', direccion: 'asc' });
    expect(resultado.data.map((i) => i.postulanteId)).toEqual(['ana', 'bruno', 'ursula']);
  });

  it('desempate estable por postulanteId cuando el campo de orden empata', () => {
    const items = [
      item({ postulanteId: 'z', porcentajeExpediente: 50 }),
      item({ postulanteId: 'a', porcentajeExpediente: 50 }),
      item({ postulanteId: 'm', porcentajeExpediente: 50 }),
    ];

    const resultado = correr(items, { ordenarPor: 'porcentajeExpediente', direccion: 'asc' });
    expect(resultado.data.map((i) => i.postulanteId)).toEqual(['a', 'm', 'z']);
  });

  it('sin ordenarPor: enviados sin evaluar primero (FIFO por enviadoEn), resto por actualizadoEn desc', () => {
    const enviadoEnPorPostulante = new Map<string, Date | undefined>([
      ['enviado-viejo', new Date('2026-01-01')],
      ['enviado-nuevo', new Date('2026-01-05')],
    ]);
    const items = [
      item({
        postulanteId: 'activo-reciente',
        estadoGeneral: 'en_proceso',
        actualizadoEn: new Date('2026-01-20') as unknown as Date,
      }),
      item({
        postulanteId: 'enviado-nuevo',
        estadoGeneral: 'enviado',
      }),
      item({
        postulanteId: 'activo-viejo',
        estadoGeneral: 'en_proceso',
        actualizadoEn: new Date('2026-01-10') as unknown as Date,
      }),
      item({
        postulanteId: 'enviado-viejo',
        estadoGeneral: 'enviado',
      }),
    ];

    const resultado = correr(items, {}, 'activos', undefined, enviadoEnPorPostulante);
    expect(resultado.data.map((i) => i.postulanteId)).toEqual([
      'enviado-viejo',
      'enviado-nuevo',
      'activo-reciente',
      'activo-viejo',
    ]);
  });
});
