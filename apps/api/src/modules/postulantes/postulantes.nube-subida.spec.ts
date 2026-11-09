import type { INestApplication } from '@nestjs/common';
import { Types } from 'mongoose';
import { crearAppDeSubida, subirArchivo } from '../../../test/utils/app-subida';
import {
  LIMITE_NUBE_BYTES,
  PostulantesController,
} from './postulantes.controller';
import { PostulantesService } from './postulantes.service';

const USUARIO = {
  userId: new Types.ObjectId().toString(),
  email: 'e@asommmn.dev',
  rol: 'evaluador',
};
const RUTA = '/postulantes/mi-nube/subir';

describe('POST /postulantes/mi-nube/subir — límite de tamaño (HTTP)', () => {
  let app: INestApplication;
  const servicio = {
    subirDocumentoNube: jest.fn().mockResolvedValue({ id: 'x' }),
  };

  beforeAll(async () => {
    app = await crearAppDeSubida(
      PostulantesController,
      { provide: PostulantesService, useValue: servicio },
      USUARIO,
    );
  });
  afterAll(() => app.close());
  beforeEach(() => servicio.subirDocumentoNube.mockClear());

  it('rechaza con 413 un archivo de 100 MB + 1 byte sin llegar al servicio', async () => {
    await subirArchivo(app, RUTA, 'archivo', LIMITE_NUBE_BYTES + 1).expect(413);
    expect(servicio.subirDocumentoNube).not.toHaveBeenCalled();
  }, 120_000);

  it('deja pasar un archivo dentro del límite', async () => {
    await subirArchivo(app, RUTA, 'archivo', 1024).expect(201);
    expect(servicio.subirDocumentoNube).toHaveBeenCalledTimes(1);
  });
});

describe('PostulantesService.subirDocumentoNube — tipo real del archivo', () => {
  const postulanteId = new Types.ObjectId();

  function crear() {
    const nubeItemModel = {
      create: jest.fn((doc: Record<string, unknown>) =>
        Promise.resolve({
          toObject: () => ({ _id: new Types.ObjectId(), ...doc }),
        }),
      ),
    };
    const storage = {
      putObject: jest.fn().mockResolvedValue({ url: 'https://s3/x', key: 'k' }),
    };
    const servicio = new PostulantesService(
      { findOne: jest.fn().mockResolvedValue({ _id: postulanteId }) } as never,
      {
        findById: () => ({
          select: () => ({
            lean: () => Promise.resolve({ nombre: 'Ana', apellidos: 'Prueba' }),
          }),
        }),
      } as never,
      nubeItemModel as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      storage as never,
      {} as never,
    );
    return { servicio, nubeItemModel, storage };
  }

  const archivo = (buffer: Buffer, mimetype: string) =>
    ({
      originalname: 'doc.pdf',
      mimetype,
      size: buffer.length,
      buffer,
    }) as Express.Multer.File;

  it('rechaza un HTML que el cliente declara como application/pdf', async () => {
    const { servicio, storage, nubeItemModel } = crear();
    await expect(
      servicio.subirDocumentoNube(
        USUARIO.userId,
        {},
        archivo(
          Buffer.from('<html><script>alert(1)</script></html>'),
          'application/pdf',
        ),
      ),
    ).rejects.toThrow('Solo se aceptan archivos PDF.');
    expect(storage.putObject).not.toHaveBeenCalled();
    expect(nubeItemModel.create).not.toHaveBeenCalled();
  });

  it('acepta un PDF real aunque el mimetype mienta, y guarda application/pdf', async () => {
    const { servicio, nubeItemModel } = crear();
    const r = await servicio.subirDocumentoNube(
      USUARIO.userId,
      {},
      archivo(Buffer.from('%PDF-1.4\n%prueba'), 'text/html'),
    );
    expect(nubeItemModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'application/pdf' }),
    );
    expect(r.mimeType).toBe('application/pdf');
  });
});
