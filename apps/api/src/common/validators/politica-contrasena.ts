/**
 * Política de contraseñas: se aplica SOLO al crear o cambiar una contraseña
 * (registro, restablecer, cambio obligatorio y alta de personal). El login
 * no la valida: las cuentas existentes siguen entrando con su contraseña.
 *
 * ESTE ARCHIVO EXISTE DOS VECES, IDÉNTICO:
 *   apps/api/src/common/validators/politica-contrasena.ts
 *   apps/web/src/lib/validators/politica-contrasena.ts
 * Una prueba de la web falla si dejan de coincidir. Sin dependencias y sin
 * llamadas a servicios externos.
 */

export const CONTRASENA_MIN = 10;
/** bcrypt solo usa los primeros 72 bytes: más largo daría falsa seguridad. */
export const CONTRASENA_MAX = 72;

export const MENSAJES_CONTRASENA = {
  ayuda: `Mínimo ${CONTRASENA_MIN} caracteres, con al menos una letra y un número. Evita contraseñas comunes.`,
  corta: `Mínimo ${CONTRASENA_MIN} caracteres.`,
  larga: `Máximo ${CONTRASENA_MAX} caracteres.`,
  letraYNumero: 'Debe incluir al menos una letra y un número.',
  comun:
    'Esa contraseña es muy común o fácil de adivinar. Elige otra; por ejemplo, una frase corta con algún número.',
} as const;

/**
 * Bases demasiado comunes. La longitud mínima ya descarta las cortas
 * ("123456", "qwerty"), así que la lista se centra en lo que sí pasaría la
 * regla de 10 caracteres con letra y número ("password123",
 * "Contrasena2024", "Asommmn2026"...).
 */
const BASES_COMUNES = [
  'password',
  'passw0rd',
  'contrasena',
  'contraseña',
  'contrasenia',
  'clave',
  'qwerty',
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
  'abc',
  'abcdef',
  'abcdefg',
  'abcdefgh',
  'abcdefghij',
  'admin',
  'administrador',
  'administrator',
  'welcome',
  'bienvenido',
  'bienvenida',
  'letmein',
  'iloveyou',
  'teamo',
  'tequiero',
  'mexico',
  'méxico',
  'veracruz',
  'asommmn',
  'reclutamiento',
  'marino',
  'marina',
  'capitan',
  'capitán',
  'oficial',
  'barco',
  'naval',
  'usuario',
  'user',
  'test',
  'prueba',
  'temporal',
  'cambiame',
  'changeme',
  'secreto',
  'secret',
  'master',
  'dragon',
  'monkey',
  'football',
  'futbol',
  'america',
  'chivas',
  'superman',
  'batman',
  'princesa',
  'princess',
  'sunshine',
  'shadow',
  'hola',
  'holamundo',
  'helloworld',
  'hello',
];

const COMUNES_EXACTAS = new Set([
  'password123',
  'password1234',
  'password12345',
  'qwerty12345',
  'qwerty123456',
  '1q2w3e4r5t',
  '1q2w3e4r5t6y',
  'q1w2e3r4t5',
  'zaq12wsxcde3',
  '1qaz2wsx3edc',
  'abc123abc123',
  'a1b2c3d4e5',
  'a1b2c3d4e5f6',
  'aa123456789',
  'aa12345678',
  'abcd123456',
  'abcd1234abcd',
]);

const SECUENCIAS = [
  '01234567890',
  '09876543210',
  'abcdefghijklmnopqrstuvwxyz',
  'zyxwvutsrqponmlkjihgfedcba',
  'qwertyuiopasdfghjklzxcvbnm',
];

function quitarAcentos(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const BASES = new Set(BASES_COMUNES.map((b) => quitarAcentos(b)));

/**
 * true si la contraseña es común: está en la lista exacta, es una base
 * común con solo números o símbolos alrededor ("Password2024!",
 * "2024Asommmn", con sustituciones tipo "P@ssw0rd"), una base repetida, casi
 * un solo carácter repetido o un tramo de una secuencia ("1234567890",
 * "qwertyuiop1").
 */
export function esContrasenaComun(contrasena: string): boolean {
  const baja = quitarAcentos(contrasena.trim().toLowerCase());
  if (COMUNES_EXACTAS.has(baja)) return true;

  // Base + números/símbolos: se quitan del principio y del final.
  const nucleo = baja.replace(/^[^a-z]+|[^a-z]+$/g, '');
  const sinLeet = nucleo
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's');
  if (BASES.has(nucleo) || BASES.has(sinLeet)) return true;

  // Base repetida ("holahola2024").
  for (const b of BASES) {
    const veces = nucleo.length / b.length;
    if (Number.isInteger(veces) && veces >= 2 && b.repeat(veces) === nucleo) {
      return true;
    }
  }

  // Uno o dos caracteres distintos ("aaaaaaaaa1", "1212121212").
  const alfanum = baja.replace(/[^a-z0-9]/g, '');
  if (new Set(alfanum).size <= 2) return true;

  // Tramo de secuencia: todo lo alfanumérico salvo a lo sumo 2 caracteres.
  for (const sec of SECUENCIAS) {
    for (
      let largo = alfanum.length;
      largo >= alfanum.length - 2 && largo >= 8;
      largo--
    ) {
      for (let i = 0; i + largo <= alfanum.length; i++) {
        if (sec.includes(alfanum.slice(i, i + largo))) return true;
      }
    }
  }
  return false;
}

/**
 * Primer problema de la contraseña, como mensaje para el usuario, o null si
 * cumple la política.
 */
export function evaluarContrasena(contrasena: string): string | null {
  if (contrasena.length < CONTRASENA_MIN) return MENSAJES_CONTRASENA.corta;
  if (contrasena.length > CONTRASENA_MAX) return MENSAJES_CONTRASENA.larga;
  if (!/\p{L}/u.test(contrasena) || !/\d/.test(contrasena)) {
    return MENSAJES_CONTRASENA.letraYNumero;
  }
  if (esContrasenaComun(contrasena)) return MENSAJES_CONTRASENA.comun;
  return null;
}
