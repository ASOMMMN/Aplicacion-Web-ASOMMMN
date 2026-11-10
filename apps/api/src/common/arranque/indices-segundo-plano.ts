import type { Connection, Model } from 'mongoose';

import { logArranque } from './fases-arranque';

export type ResultadoIndices = {
  modelos: number;
  creados: number;
  fallidos: {
    modelo: string;
    indice: string;
    codigo?: number;
    mensaje: string;
  }[];
  duracionMs: number;
};

type Log = (mensaje: string) => void;

const logIndices: Log = (mensaje) => logArranque(mensaje, 'indices');

function esDuplicado(err: unknown): boolean {
  const e = err as { code?: number; message?: string };
  return e?.code === 11000 || /E11000|duplicate key/i.test(e?.message ?? '');
}

// 85 IndexOptionsConflict / 86 IndexKeySpecsConflict: ya existe un índice
// con ese nombre pero con otras opciones. Mongo conserva el que ya está.
const CONFLICTO_DE_NOMBRE = new Set([85, 86]);

export function mensajeFallo(
  modelo: string,
  indice: string,
  err: Error & { code?: number },
): string {
  if (esDuplicado(err)) {
    return `ADVERTENCIA: índice único ${indice} de ${modelo} no se creó porque ya hay duplicados en la colección; la app sigue funcionando. Detalle: ${err.message}`;
  }
  if (err.code !== undefined && CONFLICTO_DE_NOMBRE.has(err.code)) {
    return `aviso: índice ${indice} de ${modelo} ya existe con otras opciones (código ${err.code}); se conserva el actual`;
  }
  return `ADVERTENCIA: índice ${indice} de ${modelo} falló (${err.code ?? err.name}): ${err.message}`;
}

/**
 * Crea los índices que falten en todos los modelos registrados, un modelo a
 * la vez y sin lanzar nunca: si un índice falla (por ejemplo, un único que
 * choca con duplicados que ya existen) registra la advertencia y sigue con
 * los demás. createIndex es idempotente, así que los índices que ya existen
 * no se reconstruyen.
 *
 * En producción, donde autoIndex está apagado, main.ts lo llama DESPUÉS de
 * abrir el puerto y sin esperarlo.
 */
export async function sincronizarIndices(
  conexion: Connection,
  log: Log = logIndices,
): Promise<ResultadoIndices> {
  const inicio = Date.now();
  const modelos = Object.values(conexion.models) as Model<unknown>[];
  const resultado: ResultadoIndices = {
    modelos: modelos.length,
    creados: 0,
    fallidos: [],
    duracionMs: 0,
  };
  log(`sincronizando índices de ${modelos.length} modelo(s) en segundo plano`);

  for (const modelo of modelos) {
    const alTerminar = (
      err: Error | null,
      campos: Record<string, unknown>,
      _opciones: unknown,
      nombre?: string,
    ) => {
      if (!err) {
        resultado.creados++;
        return;
      }
      const indice = nombre ?? JSON.stringify(campos);
      const codigo = (err as { code?: number }).code;
      resultado.fallidos.push({
        modelo: modelo.modelName,
        indice,
        codigo,
        mensaje: err.message,
      });
      log(mensajeFallo(modelo.modelName, indice, err));
    };
    modelo.on('index-single-done', alTerminar);
    try {
      await modelo.ensureIndexes();
    } catch {
      // Ya se registró índice por índice en alTerminar.
    } finally {
      modelo.off('index-single-done', alTerminar);
    }
  }

  resultado.duracionMs = Date.now() - inicio;
  log(
    `índices listos: ${resultado.creados} ok, ${resultado.fallidos.length} con advertencia, en ${(resultado.duracionMs / 1000).toFixed(1)}s`,
  );
  return resultado;
}

/** Dispara sincronizarIndices sin bloquear; ningún error escapa. */
export function sincronizarIndicesEnSegundoPlano(
  conexion: Connection,
  log: Log = logIndices,
): Promise<void> {
  return sincronizarIndices(conexion, log).then(
    () => undefined,
    (err: Error) => {
      log(
        `ERROR inesperado sincronizando índices: ${err?.message ?? String(err)}`,
      );
    },
  );
}
