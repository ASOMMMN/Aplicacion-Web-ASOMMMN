import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { GUARDS_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { DocsPersonalesController } from './docs-personales.controller';
import { DesbloquearFechasDto } from './dto/doc-personal.dto';

/** "Desbloquear y reanalizar": solo evaluador y administrador, con id validado. */
describe('POST /docs-personales/:id/desbloquear-reanalizar', () => {
  // eslint-disable-next-line @typescript-eslint/unbound-method -- solo se usa como valor para leer sus metadatos de decoradores, nunca se invoca.
  const handler = DocsPersonalesController.prototype.desbloquearYReanalizar;

  const contexto = (rol: string) =>
    ({
      getHandler: () => handler,
      getClass: () => DocsPersonalesController,
      switchToHttp: () => ({ getRequest: () => ({ user: { rol } }) }),
    }) as unknown as ExecutionContext;

  it('el controlador exige JWT y roles', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      DocsPersonalesController,
    ) as unknown[];
    expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard, RolesGuard]));
  });

  it('evaluador y administrador pasan; el postulante no', () => {
    const guard = new RolesGuard(new Reflector());
    expect(guard.canActivate(contexto('evaluador'))).toBe(true);
    expect(guard.canActivate(contexto('administrador'))).toBe(true);
    expect(() => guard.canActivate(contexto('postulante'))).toThrow(
      ForbiddenException,
    );
  });

  it('valida el :id como ObjectId', () => {
    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      DocsPersonalesController,
      'desbloquearYReanalizar',
    ) as Record<string, { data?: string; pipes?: unknown[] }>;
    const id = Object.values(args).find((a) => a.data === 'id');
    expect(id?.pipes).toContain(ParseObjectIdPipe);
    expect(() => new ParseObjectIdPipe().transform('no-es-un-id')).toThrow(
      BadRequestException,
    );
  });

  it('solo acepta campos de fecha conocidos', async () => {
    const ok = plainToInstance(DesbloquearFechasDto, {
      campos: ['fechaVencimiento'],
    });
    const mal = plainToInstance(DesbloquearFechasDto, { campos: ['otro'] });
    expect(await validate(ok)).toHaveLength(0);
    expect(await validate(mal)).not.toHaveLength(0);
  });
});
