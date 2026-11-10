import { NotificacionesService } from './notificaciones.service';

/**
 * NOTIF_EMAIL_EVALUADORES: apaga SOLO los correos "Nuevo candidato
 * registrado" y "Expediente listo para revisar" (default false).
 */
describe('NotificacionesService — correos de avisos a evaluadores', () => {
  const crear = (env: Record<string, string>) => {
    const config = {
      get: (k: string, d?: unknown) => (k in env ? env[k] : d),
    };
    const svc = new NotificacionesService(config as never);
    svc.onModuleInit();
    const send = jest.fn().mockResolvedValue(undefined);
    (svc as unknown as { send: jest.Mock }).send = send;
    return { svc, send };
  };

  it('sin la variable: no envía esos dos correos', async () => {
    const { svc, send } = crear({});
    expect(svc.avisosEvaluadorPorCorreo).toBe(false);
    await svc.enviarNuevoCandidatoRegistrado('e@x.mx', 'Eva', 'Ana', 'u');
    await svc.enviarExpedienteListoRevisar('e@x.mx', 'Eva', 'Ana', 'u');
    expect(send).not.toHaveBeenCalled();
  });

  it('con NOTIF_EMAIL_EVALUADORES=true vuelve a enviarlos', async () => {
    const { svc, send } = crear({ NOTIF_EMAIL_EVALUADORES: 'true' });
    expect(svc.avisosEvaluadorPorCorreo).toBe(true);
    await svc.enviarNuevoCandidatoRegistrado('e@x.mx', 'Eva', 'Ana', 'u');
    await svc.enviarExpedienteListoRevisar('e@x.mx', 'Eva', 'Ana', 'u');
    expect(send).toHaveBeenCalledTimes(2);
    const llamadas = send.mock.calls as [{ subject: string }][];
    expect(llamadas.map(([correo]) => correo.subject)).toEqual([
      'Nuevo candidato registrado — ASOMMMN',
      'Expediente listo para revisar — ASOMMMN',
    ]);
  });

  it('los demás correos no dependen de la variable', async () => {
    const { svc, send } = crear({ NOTIF_EMAIL_EVALUADORES: 'false' });
    await svc.enviarConfirmacionExpedienteEnviado('p@x.mx', 'Ana');
    await svc.enviarVerificacionEmail('p@x.mx', 'Ana', 'u');
    expect(send).toHaveBeenCalledTimes(2);
  });
});
