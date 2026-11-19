import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { IngestIaService } from './ingest-ia.service';
import { MENSAJE_IA_GENERICO } from '../../common/utils/mensaje-ia-usuario.util';

/**
 * Bug de QA: el evaluador veía el error crudo de OpenAI ("429 You have no
 * credits remaining…" con enlace de facturación) en la extracción del CV.
 */
const CRUDO_OPENAI =
  '429 You have no credits remaining. Visit https://platform.openai.com/settings/organization/billing to add credits.';

function crear(openAiIa: Record<string, jest.Mock>) {
  const extraccionModel = {
    findByIdAndUpdate: jest.fn().mockResolvedValue(undefined),
    findOne: jest.fn(),
  };
  const storage = {
    getSecureDownloadUrl: jest.fn().mockResolvedValue('https://firmada'),
    getObjectBuffer: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4')),
  };
  const servicio = new IngestIaService(
    extraccionModel as never,
    {} as never,
    openAiIa as never,
    storage as never,
    { get: jest.fn() } as never,
  );
  return { servicio, extraccionModel };
}

const documento = {
  storageType: 'cloudinary',
  cloudinaryUrl: 'https://bucket/cv.pdf',
  nombreOriginal: 'cv.pdf',
  tipoMime: 'application/pdf',
};
const extraccion = {
  _id: new Types.ObjectId(),
  postulanteId: new Types.ObjectId(),
};

/** procesarAsync es privado: se prueba directamente porque corre en segundo plano. */
const procesar = (s: IngestIaService) =>
  (
    s as unknown as {
      procesarAsync: (e: unknown, d: unknown) => Promise<void>;
    }
  ).procesarAsync(extraccion, documento);

describe('IngestIaService — errores de IA', () => {
  let log: jest.SpyInstance;
  beforeEach(() => {
    log = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('un error de OpenAI se guarda como mensaje genérico y el detalle va al log', async () => {
    const { servicio, extraccionModel } = crear({
      extraerTextoPdf: jest.fn().mockResolvedValue('x'.repeat(100)),
      extraerDatosCV: jest.fn().mockRejectedValue(new Error(CRUDO_OPENAI)),
    });

    await procesar(servicio);

    expect(extraccionModel.findByIdAndUpdate).toHaveBeenCalledWith(
      extraccion._id,
      { errorMensaje: MENSAJE_IA_GENERICO, estado: 'rechazado' },
    );
    const [primerLog] = log.mock.calls[0] as unknown[];
    expect(String(primerLog)).toContain('no credits remaining');
  });

  it('un error propio (PDF sin texto) se muestra tal cual', async () => {
    const { servicio, extraccionModel } = crear({
      extraerTextoPdf: jest.fn().mockResolvedValue('corto'),
      extraerDatosCV: jest.fn(),
    });

    await procesar(servicio);

    expect(extraccionModel.findByIdAndUpdate).toHaveBeenCalledWith(
      extraccion._id,
      {
        errorMensaje: 'El PDF no contiene suficiente texto legible.',
        estado: 'rechazado',
      },
    );
  });

  it('extracciones antiguas con el mensaje crudo se sanean al leerlas', async () => {
    const { servicio, extraccionModel } = crear({});
    const guardada = { errorMensaje: CRUDO_OPENAI, estado: 'rechazado' };
    extraccionModel.findOne.mockReturnValue({
      sort: () => Promise.resolve(guardada),
    });

    const r = await servicio.obtenerUltima(new Types.ObjectId().toString());

    expect(r?.errorMensaje).toBe(MENSAJE_IA_GENERICO);
  });
});
