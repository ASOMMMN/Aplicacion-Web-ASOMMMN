import { Types } from 'mongoose';
import { AnalisisGlobalService } from './analisis-global.service';
import type { ResultadoAnalisisDocDto } from './dto/doc-personal.dto';
import type { AuthUser } from '../auth/strategies/jwt.strategy';

const ADMIN = { userId: new Types.ObjectId().toString(), email: 'admin@x.mx' };

function crear(resultados: Array<Partial<ResultadoAnalisisDocDto>>) {
  // Un documento por resultado, salvo los reintentos por límite por minuto.
  const ids = resultados
    .filter((r) => !r.limitePorMinuto)
    .map(() => new Types.ObjectId());
  const docModel = {
    countDocuments: jest.fn().mockResolvedValue(ids.length),
    find: jest.fn(() => ({
      select: () => ({
        sort: () => ({
          lean: () => Promise.resolve(ids.map((_id) => ({ _id }))),
        }),
      }),
    })),
  };
  let i = 0;
  const docs = {
    reanalizar: jest.fn(() =>
      Promise.resolve({ docId: String(i), ...resultados[i++] }),
    ),
  };
  const auditoria = { registrar: jest.fn().mockResolvedValue(undefined) };
  // Sin pausas en las pruebas.
  const config = { get: jest.fn(() => '0') };
  const svc = new AnalisisGlobalService(
    docModel as never,
    docs as never,
    auditoria as never,
    config as never,
  );
  return { svc, docs };
}

async function esperarFin(svc: AnalisisGlobalService) {
  for (let n = 0; n < 100; n++) {
    const e = await svc.obtenerEstado();
    if (!e.enCurso) return e;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('No terminó');
}

describe('AnalisisGlobalService', () => {
  it('procesa todos y cuenta correctos, sin fechas y errores', async () => {
    const { svc, docs } = crear([
      { extraccionEstado: 'ok' },
      { extraccionEstado: 'sin_fechas' },
      { extraccionEstado: 'error', extraccionError: 'PDF ilegible: x' },
    ]);
    const inicio = await svc.iniciar(ADMIN as AuthUser);
    expect(inicio.total).toBe(3);

    const fin = await esperarFin(svc);
    expect(docs.reanalizar).toHaveBeenCalledTimes(3);
    expect(fin).toMatchObject({
      procesados: 3,
      correctos: 1,
      sinFechas: 1,
      errores: 1,
      motivoFin: 'Completado.',
    });
  });

  it('se detiene si OpenAI no tiene saldo o la key es inválida (afecta a todos)', async () => {
    const { svc, docs } = crear([
      {
        extraccionEstado: 'error',
        extraccionError:
          'OpenAI sin saldo: recarga crédito (insufficient_quota).',
      },
      { extraccionEstado: 'ok' },
    ]);
    await svc.iniciar(ADMIN as AuthUser);
    const fin = await esperarFin(svc);
    expect(docs.reanalizar).toHaveBeenCalledTimes(1);
    expect(fin.motivoFin).toMatch(/^Detenido: OpenAI sin saldo/);
  });

  it('límite por minuto: pausa y reintenta el MISMO documento sin contarlo como error', async () => {
    const { svc, docs } = crear([
      {
        extraccionEstado: 'pendiente',
        limitePorMinuto: true,
        aviso: 'Límite por minuto de OpenAI: se reintentará',
      },
      { extraccionEstado: 'ok' }, // mismo documento, segundo intento
      { extraccionEstado: 'sin_fechas' },
    ]);
    await svc.iniciar(ADMIN as AuthUser);
    const fin = await esperarFin(svc);
    const ids = docs.reanalizar.mock.calls.map((c) => (c as unknown[])[1]);
    expect(ids[0]).toBe(ids[1]); // se reintentó el mismo
    expect(fin).toMatchObject({
      procesados: 2,
      correctos: 1,
      sinFechas: 1,
      errores: 0,
      pausa: null,
      motivoFin: 'Completado.',
    });
  });

  it('detener() corta después del documento en curso', async () => {
    const { svc, docs } = crear([
      { extraccionEstado: 'ok' },
      { extraccionEstado: 'ok' },
      { extraccionEstado: 'ok' },
    ]);
    await svc.iniciar(ADMIN as AuthUser);
    await svc.detener();
    const fin = await esperarFin(svc);
    expect(docs.reanalizar.mock.calls.length).toBeLessThan(3);
    expect(fin.motivoFin).toBe('Detenido por el usuario.');
  });

  it('no permite dos análisis a la vez', async () => {
    const { svc } = crear([
      { extraccionEstado: 'ok' },
      { extraccionEstado: 'ok' },
    ]);
    await svc.iniciar(ADMIN as AuthUser);
    await expect(svc.iniciar(ADMIN as AuthUser)).rejects.toThrow(/en curso/);
    await esperarFin(svc);
  });
});
