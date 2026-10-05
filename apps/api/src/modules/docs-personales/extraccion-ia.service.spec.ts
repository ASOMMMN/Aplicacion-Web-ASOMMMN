import { ConfigService } from '@nestjs/config';
import type { Model } from 'mongoose';

import { ExtraccionIaService } from './extraccion-ia.service';
import * as extraccion from './ia/extraer-fechas-doc-personal';
import type { CacheExtraccionIaDocument } from './schemas/cache-extraccion-ia.schema';

const resultado = (errorMensaje?: string) =>
  ({
    modelo: 'gpt-4o-2024-11-20',
    resultado: {
      ...extraccion.sinFechas(true, errorMensaje ?? ''),
      ...(errorMensaje
        ? {}
        : { errorMensaje: undefined, fechaVencimiento: '2030-01-09' }),
    },
  }) as extraccion.ResultadoExtraccionFechas;

function crear(cacheGuardada: Record<string, unknown> | null = null) {
  const cache = {
    findOne: jest.fn(() => ({ lean: () => Promise.resolve(cacheGuardada) })),
    updateOne: jest.fn(() => Promise.resolve({})),
  };
  const env: Record<string, string> = {
    OPENAI_API_KEY: 'sk-test',
    OPENAI_MODEL_DOCS: 'gpt-4o-2024-11-20',
  };
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  const servicio = new ExtraccionIaService(
    config,
    cache as unknown as Model<CacheExtraccionIaDocument>,
  );
  return { servicio, cache };
}

const peticion = {
  buffer: Buffer.from('mismo archivo'),
  mimeType: 'image/png',
  tipo: 'visa' as const,
};

describe('ExtraccionIaService: caché por hash del archivo', () => {
  let extraer: jest.SpyInstance;
  beforeEach(() => {
    extraer = jest
      .spyOn(extraccion, 'extraerFechasDocPersonal')
      .mockResolvedValue(resultado());
  });
  afterEach(() => extraer.mockRestore());

  it('acierto en caché: no llama al modelo y devuelve lo guardado', async () => {
    const guardado = resultado();
    const { servicio } = crear({ resultado: guardado });
    const r = await servicio.extraer({ ...peticion, usarCache: true });
    expect(extraer).not.toHaveBeenCalled();
    expect(r.desdeCache).toBe(true);
    expect(r.resultado.fechaVencimiento).toBe('2030-01-09');
  });

  it('sin caché: extrae y guarda el resultado', async () => {
    const { servicio, cache } = crear(null);
    const r = await servicio.extraer({ ...peticion, usarCache: true });
    expect(extraer).toHaveBeenCalledTimes(1);
    expect(r.desdeCache).toBeUndefined();
    const [filtro, , opciones] = cache.updateOne.mock.calls[0] as unknown as [
      { clave: string },
      unknown,
      unknown,
    ];
    expect(filtro.clave).toContain('|visa|gpt-4o-2024-11-20|');
    expect(opciones).toEqual({ upsert: true });
  });

  it('"Volver a analizar" (usarCache false): no lee la caché pero la actualiza', async () => {
    const { servicio, cache } = crear({ resultado: resultado() });
    await servicio.extraer({ ...peticion, usarCache: false });
    expect(cache.findOne).not.toHaveBeenCalled();
    expect(extraer).toHaveBeenCalledTimes(1);
    expect(cache.updateOne).toHaveBeenCalledTimes(1);
  });

  it('un error no se guarda en caché (se reintenta)', async () => {
    extraer.mockResolvedValue(resultado('OpenAI sin saldo'));
    const { servicio, cache } = crear(null);
    await servicio.extraer({ ...peticion, usarCache: true });
    expect(cache.updateOne).not.toHaveBeenCalled();
  });

  it('la clave cambia con el archivo, el tipo, el modelo y la versión', () => {
    const { servicio } = crear();
    const a = servicio.claveCache(Buffer.from('a'), 'visa').clave;
    expect(servicio.claveCache(Buffer.from('a'), 'visa').clave).toBe(a);
    expect(servicio.claveCache(Buffer.from('b'), 'visa').clave).not.toBe(a);
    expect(servicio.claveCache(Buffer.from('a'), 'pasaporte').clave).not.toBe(
      a,
    );
    expect(a).toContain(extraccion.VERSION_CANALIZACION);
  });
});
