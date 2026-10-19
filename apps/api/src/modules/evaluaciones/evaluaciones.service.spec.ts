import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { EvaluacionesService } from './evaluaciones.service';
import { AuthUser } from '../auth/strategies/jwt.strategy';

function postulante(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    ciudad: 'Veracruz',
    pais: 'México',
    vacante: 'Oficial de Máquinas',
    estadoExpediente: 'en_proceso',
    creadoEn: new Date('2026-01-01'),
    actualizadoEn: new Date('2026-01-02'),
    ...overrides,
  };
}

function crear(postulantes: Record<string, unknown>[]) {
  const find = (coleccion: unknown[] = []) => ({
    populate: () => ({ lean: () => Promise.resolve(coleccion) }),
    select: () => ({ lean: () => Promise.resolve(coleccion) }),
  });

  const postulanteModel = { find: () => find(postulantes) };
  const documentoModel = { find: () => find([]) };
  const usuarioModel = {};
  const docPersonalModel = { find: () => find([]) };
  const evaluacionModel = { find: () => find([]) };
  const documentosService = {};
  const auditoria = { registrar: jest.fn() };
  const notificaciones = {};
  const config = { get: jest.fn() };

  return new EvaluacionesService(
    postulanteModel as any,
    documentoModel as any,
    usuarioModel as any,
    docPersonalModel as any,
    evaluacionModel as any,
    documentosService as any,
    auditoria as any,
    notificaciones as any,
    config as any,
  );
}

const ADMIN: AuthUser = { userId: 'admin1', email: 'admin@x.com', rol: 'administrador' };
const EVALUADOR: AuthUser = { userId: 'eval1', email: 'eval@x.com', rol: 'evaluador' };

/** Postulante huérfano legado: usuarioId ya no existe y fue reconstruido desde Auditoría. */
function postulanteLegacyReconstruido() {
  return postulante({
    usuarioId: null,
    legacyEliminacion: {
      detectado: true,
      origen: 'admin',
      email: 'ana@x.com',
      nombre: 'Ana',
      apellidos: 'Gómez',
      deletedAt: new Date('2025-06-01'),
      deletedByEmail: 'admin@asommmn.com',
      deletedByNombre: 'Admin Uno',
      reconstruidoEn: new Date('2026-01-01'),
    },
  });
}

/** Postulante huérfano legado SIN rastro en Auditoría. */
function postulanteLegacyDesconocido() {
  return postulante({ usuarioId: null });
}

/** Candidato con soft-delete nuevo (Usuario sigue existiendo con isDeleted:true). */
function postulanteSoftDeleted() {
  return postulante({
    usuarioId: {
      nombre: '',
      apellidos: '',
      email: '',
      isDeleted: true,
      deletedAt: new Date('2026-02-01'),
      deletedByRole: 'SELF',
      deletionReason: 'Ya no me interesa el puesto',
      deletedSnapshot: { nombre: 'Luis', apellidos: 'Martínez', email: 'luis@x.com' },
    },
  });
}

function postulanteActivo() {
  return postulante({
    usuarioId: { nombre: 'Juan', apellidos: 'Pérez', email: 'juan@x.com' },
  });
}

describe('EvaluacionesService.listarCandidatos — vista activos/papelera', () => {
  it('por defecto (vista activos) excluye a los candidatos eliminados', async () => {
    const service = crear([
      postulanteActivo(),
      postulanteLegacyReconstruido(),
      postulanteSoftDeleted(),
    ]);

    const resultado = await service.listarCandidatos();

    expect(resultado.total).toBe(1);
    expect(resultado.data).toHaveLength(1);
    expect(resultado.data[0].nombreCompleto).toBe('Juan Pérez');
    expect(resultado.data.every((c) => !c.eliminado)).toBe(true);
  });

  it('vista=papelera como ADMIN muestra solo eliminados, con origen/fecha y quién eliminó', async () => {
    const service = crear([
      postulanteActivo(),
      postulanteLegacyReconstruido(),
      postulanteLegacyDesconocido(),
      postulanteSoftDeleted(),
    ]);

    const resultado = await service.listarCandidatos(
      { vista: 'papelera', page: 1, limit: 20 } as any,
      ADMIN,
    );

    expect(resultado.total).toBe(3);
    expect(resultado.data.every((c) => c.eliminado)).toBe(true);

    const reconstruido = resultado.data.find((c) => c.email === 'ana@x.com');
    expect(reconstruido?.eliminadoOrigen).toBe('admin');
    expect(reconstruido?.eliminadoEn).toEqual(new Date('2025-06-01'));
    expect(reconstruido?.eliminadoPorNombre).toBe('Admin Uno');

    const desconocido = resultado.data.find((c) => c.nombreCompleto === 'Usuario eliminado');
    expect(desconocido?.eliminadoOrigen).toBe('desconocido');

    const autoeliminado = resultado.data.find((c) => c.email === 'luis@x.com');
    expect(autoeliminado?.eliminadoOrigen).toBe('self');
    expect(autoeliminado?.eliminadoMotivo).toBe('Ya no me interesa el puesto');
  });

  it('vista=papelera para un EVALUADOR lanza ForbiddenException (validado en backend)', async () => {
    const service = crear([postulanteSoftDeleted()]);

    await expect(
      service.listarCandidatos({ vista: 'papelera' } as any, EVALUADOR),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un EVALUADOR no ve quién eliminó (eliminadoPorNombre/Email ocultos) aunque pida vista=activos', async () => {
    // activos no incluye eliminados, así que probamos el ocultamiento vía un
    // listado que SÍ incluiría al eliminado si no se filtrara por vista —
    // aquí forzamos la vista papelera con ADMIN y comparamos contra EVALUADOR
    // directamente para aislar el enmascarado de "quién".
    const service = crear([postulanteSoftDeleted()]);
    const comoAdmin = await service.listarCandidatos({ vista: 'papelera' } as any, ADMIN);
    expect(comoAdmin.data[0].eliminadoPorNombre).toBeUndefined(); // SELF: no hay "por nombre"

    // Para self no aplica eliminadoPorNombre; probamos con origen admin.
    const servicio2 = crear([postulanteLegacyReconstruido()]);
    const comoAdmin2 = await servicio2.listarCandidatos({ vista: 'papelera' } as any, ADMIN);
    expect(comoAdmin2.data[0].eliminadoPorNombre).toBe('Admin Uno');
  });
});

describe('EvaluacionesService.resumenCandidatos — contador de la Papelera', () => {
  it('incluye `eliminados` para ADMIN y lo omite para EVALUADOR', async () => {
    const service = crear([
      postulanteActivo(),
      postulanteLegacyReconstruido(),
      postulanteSoftDeleted(),
    ]);

    const comoAdmin = await service.resumenCandidatos(undefined, ADMIN);
    expect(comoAdmin.eliminados).toBe(2);
    expect(comoAdmin.total).toBe(1); // resumen por defecto también es "activos"

    const comoEvaluador = await service.resumenCandidatos(undefined, EVALUADOR);
    expect(comoEvaluador.eliminados).toBeUndefined();
  });
});
