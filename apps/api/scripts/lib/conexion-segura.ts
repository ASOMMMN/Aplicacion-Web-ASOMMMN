/**
 * Utilidades comunes para scripts que escriben en la base.
 *
 * Reglas de seguridad:
 * - La URI se pasa SIEMPRE con --uri; nunca se lee de .env (así un script no
 *   apunta a producción por accidente).
 * - Por defecto es --dry-run; para escribir hay que pasar --ejecutar y
 *   escribir el nombre de la base como confirmación.
 * - Lo primero que se imprime tras conectar es el host y la base.
 */
import mongoose from 'mongoose';
import { createInterface } from 'node:readline/promises';

export interface ArgsBase {
  uri: string;
  ejecutar: boolean;
  /** Resto de flags (--clave valor | --bandera). */
  flags: Map<string, string | true>;
}

export function leerArgs(uso: string): ArgsBase {
  const flags = new Map<string, string | true>();
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const siguiente = argv[i + 1];
    if (siguiente !== undefined && !siguiente.startsWith('--')) {
      flags.set(a.slice(2), siguiente);
      i++;
    } else {
      flags.set(a.slice(2), true);
    }
  }

  const uri = flags.get('uri');
  if (typeof uri !== 'string' || !uri.startsWith('mongodb')) {
    console.error(`Falta --uri <mongodb://...>\n\n${uso}`);
    process.exit(2);
  }
  if (flags.has('ejecutar') && flags.has('dry-run')) {
    console.error('--ejecutar y --dry-run son excluyentes.');
    process.exit(2);
  }
  return { uri, ejecutar: flags.has('ejecutar'), flags };
}

export function numeroFlag(
  flags: Map<string, string | true>,
  nombre: string,
  porDefecto: number,
): number {
  const v = flags.get(nombre);
  if (v === undefined) return porDefecto;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) {
    console.error(`--${nombre} debe ser un número >= 0`);
    process.exit(2);
  }
  return n;
}

/** Conecta e imprime host y base ANTES de cualquier otra salida. */
export async function conectar(uri: string): Promise<{
  db: NonNullable<typeof mongoose.connection.db>;
  host: string;
  nombreBase: string;
}> {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000 });
  const { host, name } = mongoose.connection;
  console.log(`Conectado a host: ${host} · base: ${name}`);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No se pudo obtener la conexión a la base.');
  return { db, host, nombreBase: name };
}

/** En modo --ejecutar, pide escribir el nombre de la base para continuar. */
export async function confirmarEscritura(nombreBase: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const respuesta = await rl.question(
    `\nSe van a ESCRIBIR cambios en la base "${nombreBase}". ` +
      `Escribe su nombre para confirmar: `,
  );
  rl.close();
  if (respuesta.trim() !== nombreBase) {
    console.log('No coincide. Cancelado; no se escribió nada.');
    await mongoose.disconnect();
    process.exit(1);
  }
}

export async function desconectar(): Promise<void> {
  await mongoose.disconnect();
}
