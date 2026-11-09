import type { INestApplication } from '@nestjs/common';
import { Types } from 'mongoose';
import { crearAppDeSubida, subirArchivo } from '../../../test/utils/app-subida';
import { TIPO_DESCONOCIDO } from '../../common/utils/detectar-tipo-archivo.util';
import { LIMITE_MI_NUBE_BYTES, MiNubeController } from './mi-nube.controller';
import { MiNubeService } from './mi-nube.service';

const ACTOR = {
  userId: new Types.ObjectId().toString(),
  email: 'ev@asommmn.dev',
  rol: 'evaluador' as const,
};
const RUTA = '/mi-nube/upload';

describe('POST /mi-nube/upload — límite de tamaño (HTTP)', () => {
  let app: INestApplication;
  const servicio = { subirArchivo: jest.fn().mockResolvedValue({ id: 'x' }) };

  beforeAll(async () => {
    app = await crearAppDeSubida(
      MiNubeController,
      { provide: MiNubeService, useValue: servicio },
      ACTOR,
    );
  });
  afterAll(() => app.close());
  beforeEach(() => servicio.subirArchivo.mockClear());

  it('rechaza con 413 un archivo de 100 MB + 1 byte sin llegar al servicio', async () => {
    await subirArchivo(app, RUTA, 'file', LIMITE_MI_NUBE_BYTES + 1).expect(413);
    expect(servicio.subirArchivo).not.toHaveBeenCalled();
  }, 120_000);

  it('deja pasar un archivo dentro del límite', async () => {
    await subirArchivo(app, RUTA, 'file', 1024).expect(201);
    expect(servicio.subirArchivo).toHaveBeenCalledTimes(1);
  });
});

describe('MiNubeService.subirArchivo — guarda el tipo real', () => {
  function crear() {
    const documentoModel = {
      findOne: jest.fn(() => ({ lean: () => Promise.resolve(null) })),
      create: jest.fn((doc: Record<string, unknown>) =>
        Promise.resolve({
          _id: new Types.ObjectId(),
          toObject: () => ({ _id: new Types.ObjectId(), ...doc }),
        }),
      ),
    };
    const usuarioModel = {
      findById: () => ({
        select: () => ({ lean: () => Promise.resolve(null) }),
      }),
    };
    const storage = {
      putObject: jest.fn().mockResolvedValue({ url: 'https://s3/x', key: 'k' }),
    };
    const servicio = new MiNubeService(
      documentoModel as never,
      usuarioModel as never,
      storage as never,
      { registrar: jest.fn() } as never,
    );
    // Aísla lo que no es el tipo: nombre libre y sin consultas a la BD.
    jest
      .spyOn(servicio as never, 'validarNombreDisponible')
      .mockResolvedValue(undefined as never);
    jest
      .spyOn(servicio as never, 'mapItems')
      .mockImplementation((docs: unknown) => Promise.resolve(docs) as never);
    return { servicio, documentoModel };
  }

  const archivo = (buffer: Buffer, mimetype: string, nombre: string) =>
    ({
      originalname: nombre,
      mimetype,
      size: buffer.length,
      buffer,
    }) as Express.Multer.File;

  it('un HTML que el cliente declara image/png se guarda como application/octet-stream', async () => {
    const { servicio, documentoModel } = crear();
    await servicio.subirArchivo(
      ACTOR,
      undefined,
      archivo(Buffer.from('<html>x</html>'), 'image/png', 'a.png'),
    );
    expect(documentoModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: TIPO_DESCONOCIDO }),
    );
  });

  it('un PNG real que el cliente declara text/html se guarda como image/png', async () => {
    const { servicio, documentoModel } = crear();
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0,
    ]);
    await servicio.subirArchivo(
      ACTOR,
      undefined,
      archivo(png, 'text/html', 'foto.png'),
    );
    expect(documentoModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'image/png' }),
    );
  });
});
