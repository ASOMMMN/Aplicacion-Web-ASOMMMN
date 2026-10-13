/**
 * Levanta un MongoDB real pero local y descartable (mongodb-memory-server
 * descarga su propio binario de mongod; no requiere Docker ni una
 * instalación de Mongo en el sistema) para desarrollar/probar sin tocar la
 * base de Atlas real.
 *
 * Los datos persisten en apps/api/.mongodb-dev-data/ (gitignored) entre
 * corridas: puedes apagar este script (Ctrl+C) y volver a levantarlo sin
 * perder lo que sembró seed-dev.ts.
 *
 * Uso (dos terminales):
 *   1. npm run dev:db:local      (esta terminal, déjala corriendo)
 *   2. npm run seed:dev:local    (una vez; agrega datos de prueba)
 *   3. ENV_FILE=.env.dev-local npm run dev:api   (apunta el API a este Mongo)
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';

const PUERTO = 27018;
const DB_PATH = resolve(__dirname, '../.mongodb-dev-data');

async function main() {
  mkdirSync(DB_PATH, { recursive: true });

  const mongod = await MongoMemoryServer.create({
    instance: {
      port: PUERTO,
      dbPath: DB_PATH,
      storageEngine: 'wiredTiger',
      // Windows + primer arranque (antivirus escaneando el binario nuevo)
      // puede tardar más que los 10s por defecto.
      launchTimeout: 60_000,
    },
  });

  const uri = mongod.getUri('asommmn_dev');
  console.log(`\nMongo de desarrollo local arriba en:\n  ${uri}\n`);
  console.log(
    'Datos persistidos en apps/api/.mongodb-dev-data/ (no se tocan al reiniciar).',
  );
  console.log('Déjalo corriendo en esta terminal. Ctrl+C para apagarlo.\n');

  const apagar = async () => {
    console.log('\nApagando Mongo de desarrollo local...');
    await mongod.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void apagar());
  process.on('SIGTERM', () => void apagar());
}

main().catch((err) => {
  console.error('No se pudo levantar el Mongo de desarrollo local:', err);
  process.exit(1);
});
