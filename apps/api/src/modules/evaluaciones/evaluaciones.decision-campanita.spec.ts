import { Types } from 'mongoose';
import { EvaluacionesService } from './evaluaciones.service';

/** decidirCandidato → aviso "expediente_evaluado" para los demás evaluadores. */
describe('EvaluacionesService.decidirCandidato: campanita', () => {
  const postulanteId = new Types.ObjectId();
  const evaluadorId = new Types.ObjectId();

  function crear() {
    const postulante = {
      _id: postulanteId,
      estadoPostulacion: 'en_proceso',
      usuarioId: { nombre: 'Ana', apellidos: 'Pérez', email: 'ana@x.mx' },
      save: jest.fn().mockResolvedValue(undefined),
    };
    const postulanteModel = {
      findById: jest.fn(() => ({
        populate: jest.fn().mockResolvedValue(postulante),
      })),
    };
    const usuarioModel = {
      findById: jest.fn().mockResolvedValue({
        _id: evaluadorId,
        nombre: 'Juan',
        apellidos: 'López',
        email: 'juan@x.mx',
      }),
    };
    const notificaciones = {
      enviarNotificacionCambioEstado: jest.fn().mockResolvedValue(undefined),
    };
    const notificacionesApp = {
      avisarExpedienteEvaluado: jest.fn().mockResolvedValue(true),
    };
    const servicio = new EvaluacionesService(
      postulanteModel as never,
      {} as never,
      usuarioModel as never,
      {} as never,
      {} as never,
      {} as never,
      { registrar: jest.fn().mockResolvedValue(undefined) } as never,
      notificaciones as never,
      { get: (_k: string, def?: unknown) => def } as never,
      notificacionesApp as never,
    );
    jest.spyOn(servicio, 'obtenerCandidato').mockResolvedValue({} as never);
    return { servicio, postulante, notificaciones, notificacionesApp };
  }

  it('avisa con la decisión y quién decidió (que queda excluido)', async () => {
    const { servicio, postulante, notificacionesApp } = crear();
    await servicio.decidirCandidato(String(postulanteId), String(evaluadorId), {
      decision: 'rechazado',
    });
    expect(postulante.save).toHaveBeenCalled();
    expect(notificacionesApp.avisarExpedienteEvaluado).toHaveBeenCalledWith({
      candidatoId: postulanteId,
      nombreCandidato: 'Ana Pérez',
      decision: 'rechazado',
      actorId: evaluadorId,
      actorNombre: 'Juan López',
    });
  });

  it('el correo al postulante sigue igual (ni más ni menos envíos)', async () => {
    const { servicio, notificaciones } = crear();
    await servicio.decidirCandidato(String(postulanteId), String(evaluadorId), {
      decision: 'completado',
    });
    expect(notificaciones.enviarNotificacionCambioEstado).toHaveBeenCalledTimes(
      1,
    );
    expect(notificaciones.enviarNotificacionCambioEstado).toHaveBeenCalledWith(
      'ana@x.mx',
      'Ana',
      'completado',
      'http://localhost:3000/estado',
    );
  });
});
