import type { INestApplication } from '@nestjs/common';
import { Types } from 'mongoose';
import { crearAppDeSubida, subirArchivo } from '../../../test/utils/app-subida';
import { TIPO_DESCONOCIDO } from '../../common/utils/detectar-tipo-archivo.util';
import {
  EvalArchivosController,
  LIMITE_EVAL_ARCHIVO_BYTES,
} from './eval-archivos.controller';
import { EvalArchivosService } from './eval-archivos.service';

const ACTOR = {
  userId: new Types.ObjectId().toString(),
  email: 'ev@asommmn.dev',
  rol: 'evaluador' as const,
};
const POSTULANTE = new Types.ObjectId().toString();
const RUTA = `/eval-archivos/${POSTULANTE}/upload`;

describe('POST /eval-archivos/:postulanteId/upload — límite de tamaño (HTTP)', () => {
  let app: INestApplication;
  const servicio = { subirArchivo: jest.fn().mockResolvedValue({ _id: 'x' }) };

  beforeAll(async () => {
    app = await crearAppDeSubida(
      EvalArchivosController,
      { provide: EvalArchivosService, useValue: servicio },
      ACTOR,
    );
  });
  afterAll(() => app.close());
  beforeEach(() => servicio.subirArchivo.mockClear());

  it('rechaza con 413 un archivo de 50 MB + 1 byte sin llegar al servicio', async () => {
    await subirArchivo(app, RUTA, 'file', LIMITE_EVAL_ARCHIVO_BYTES + 1).expect(
      413,
    );
    expect(servicio.subirArchivo).not.toHaveBeenCalled();
  }, 120_000);

  it('deja pasar un archivo dentro del límite', async () => {
    await subirArchivo(app, RUTA, 'file', 1024).expect(201);
    expect(servicio.subirArchivo).toHaveBeenCalledTimes(1);
  });
});

describe('EvalArchivosService.subirArchivo — guarda el tipo real', () => {
  function crear() {
    const archivoModel = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((doc: Record<string, unknown>) =>
        Promise.resolve({
          _id: new Types.ObjectId(),
          toObject: () => ({ _id: new Types.ObjectId(), ...doc }),
        }),
      ),
    };
    const storage = {
      putObject: jest.fn().mockResolvedValue({ url: 'https://s3/x', key: 'k' }),
      getSecureDownloadUrl: jest.fn().mockResolvedValue('https://firmada/d'),
      getPreviewUrl: jest.fn().mockResolvedValue('https://firmada/v'),
    };
    const servicio = new EvalArchivosService(
      archivoModel as never,
      {
        findById: () => ({
          select: () => ({ lean: () => Promise.resolve(null) }),
        }),
      } as never,
      {} as never,
      storage as never,
      { registrar: jest.fn() } as never,
    );
    return { servicio, archivoModel, storage };
  }

  const archivo = (buffer: Buffer, mimetype: string, nombre: string) =>
    ({
      originalname: nombre,
      mimetype,
      size: buffer.length,
      buffer,
    }) as Express.Multer.File;

  it('un HTML que el cliente declara image/png se guarda (y se sirve) como application/octet-stream', async () => {
    const { servicio, archivoModel, storage } = crear();
    const r = await servicio.subirArchivo(
      POSTULANTE,
      undefined,
      archivo(
        Buffer.from('<html><script>x</script></html>'),
        'image/png',
        'a.png',
      ),
      ACTOR,
    );
    expect(archivoModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ tipoMime: TIPO_DESCONOCIDO }),
    );
    expect(storage.getPreviewUrl).toHaveBeenCalledWith(
      'https://s3/x',
      'a.png',
      TIPO_DESCONOCIDO,
    );
    expect(r.tipoMime).toBe(TIPO_DESCONOCIDO);
  });

  it('un PNG real que el cliente declara text/html se guarda como image/png', async () => {
    const { servicio, archivoModel } = crear();
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0,
    ]);
    await servicio.subirArchivo(
      POSTULANTE,
      undefined,
      archivo(png, 'text/html', 'foto.png'),
      ACTOR,
    );
    expect(archivoModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ tipoMime: 'image/png' }),
    );
  });
});
