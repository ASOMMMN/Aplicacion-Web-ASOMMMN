import { PassThrough } from 'node:stream';
import { MiNubeController } from './mi-nube.controller';

/** Mock mínimo de Response de Express: solo lo que usa `transmitir`. */
function crearRes() {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  return {
    headersSent: false,
    setHeader: jest.fn(),
    sendStatus: jest.fn(),
    destroy: jest.fn(),
    on: jest.fn((evt: string, cb: (...args: unknown[]) => void) => {
      handlers[evt] = cb;
    }),
    emitir: (evt: string) => handlers[evt]?.(),
  };
}

function crearControlador(stream: PassThrough) {
  const service = {
    obtenerArchivo: jest.fn().mockResolvedValue({
      stream,
      nombre: 'archivo.pdf',
      mimeType: 'application/pdf',
      size: 1234,
    }),
  };
  return { controller: new MiNubeController(service as never), service };
}

const ACTOR = { userId: 'u1', email: 'a@a.com', rol: 'evaluador' } as never;

describe('MiNubeController — streaming de view/download', () => {
  it('descargar: pone los headers correctos y hace pipe del stream a la respuesta', async () => {
    const stream = new PassThrough();
    const pipeSpy = jest.spyOn(stream, 'pipe').mockReturnValue(stream as never);
    const { controller } = crearControlador(stream);
    const res = crearRes();

    await controller.descargar(ACTOR, 'id1', res as never);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', 1234);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('attachment'),
    );
    expect(pipeSpy).toHaveBeenCalledWith(res);
  });

  it('ver: Content-Disposition inline en vez de attachment', async () => {
    const stream = new PassThrough();
    jest.spyOn(stream, 'pipe').mockReturnValue(stream as never);
    const { controller } = crearControlador(stream);
    const res = crearRes();

    await controller.ver(ACTOR, 'id1', res as never);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('inline'),
    );
  });

  it('si el cliente cancela (res cierra la conexión), destruye el stream de S3', async () => {
    const stream = new PassThrough();
    jest.spyOn(stream, 'pipe').mockReturnValue(stream as never);
    const destroySpy = jest.spyOn(stream, 'destroy');
    const { controller } = crearControlador(stream);
    const res = crearRes();

    await controller.descargar(ACTOR, 'id1', res as never);
    res.emitir('close');

    expect(destroySpy).toHaveBeenCalled();
  });

  it('si el stream de S3 falla antes de enviar headers, responde 500 en vez de colgar la conexión', async () => {
    const stream = new PassThrough();
    jest.spyOn(stream, 'pipe').mockReturnValue(stream as never);
    const { controller } = crearControlador(stream);
    const res = crearRes();

    await controller.descargar(ACTOR, 'id1', res as never);
    stream.emit('error', new Error('S3 se cayó a medio camino'));

    expect(res.sendStatus).toHaveBeenCalledWith(500);
    expect(res.destroy).not.toHaveBeenCalled();
  });

  it('si el stream falla DESPUÉS de enviar headers, destruye la respuesta en vez de reenviar un status', async () => {
    const stream = new PassThrough();
    jest.spyOn(stream, 'pipe').mockReturnValue(stream as never);
    const { controller } = crearControlador(stream);
    const res = crearRes();
    res.headersSent = true;

    await controller.descargar(ACTOR, 'id1', res as never);
    stream.emit('error', new Error('conexión perdida a medio archivo'));

    expect(res.sendStatus).not.toHaveBeenCalled();
    expect(res.destroy).toHaveBeenCalled();
  });
});
