import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';

import { S3Service } from '../s3/s3.service';
import { StorageService } from '../storage/storage.service';
import { PostulantesController } from './postulantes.controller';
import {
  PostulantesService,
  TTL_DESCARGA_NUBE_SEGUNDOS,
} from './postulantes.service';

/**
 * F-01 (AUDITORIA.md): las descargas de la nube redirigían a la URL canónica
 * de S3 SIN firmar. Estas pruebas usan el S3Service real con credenciales
 * ficticias (la firma SigV4 se calcula localmente, sin red) para comprobar
 * que la redirección lleva una URL presigned de 15 min.
 */

const BUCKET = 'bucket-prueba';
const REGION = 'us-east-2';
const KEY = 'asommmn/postulantes-nube/Ana_Lopez/abc-certificado.pdf';
const URL_CANONICA = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${KEY}`;

const USER_ID = new Types.ObjectId().toString();
const POSTULANTE_ID = new Types.ObjectId();
const ITEM_ID = new Types.ObjectId().toString();

function crearStorage(): StorageService {
  const config = new ConfigService({
    AWS_REGION: REGION,
    AWS_S3_BUCKET: BUCKET,
    AWS_ACCESS_KEY_ID: 'AKIAFAKEFAKEFAKEFAKE',
    AWS_SECRET_ACCESS_KEY: 'secreto-ficticio-de-prueba',
  });
  return new StorageService(config, new S3Service(config));
}

function itemArchivo(extra: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(ITEM_ID),
    tipo: 'archivo',
    nombre: 'certificado STCW.pdf',
    mimeType: 'application/pdf',
    storagePath: `postulantes-nube/${KEY}`,
    storageType: 'cloudinary',
    cloudinaryUrl: URL_CANONICA,
    ...extra,
  };
}

function crearServicio(item: unknown, storage = crearStorage()) {
  const nubeItemModel = { findOne: jest.fn().mockResolvedValue(item) };
  const postulanteModel = {
    findOne: jest.fn().mockResolvedValue({ _id: POSTULANTE_ID }),
  };
  const service = new PostulantesService(
    postulanteModel as never,
    {} as never, // usuarioModel
    nubeItemModel as never,
    {} as never, // docPersonalModel
    {} as never, // documentoModel
    {} as never, // auditoriaService
    {} as never, // notificaciones
    {} as never, // config
    storage,
    {} as never, // usuariosService
    {} as never, // notificacionesApp
  );
  return { service, nubeItemModel };
}

function parametros(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

describe('Descarga de la nube del postulante — URL firmada (F-01)', () => {
  it('evaluador: devuelve una URL presigned de 15 min, nunca la canónica', async () => {
    const { service } = crearServicio(itemArchivo());

    const { url, nombre } = await service.resolverDescargaNubeEvaluador(
      POSTULANTE_ID.toString(),
      ITEM_ID,
    );

    expect(url).not.toBe(URL_CANONICA);
    expect(url.startsWith(URL_CANONICA.replace(/ /g, '%20'))).toBe(true);
    const q = parametros(url);
    expect(q.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(q.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(q.get('X-Amz-Expires')).toBe(String(TTL_DESCARGA_NUBE_SEGUNDOS));
    expect(TTL_DESCARGA_NUBE_SEGUNDOS).toBe(900);
    expect(q.get('response-content-disposition')).toMatch(/^attachment;/);
    expect(q.get('response-content-type')).toBe('application/pdf');
    expect(nombre).toBe('certificado STCW.pdf');
  });

  it('nube propia del evaluador: también firma la URL', async () => {
    const { service, nubeItemModel } = crearServicio(itemArchivo());

    const { url } = await service.resolverDescargaNube(USER_ID, ITEM_ID);

    expect(parametros(url).get('X-Amz-Signature')).toBeTruthy();
    expect(parametros(url).get('X-Amz-Expires')).toBe('900');
    // Sigue filtrando por dueño (postulante y usuario del token).
    expect(nubeItemModel.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        postulanteId: POSTULANTE_ID,
        usuarioId: new Types.ObjectId(USER_ID),
      }),
    );
  });

  it('sin mimeType guardado: se firma como application/octet-stream', async () => {
    const { service } = crearServicio(itemArchivo({ mimeType: undefined }));

    const { url } = await service.resolverDescargaNubeEvaluador(
      POSTULANTE_ID.toString(),
      ITEM_ID,
    );

    expect(parametros(url).get('response-content-type')).toBe(
      'application/octet-stream',
    );
  });

  it('itemId inválido: 400 sin consultar la base', async () => {
    const { service, nubeItemModel } = crearServicio(itemArchivo());

    await expect(
      service.resolverDescargaNubeEvaluador(POSTULANTE_ID.toString(), 'xyz'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(nubeItemModel.findOne).not.toHaveBeenCalled();
  });

  it('carpetas y archivos de almacenamiento anterior no se firman', async () => {
    const storage = crearStorage();
    const firmar = jest.spyOn(storage, 'getSecureDownloadUrl');

    await expect(
      crearServicio(
        itemArchivo({ tipo: 'carpeta' }),
        storage,
      ).service.resolverDescargaNubeEvaluador(
        POSTULANTE_ID.toString(),
        ITEM_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      crearServicio(
        itemArchivo({ storageType: 'local' }),
        storage,
      ).service.resolverDescargaNubeEvaluador(
        POSTULANTE_ID.toString(),
        ITEM_ID,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(firmar).not.toHaveBeenCalled();
  });
});

describe('PostulantesController — redirección de descarga (F-01)', () => {
  const URL_FIRMADA = `${URL_CANONICA}?X-Amz-Signature=abc&X-Amz-Expires=900`;

  function crearRes() {
    return { setHeader: jest.fn(), redirect: jest.fn() };
  }

  it.each([
    [
      'mi-nube/:itemId/descargar',
      (c: PostulantesController, res: unknown) =>
        c.descargarItem(
          { userId: USER_ID, email: 'e@x.com', rol: 'evaluador' },
          ITEM_ID,
          res as never,
        ),
      'resolverDescargaNube',
    ],
    [
      ':id/nube/:itemId/descargar',
      (c: PostulantesController, res: unknown) =>
        c.descargarNubePostulante(
          POSTULANTE_ID.toString(),
          ITEM_ID,
          res as never,
        ),
      'resolverDescargaNubeEvaluador',
    ],
  ])(
    '%s: redirige a la URL firmada con Cache-Control: no-store',
    async (_ruta, llamar, metodo) => {
      const service = {
        [metodo]: jest
          .fn()
          .mockResolvedValue({ url: URL_FIRMADA, nombre: 'a.pdf' }),
      };
      const controller = new PostulantesController(service as never);
      const res = crearRes();

      await llamar(controller, res);

      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
      expect(res.redirect).toHaveBeenCalledWith(302, URL_FIRMADA);
    },
  );
});
