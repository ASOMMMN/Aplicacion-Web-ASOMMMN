import { z } from 'zod';
import { evaluarContrasena } from './politica-contrasena';

/**
 * Contraseña nueva (registro, restablecer, cambio obligatorio): la misma
 * política que la API (politica-contrasena.ts, copia idéntica). El login no
 * la aplica.
 */
export const passwordSchema = z.string().superRefine((valor, ctx) => {
  const problema = evaluarContrasena(valor);
  if (problema) ctx.addIssue({ code: 'custom', message: problema });
});

export const loginSchema = z.object({
  email: z.string().email('Correo inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

export const registerSchema = z
  .object({
    nombre: z.string().min(2, 'Mínimo 2 caracteres').max(50),
    apellidos: z.string().min(2, 'Mínimo 2 caracteres').max(100),
    email: z.string().email('Correo inválido'),
    password: passwordSchema,
    confirmar: z.string(),
  })
  .refine((d) => d.password === d.confirmar, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmar'],
  });

export const forgotPasswordSchema = z.object({
  email: z.string().email('Correo inválido'),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, 'Token requerido'),
    password: passwordSchema,
    confirmar: z.string(),
  })
  .refine((d) => d.password === d.confirmar, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmar'],
  });

export type LoginForm = z.infer<typeof loginSchema>;
export type RegisterForm = z.infer<typeof registerSchema>;
export type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;
