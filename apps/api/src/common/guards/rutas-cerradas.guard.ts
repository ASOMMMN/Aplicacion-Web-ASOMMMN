import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';

import { ES_PUBLICA_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

export const MENSAJE_RUTA_NO_DECLARADA = 'Acceso denegado.';

/** El guard declarado es (o hereda de) `tipo`, como clase o como instancia. */
function esGuard(guard: unknown, tipo: abstract new (...a: never[]) => object) {
  if (typeof guard === 'function') {
    return guard === tipo || guard.prototype instanceof tipo;
  }
  return guard instanceof tipo;
}

/**
 * Rutas cerradas por defecto (guard global, APP_GUARD).
 *
 * Deja pasar una ruta solo si:
 * - está marcada con @Public(), o
 * - declara JwtAuthGuard y RolesGuard (en el controlador o en el método) y
 *   al menos un rol con @Roles().
 *
 * No autentica ni revisa roles por sí mismo: eso lo siguen haciendo los
 * guards de cada ruta, igual que antes. Lo que evita es que una ruta nueva
 * que olvidó declarar sus guards quede abierta: sin declaración, 403.
 */
@Injectable()
export class RutasCerradasGuard implements CanActivate {
  private readonly logger = new Logger(RutasCerradasGuard.name);
  private readonly avisadas = new Set<string>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const handler = context.getHandler();
    const clase = context.getClass();

    if (
      this.reflector.getAllAndOverride<boolean>(ES_PUBLICA_KEY, [
        handler,
        clase,
      ])
    ) {
      return true;
    }

    const guards = [
      ...((Reflect.getMetadata(GUARDS_METADATA, clase) as unknown[]) ?? []),
      ...((Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[]) ?? []),
    ];
    const roles =
      this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
        handler,
        clase,
      ]) ?? [];

    const declarada =
      guards.some((g) => esGuard(g, JwtAuthGuard)) &&
      guards.some((g) => esGuard(g, RolesGuard)) &&
      roles.length > 0;
    if (declarada) return true;

    // Un error por ruta (no por petición): es un fallo de código, no de uso.
    const id = `${clase.name}.${handler.name}`;
    if (!this.avisadas.has(id)) {
      this.avisadas.add(id);
      this.logger.error(
        `[rutas-cerradas] ${id} no declara @Public() ni JwtAuthGuard + RolesGuard + @Roles: se responde 403.`,
      );
    }
    throw new ForbiddenException(MENSAJE_RUTA_NO_DECLARADA);
  }
}
