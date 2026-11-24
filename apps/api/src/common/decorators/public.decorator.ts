import { SetMetadata } from '@nestjs/common';

export const ES_PUBLICA_KEY = 'esRutaPublica';

/**
 * Marca a propósito una ruta (o un controlador) como pública: responde sin
 * sesión. Sin este decorador, RutasCerradasGuard exige que la ruta declare
 * JwtAuthGuard + RolesGuard + @Roles; si no, responde 403.
 *
 * Usar solo en rutas que de verdad deben abrirse sin sesión (login,
 * registro, recuperar contraseña, health...). La prueba
 * test/rutas-cerradas.e2e-spec.ts tiene la lista esperada de rutas públicas.
 */
export const Public = () => SetMetadata(ES_PUBLICA_KEY, true);
