import { Types } from 'mongoose';
import { EvaluacionesService } from './evaluaciones.service';

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

describe('EvaluacionesService.listarCandidatos', () => {
  it('muestra un nombre de respaldo para un usuario eliminado sin ocultar la fila', async () => {
    // usuarioId null: lo que deja populate() cuando el usuario referenciado
    // ya no existe (p.ej. eliminarUsuario() no hace cascade delete).
    const service = crear([
      postulante({ usuarioId: null }),
      postulante({
        usuarioId: { nombre: 'Juan', apellidos: 'Pérez', email: 'juan@x.com' },
      }),
    ]);

    const resultado = await service.listarCandidatos();

    expect(resultado.total).toBe(2);
    expect(resultado.data).toHaveLength(2);

    const huerfano = resultado.data.find((c) => c.email === '');
    expect(huerfano?.nombreCompleto).toBe('Usuario eliminado');
    expect(huerfano?.ciudad).toBe('Veracruz');

    const normal = resultado.data.find((c) => c.email === 'juan@x.com');
    expect(normal?.nombreCompleto).toBe('Juan Pérez');
  });
});
