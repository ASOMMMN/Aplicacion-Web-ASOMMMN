import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(10, 'Mínimo 10 caracteres')
  .max(72, 'Máximo 72 caracteres')
  .regex(/[a-z]/, 'Debe contener al menos una minúscula')
  .regex(/[A-Z]/, 'Debe contener al menos una mayúscula')
  .regex(/\d/, 'Debe contener al menos un número');

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
