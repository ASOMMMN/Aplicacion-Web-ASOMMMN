import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '../auth';

// Datos sintéticos: nada de personas reales.
const valido = {
  nombre: 'Ana',
  apellidos: 'Prueba Sintética',
  email: 'ana@ejemplo.test',
  password: 'Clave12345',
  confirmar: 'Clave12345',
};

const mensajes = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.error?.issues.map((i) => i.message) ?? [];

describe('validadores de autenticación (zod)', () => {
  it('registro válido', () => {
    expect(registerSchema.safeParse(valido).success).toBe(true);
  });

  it('registro: rechaza correo inválido, nombre corto y contraseñas distintas', () => {
    const r = registerSchema.safeParse({
      ...valido,
      nombre: 'A',
      email: 'no-es-correo',
      confirmar: 'OtraClave123',
    });
    expect(r.success).toBe(false);
    const m = mensajes(r);
    expect(m).toContain('Correo inválido');
    expect(m).toContain('Mínimo 2 caracteres');
    expect(m).toContain('Las contraseñas no coinciden');
  });

  it.each([
    ['corta', 'Ab1', 'Mínimo 10 caracteres'],
    ['sin minúscula', 'CLAVE12345', 'Debe contener al menos una minúscula'],
    ['sin mayúscula', 'clave12345', 'Debe contener al menos una mayúscula'],
    ['sin número', 'ClaveClave', 'Debe contener al menos un número'],
    ['demasiado larga', 'Aa1' + 'x'.repeat(70), 'Máximo 72 caracteres'],
  ])('contraseña %s: mensaje en español', (_nombre, password, esperado) => {
    const r = registerSchema.safeParse({ ...valido, password, confirmar: password });
    expect(r.success).toBe(false);
    expect(mensajes(r)).toContain(esperado);
  });

  it('el error de confirmación cae en el campo "confirmar"', () => {
    const r = registerSchema.safeParse({ ...valido, confirmar: 'x' });
    expect(r.success).toBe(false);
    expect(r.error?.issues.find((i) => i.message === 'Las contraseñas no coinciden')?.path).toEqual([
      'confirmar',
    ]);
  });

  it('login: correo válido y contraseña obligatoria', () => {
    expect(loginSchema.safeParse({ email: 'a@b.test', password: 'x' }).success).toBe(true);
    const r = loginSchema.safeParse({ email: 'a@b.test', password: '' });
    expect(mensajes(r)).toContain('La contraseña es requerida');
  });

  it('recuperar contraseña: correo inválido', () => {
    expect(mensajes(forgotPasswordSchema.safeParse({ email: 'x' }))).toContain('Correo inválido');
  });

  it('restablecer: exige token y las mismas reglas de contraseña', () => {
    expect(
      resetPasswordSchema.safeParse({ token: 't', password: 'Clave12345', confirmar: 'Clave12345' }).success,
    ).toBe(true);
    expect(
      mensajes(resetPasswordSchema.safeParse({ token: '', password: 'Clave12345', confirmar: 'Clave12345' })),
    ).toContain('Token requerido');
  });
});
