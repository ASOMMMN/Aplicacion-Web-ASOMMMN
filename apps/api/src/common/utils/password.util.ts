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

  return plainPassword === storedPassword;
}
