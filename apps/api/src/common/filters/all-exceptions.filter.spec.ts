import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import mongoose, { Schema } from 'mongoose';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { LoggerService } from '../logger';

const Modelo = mongoose.model(
  'PruebaFiltroExcepciones',
  new Schema({ comentario: { type: String, required: true } }),
);

function host() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn<void, [unknown]>(),
  };
  const req = { method: 'POST', url: '/evaluaciones/x/comentarios' };
  const h = {
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }),
  } as unknown as ArgumentsHost;
  return { h, res };
}

describe('AllExceptionsFilter', () => {
  const filtro = new AllExceptionsFilter();
  beforeEach(() =>
    jest.spyOn(LoggerService, 'error').mockImplementation(() => undefined),
  );
  afterEach(() => jest.restoreAllMocks());

  it('un ValidationError de Mongoose responde 400, no 500', async () => {
    const err = await new Modelo({}).validate().catch((e: unknown) => e);
    const { h, res } = host();

    filtro.catch(err, h);

    expect(res.status).toHaveBeenCalledWith(400);
    const cuerpo = res.json.mock.calls[0][0] as {
      message: { message: string };
    };
    expect(cuerpo.message.message).toContain('"comentario" es obligatorio');
  });

  it('un error desconocido sigue respondiendo 500 sin detalles', () => {
    const { h, res } = host();
    filtro.catch(new Error('detalle interno'), h);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain(
      'detalle interno',
    );
  });

  it('las HttpException conservan su status y cuerpo', () => {
    const { h, res } = host();
    filtro.catch(new BadRequestException('documentoClave inválida'), h);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(JSON.stringify(res.json.mock.calls[0][0])).toContain(
      'documentoClave inválida',
    );
  });
});
