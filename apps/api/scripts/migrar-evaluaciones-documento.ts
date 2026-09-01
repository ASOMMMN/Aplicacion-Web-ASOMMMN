/**
 * Migración one-off para el cambio de "evaluación por candidato" a
 * "evaluación por documento" (ver apps/api/src/modules/evaluaciones).
 *
 * Qué hace, en orden:
 *   1. Marca con documentoClave: 'general' toda evaluación existente que no
 *      tenga ese campo (evaluaciones legadas, del expediente completo).
 *   2. Dropea el índice único `postulanteId_1_evaluacion_unica` (el candado
 *      que impedía más de una evaluación con resultado final por candidato).
 *   3. Crea el índice compuesto nuevo { postulanteId, documentoClave, creadoEn }.
 *
 * Uso:
 *   npx ts-node apps/api/scripts/migrar-evaluaciones-documento.ts
 *
 * Requiere que MONGODB_URI esté disponible en el entorno (se carga desde
 * apps/api/.env). No se ejecuta automáticamente en el build ni en el boot de
 * la app — es manual, una sola vez, contra la base real.
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import mongoose from 'mongoose';

config({ path: resolve(__dirname, '../.env') });

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI no está definida en apps/api/.env');
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No se pudo obtener la conexión a la base.');

  const evaluaciones = db.collection('evaluaciones');

  const resultadoUpdate = await evaluaciones.updateMany(
    { documentoClave: { $exists: false } },
    { $set: { documentoClave: 'general' } },
  );
  console.log(
    `documentoClave='general' aplicado a ${resultadoUpdate.modifiedCount} evaluación(es) legada(s).`,
  );

  const indices = await evaluaciones.indexes();
  const indiceViejo = indices.find(
    (i) => i.name === 'postulanteId_1_evaluacion_unica',
  );
  if (indiceViejo) {
    await evaluaciones.dropIndex('postulanteId_1_evaluacion_unica');
    console.log('Índice único postulanteId_1_evaluacion_unica eliminado.');
  } else {
    console.log(
      'Índice postulanteId_1_evaluacion_unica no existía (nada que eliminar).',
    );
  }

  await evaluaciones.createIndex(
    { postulanteId: 1, documentoClave: 1, creadoEn: -1 },
    { name: 'postulanteId_1_documentoClave_1_creadoEn_-1' },
  );
  console.log('Índice compuesto por documento creado/confirmado.');

  await mongoose.disconnect();
  console.log('Migración completada.');
}

main().catch((err) => {
  console.error('Migración falló:', err);
  process.exit(1);
});
