import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Campo `turnstileToken` en los DTO de login, registro y recuperar
 * contraseña. Es opcional para la validación (sin captcha en desarrollo); lo
 * exige TurnstileGuard, que corre antes del ValidationPipe. Se declara aquí
 * porque la API usa forbidNonWhitelisted: sin el campo en el DTO, el body
 * con el token respondería 400.
 */
export const TurnstileTokenOpcional = () =>
  applyDecorators(
    ApiPropertyOptional({
      description: 'Token del widget de Cloudflare Turnstile (un solo uso).',
    }),
    IsOptional(),
    IsString(),
    MaxLength(2048),
  );
