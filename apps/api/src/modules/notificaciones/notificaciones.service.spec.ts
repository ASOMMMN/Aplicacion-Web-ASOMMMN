import { ConfigService } from '@nestjs/config';
import { NotificacionesService } from './notificaciones.service';

const enviar = jest.fn<Promise<unknown>, [{ to: string }]>();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: enviar } })),
}));

function crearServicio(env: Record<string, string>) {
  const config = {
    get: (clave: string, porDefecto?: string) => env[clave] ?? porDefecto,
  } as unknown as ConfigService;
  const servicio = new NotificacionesService(config);
  servicio.onModuleInit();
  return servicio;
}

// Resend configurado con valores ficticios: nada sale a internet (resend está simulado).
const CON_RESEND = {
  RESEND_API_KEY: 're_ficticia',
  RESEND_FROM: 'envia@ejemplo.test',
};

describe('NotificacionesService — EMAIL_ALLOWLIST', () => {
  beforeEach(() => {
    enviar.mockReset().mockResolvedValue({ data: { id: 'x' }, error: null });
  });

  it('sin EMAIL_ALLOWLIST: envía a cualquiera (comportamiento de producción)', async () => {
    const s = crearServicio(CON_RESEND);
    await s.enviarConfirmacionExpedienteEnviado('cualquiera@otro.test', 'Ana');
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('EMAIL_ALLOWLIST vacía: tampoco restringe', async () => {
    const s = crearServicio({ ...CON_RESEND, EMAIL_ALLOWLIST: '  ' });
    await s.enviarConfirmacionExpedienteEnviado('cualquiera@otro.test', 'Ana');
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('con EMAIL_ALLOWLIST: envía a un correo y a un dominio listados', async () => {
    const s = crearServicio({
      ...CON_RESEND,
      EMAIL_ALLOWLIST: 'ana@ejemplo.test,equipo.test',
    });
    await s.enviarConfirmacionExpedienteEnviado('ana@ejemplo.test', 'Ana');
    await s.enviarConfirmacionExpedienteEnviado('luis@equipo.test', 'Luis');
    expect(enviar).toHaveBeenCalledTimes(2);
    expect(enviar.mock.calls[0][0].to).toBe('ana@ejemplo.test');
  });

  it('con EMAIL_ALLOWLIST: NO envía a quien no está listado (ninguna llamada a Resend)', async () => {
    const s = crearServicio({
      ...CON_RESEND,
      EMAIL_ALLOWLIST: 'ana@ejemplo.test,equipo.test',
    });
    await s.enviarConfirmacionExpedienteEnviado(
      'postulante@real.test',
      'Pedro',
    );
    await s.enviarResetPasswordEmail(
      'postulante@real.test',
      'Pedro',
      'https://x.test/r',
    );
    await s.enviarVerificacionEmail(
      'luis@ejemplo.test',
      'Luis',
      'https://x.test/v',
    );
    expect(enviar).not.toHaveBeenCalled();
  });

  it('el aviso de omisión no escribe la dirección del destinatario', async () => {
    const s = crearServicio({
      ...CON_RESEND,
      EMAIL_ALLOWLIST: 'ana@ejemplo.test',
    });
    const aviso = jest
      .spyOn(
        (s as unknown as { logger: { warn: (m: string) => void } }).logger,
        'warn',
      )
      .mockImplementation(() => undefined);
    await s.enviarConfirmacionExpedienteEnviado('privado@real.test', 'Pedro');
    const mensajes = aviso.mock.calls.map((c) => String(c[0])).join('\n');
    expect(mensajes).toContain('EMAIL_ALLOWLIST');
    expect(mensajes).not.toContain('privado@real.test');
  });

  it('EMAIL_ALLOWLIST inválida: el servicio no arranca', () => {
    expect(() =>
      crearServicio({ ...CON_RESEND, EMAIL_ALLOWLIST: '*@x.test' }),
    ).toThrow(/comodines/);
  });
});
