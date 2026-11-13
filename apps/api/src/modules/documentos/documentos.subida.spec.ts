import type { INestApplication } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  crearAppDeSubida,
  subirArchivo,
  throttlerDePrueba,
} from '../../../test/utils/app-subida';
import { DocumentosController, LIMITE_CV_BYTES } from './documentos.controller';
import { DocumentosService } from './documentos.service';

const USUARIO = {
  userId: new Types.ObjectId().toString(),
  email: 'p@asommmn.dev',
  rol: 'postulante',
};
const RUTA = '/documentos/subir';

describe('POST /documentos/subir — límite de tamaño (HTTP)', () => {
  let app: INestApplication;
  const servicio = { subirCV: jest.fn().mockResolvedValue({ _id: 'x' }) };

  beforeAll(async () => {
    app = await crearAppDeSubida(
      DocumentosController,
      { provide: DocumentosService, useValue: servicio },
      USUARIO,
      [throttlerDePrueba()],
    );
  });
  afterAll(() => app.close());
  beforeEach(() => servicio.subirCV.mockClear());

  it('rechaza con 413 un CV de 20 MB + 1 byte sin llegar al servicio', async () => {
    await subirArchivo(app, RUTA, 'archivo', LIMITE_CV_BYTES + 1).expect(413);
    expect(servicio.subirCV).not.toHaveBeenCalled();
  }, 120_000);

  it('deja pasar un archivo dentro del límite', async () => {
    await subirArchivo(app, RUTA, 'archivo', 1024).expect(201);
    expect(servicio.subirCV).toHaveBeenCalledTimes(1);
  });
});

describe('DocumentosService.subirCV — guarda el tipo real', () => {
  function crear() {
    const documentoModel = {
      findOne: jest.fn((filtro: { hash?: string }) =>
        filtro.hash
          ? Promise.resolve(null)
          : { sort: () => Promise.resolve(null) },
      ),
      updateMany: jest.fn().mockResolvedValue({}),
      create: jest.fn((doc: Record<string, unknown>) =>
        Promise.resolve({ _id: new Types.ObjectId(), ...doc }),
      ),
    };
    const postulanteModel = {
      findOne: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
    };
    const usuarioModel = {
      findById: () => ({
        select: () => ({ lean: () => Promise.resolve(null) }),
      }),
    };
    const storage = {
      putObject: jest.fn().mockResolvedValue({ url: 'https://s3/x', key: 'k' }),
      getSecureDownloadUrl: jest.fn().mockResolvedValue('https://firmada/d'),
      getPreviewUrl: jest.fn().mockResolvedValue('https://firmada/v'),
    };
    const servicio = new DocumentosService(
      documentoModel as never,
      postulanteModel as never,
      usuarioModel as never,
      {} as never,
      storage as never,
      { registrar: jest.fn() } as never,
      {
        avisarDocumentoSubido: jest.fn().mockResolvedValue(undefined),
      } as never,
    );
    return { servicio, documentoModel, storage };
  }

  const archivo = (buffer: Buffer, mimetype: string) =>
    ({
      originalname: 'cv.pdf',
      mimetype,
      size: buffer.length,
      buffer,
    }) as Express.Multer.File;

  it('un HTML que el cliente declara application/pdf se rechaza con 400 y no toca S3', async () => {
    const { servicio, storage } = crear();
    await expect(
      servicio.subirCV(
        USUARIO.userId,
        archivo(Buffer.from('<html>x</html>'), 'application/pdf'),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('un PDF real que el cliente declara text/html se guarda como application/pdf', async () => {
    const { servicio, documentoModel, storage } = crear();
    await servicio.subirCV(
      USUARIO.userId,
      archivo(Buffer.from('%PDF-1.4\n%sintetico'), 'text/html'),
    );
    expect(documentoModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ tipoMime: 'application/pdf' }),
    );
    expect(storage.getPreviewUrl).toHaveBeenCalledWith(
      'https://s3/x',
      'cv.pdf',
      'application/pdf',
    );
  });
});
