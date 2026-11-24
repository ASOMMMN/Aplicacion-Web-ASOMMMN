import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';

const BCRYPT_SALT_ROUNDS = 12;

export function generarContrasenaTemporal(length: number): string {
  const alphabet =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let result = '';
  for (let i = 0; i < length; i += 1) {
    const index = crypto.randomInt(0, alphabet.length);
    result += alphabet[index];
  }
  return result;
}

export function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, BCRYPT_SALT_ROUNDS);
}

let hashFicticio: Promise<string> | null = null;

/**
 * Compara contra un hash bcrypt descartable con el mismo coste que los
 * reales. Se usa cuando la cuenta no existe (o guarda una contraseña
 * legada): así la respuesta tarda lo mismo y el tiempo no revela qué
 * correos están registrados.
 */
export async function compararContraHashFicticio(
  plainPassword: string,
): Promise<void> {
  hashFicticio ??= hashPassword(crypto.randomBytes(16).toString('hex'));
  await bcrypt.compare(plainPassword, await hashFicticio);
}

/** Igualdad en tiempo constante (sobre SHA-256, para igualar longitudes). */
function igualesTiempoConstante(a: string, b: string): boolean {
  const da = crypto.createHash('sha256').update(a).digest();
  const db = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(da, db);
}

export function esHashBcrypt(value: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(value);
}

/**
 * Compara una contraseña en claro contra el valor almacenado, soportando
 * tanto hashes bcrypt como contraseñas legadas en texto plano durante la
 * migración progresiva.
 */
export async function verificarPasswordCompatible(
  plainPassword: string,
  storedPassword: string,
): Promise<boolean> {
  if (esHashBcrypt(storedPassword)) {
    return bcrypt.compare(plainPassword, storedPassword);
  }

  // Legado en texto plano (el login lo migra a bcrypt al primer acceso):
  // se gasta el mismo tiempo que con bcrypt y se compara en tiempo constante.
  await compararContraHashFicticio(plainPassword);
  return igualesTiempoConstante(plainPassword, storedPassword);
}
