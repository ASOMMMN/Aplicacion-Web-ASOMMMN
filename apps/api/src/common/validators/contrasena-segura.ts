import { applyDecorators } from '@nestjs/common';
import {
  IsString,
  ValidateBy,
  type ValidationArguments,
} from 'class-validator';

import { evaluarContrasena } from './politica-contrasena';

/**
 * Decorador único para los DTO que crean o cambian una contraseña. Devuelve
 * un solo mensaje claro (el primer problema). No se usa en el login: las
 * cuentas existentes siguen entrando con su contraseña actual.
 */
export function ContrasenaSegura(): PropertyDecorator {
  return applyDecorators(
    IsString({ message: 'La contraseña debe ser texto.' }),
    ValidateBy({
      name: 'contrasenaSegura',
      validator: {
        validate: (valor: unknown) =>
          typeof valor === 'string' && evaluarContrasena(valor) === null,
        defaultMessage: (args?: ValidationArguments) =>
          typeof args?.value === 'string'
            ? (evaluarContrasena(args.value) ?? '')
            : 'La contraseña debe ser texto.',
      },
    }),
  );
}
