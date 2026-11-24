import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loginSchema, registerSchema, resetPasswordSchema } from '../auth';
import { MENSAJES_CONTRASENA, evaluarContrasena } from '../politica-contrasena';

describe('Política de contraseñas (web)', () => {
  it('es una copia idéntica de la de la API', () => {
    const web = readFileSync(join(__dirname, '../politica-contrasena.ts'), 'utf8');
    const api = readFileSync(
      join(__dirname, '../../../../../api/src/common/validators/politica-contrasena.ts'),
      'utf8',
    );
    expect(web.replace(/\r\n/g, '\n')).toBe(api.replace(/\r\n/g, '\n'));
  });

  const base = { nombre: 'Ana', apellidos: 'López', email: 'ana@prueba.mx' };
  const mensajeRegistro = (password: string) => {
    const r = registerSchema.safeParse({ ...base, password, confirmar: password });
    return r.success ? null : r.error.issues.find((i) => i.path[0] === 'password')?.message;
  };

  it.each([
    ['Gaviota-Norte-42', null],
    ['velero2rojo9', null],
    ['Corta1', MENSAJES_CONTRASENA.corta],
    ['sololetrasaqui', MENSAJES_CONTRASENA.letraYNumero],
    ['Password123', MENSAJES_CONTRASENA.comun],
    ['P@ssw0rd2024', MENSAJES_CONTRASENA.comun],
  ])('registro con %p muestra %p', (password, esperado) => {
    expect(mensajeRegistro(password) ?? null).toBe(esperado);
    expect(evaluarContrasena(password)).toBe(esperado);
  });

  it('restablecer usa la misma política', () => {
    const r = resetPasswordSchema.safeParse({
      token: 't',
      password: 'Contrasena2024',
      confirmar: 'Contrasena2024',
    });
    expect(r.success).toBe(false);
    expect(r.success ? '' : r.error.issues[0].message).toBe(MENSAJES_CONTRASENA.comun);
  });

  it('el login no aplica la política: las cuentas existentes siguen entrando', () => {
    for (const password of ['Corta1', 'password123', 'x']) {
      expect(loginSchema.safeParse({ email: 'vieja@prueba.mx', password }).success).toBe(true);
    }
  });

  it('los mensajes están en español y son claros', () => {
    expect(MENSAJES_CONTRASENA.ayuda).toMatch(/Mínimo 10 caracteres/);
    expect(MENSAJES_CONTRASENA.comun).toMatch(/muy común/);
  });
});
