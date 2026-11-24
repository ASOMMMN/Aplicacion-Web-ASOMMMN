import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ChangeRequiredPasswordDto } from '../../modules/auth/dto/change-required-password.dto';
import { LoginDto } from '../../modules/auth/dto/login.dto';
import { RegisterDto } from '../../modules/auth/dto/register.dto';
import { ResetPasswordDto } from '../../modules/auth/dto/reset-password.dto';
import { CreateUsuarioDto } from '../../modules/usuarios/dto/create-usuario.dto';
import {
  CONTRASENA_MAX,
  MENSAJES_CONTRASENA,
  esContrasenaComun,
  evaluarContrasena,
} from './politica-contrasena';

/** Contraseñas que cumplen la política. */
export const VALIDAS = [
  'Gaviota-Norte-42',
  'faro del sur 77',
  'marinero en tierra 7',
  'Ñandú y faro 2026',
  'velero2rojo9',
  'Bitacora-De-Puente-3',
];

/** Comunes o fáciles de adivinar, aunque tengan 10+ caracteres, letra y número. */
export const COMUNES = [
  'password123',
  'Password123',
  'P@ssw0rd2024',
  'Contrasena2024',
  'contraseña2024',
  'Asommmn2026!',
  '2024Marina',
  'Veracruz2025',
  'holahola2024',
  'qwertyuiop1',
  '1234567890a',
  'abcdefghij1',
  'aaaaaaaaa1',
  '1q2w3e4r5t',
  'Admin123456',
];

describe('Política de contraseñas', () => {
  it.each(VALIDAS)('acepta %p', (c) => {
    expect(evaluarContrasena(c)).toBeNull();
  });

  it.each(COMUNES)('rechaza la común %p', (c) => {
    expect(esContrasenaComun(c)).toBe(true);
    expect(evaluarContrasena(c)).toBe(MENSAJES_CONTRASENA.comun);
  });

  it.each(['', 'Corta1', 'abc123def'])('rechaza la corta %p', (c) => {
    expect(evaluarContrasena(c)).toBe(MENSAJES_CONTRASENA.corta);
  });

  it('rechaza más de 72 caracteres (bcrypt ignora el resto)', () => {
    expect(evaluarContrasena(`a1${'x'.repeat(CONTRASENA_MAX)}`)).toBe(
      MENSAJES_CONTRASENA.larga,
    );
  });

  it.each(['sololetrasaqui', '2468013579135', '!!--??!!--??'])(
    'exige al menos una letra y un número: %p',
    (c) => {
      expect(evaluarContrasena(c)).toBe(MENSAJES_CONTRASENA.letraYNumero);
    },
  );

  it('no exige mayúsculas ni símbolos: basta letra y número', () => {
    expect(evaluarContrasena('velero2rojo9')).toBeNull();
  });
});

describe('DTO que crean o cambian contraseña', () => {
  const mensajes = async (
    clase: new () => object,
    datos: Record<string, unknown>,
  ) => {
    const errores = await validate(plainToInstance(clase, datos));
    return errores.flatMap((e) => Object.values(e.constraints ?? {}));
  };

  const casos: [string, new () => object, Record<string, unknown>, string][] = [
    [
      'registro',
      RegisterDto,
      { email: 'ana@prueba.mx', nombre: 'Ana', apellidos: 'López' },
      'password',
    ],
    ['restablecer', ResetPasswordDto, { token: 'abc' }, 'nuevaPassword'],
    [
      'cambio obligatorio',
      ChangeRequiredPasswordDto,
      { email: 'ana@prueba.mx', passwordTemporal: 'Temporal-1' },
      'nuevaPassword',
    ],
    [
      'alta de personal',
      CreateUsuarioDto,
      {
        email: 'eva@prueba.mx',
        nombre: 'Eva',
        apellidos: 'Luadora',
        rol: 'evaluador',
      },
      'password',
    ],
  ];

  describe.each(casos)('%s', (_nombre, clase, base, campo) => {
    it('acepta una contraseña válida', async () => {
      expect(await mensajes(clase, { ...base, [campo]: VALIDAS[0] })).toEqual(
        [],
      );
    });

    it('rechaza una común con un mensaje claro', async () => {
      expect(
        await mensajes(clase, { ...base, [campo]: 'Password123' }),
      ).toEqual([MENSAJES_CONTRASENA.comun]);
    });

    it('rechaza una corta con un mensaje claro', async () => {
      expect(await mensajes(clase, { ...base, [campo]: 'Corta1' })).toEqual([
        MENSAJES_CONTRASENA.corta,
      ]);
    });

    it('rechaza un valor que no es texto', async () => {
      expect(
        (await mensajes(clase, { ...base, [campo]: 12345678901 })).length,
      ).toBeGreaterThan(0);
    });
  });

  it('el login NO aplica la política: las cuentas existentes siguen entrando', async () => {
    for (const password of ['Corta1', 'password123', 'aaaaaaaaa1', 'x']) {
      expect(
        await mensajes(LoginDto, { email: 'vieja@prueba.mx', password }),
      ).toEqual([]);
    }
  });
});
