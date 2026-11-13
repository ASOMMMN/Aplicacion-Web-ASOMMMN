import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { NotificacionesAppController } from './notificaciones-app.controller';
import {
  FiltroNotificacionesAppQueryDto,
  ListarNotificacionesAppQueryDto,
} from './dto/notificacion-app.dto';

type Handler = 'listar' | 'marcarTodas' | 'marcarLeida';
const HANDLERS: Handler[] = ['listar', 'marcarTodas', 'marcarLeida'];

/** /notificaciones/mias: solo evaluador y admin, y siempre "las mías". */
describe('NotificacionesAppController — permisos', () => {
  const contexto = (handler: Handler, rol: string) =>
    ({
      getHandler: () => NotificacionesAppController.prototype[handler],
      getClass: () => NotificacionesAppController,
      switchToHttp: () => ({ getRequest: () => ({ user: { rol } }) }),
    }) as unknown as ExecutionContext;

  it('exige JWT y roles en todo el controlador', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      NotificacionesAppController,
    ) as unknown[];
    expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard, RolesGuard]));
  });

  it.each(HANDLERS)(
    '%s: evaluador y admin pasan; postulante recibe 403',
    (h) => {
      const guard = new RolesGuard(new Reflector());
      expect(guard.canActivate(contexto(h, 'evaluador'))).toBe(true);
      expect(guard.canActivate(contexto(h, 'administrador'))).toBe(true);
      let error: unknown;
      try {
        guard.canActivate(contexto(h, 'postulante'));
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getStatus()).toBe(403);
    },
  );

  it('el usuario sale del JWT, nunca de la URL ni del body', async () => {
    const service = {
      listarMias: jest.fn().mockResolvedValue({}),
      marcarTodasLeidas: jest.fn().mockResolvedValue({}),
      marcarLeida: jest.fn().mockResolvedValue({}),
    };
    const c = new NotificacionesAppController(service as never);
    const yo = { userId: 'u-yo', email: 'e@x.mx', rol: 'evaluador' } as never;

    await c.listar(yo, {
      pagina: 2,
      limite: 5,
      soloNoLeidas: true,
      tipo: 'documento_subido',
      dia: '2026-11-11',
      agrupar: 'dia',
    });
    await c.marcarTodas(yo, { tipo: 'nuevo_candidato' });
    await c.marcarLeida(yo, 'abc');
    expect(service.listarMias).toHaveBeenCalledWith('u-yo', {
      pagina: 2,
      limite: 5,
      soloNoLeidas: true,
      tipo: 'documento_subido',
      dia: '2026-11-11',
      agrupar: 'dia',
    });
    expect(service.marcarTodasLeidas).toHaveBeenCalledWith('u-yo', {
      tipo: 'nuevo_candidato',
      dia: undefined,
    });
    expect(service.marcarLeida).toHaveBeenCalledWith('u-yo', 'abc');
  });

  it('valida el :id como ObjectId', () => {
    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      NotificacionesAppController,
      'marcarLeida',
    ) as Record<string, { data?: string; pipes?: unknown[] }>;
    const id = Object.values(args).find((a) => a.data === 'id');
    expect(id?.pipes).toContain(ParseObjectIdPipe);
  });

  it('paginado: acepta números en query y rechaza límites fuera de rango', async () => {
    const ok = plainToInstance(ListarNotificacionesAppQueryDto, {
      pagina: '2',
      limite: '10',
    });
    expect(await validate(ok)).toHaveLength(0);
    expect(ok).toMatchObject({ pagina: 2, limite: 10 });

    for (const mal of [{ limite: '51' }, { pagina: '0' }, { limite: 'x' }]) {
      const dto = plainToInstance(ListarNotificacionesAppQueryDto, mal);
      expect(await validate(dto)).not.toHaveLength(0);
    }
  });

  it('filtros: no leídas, tipo, día y agrupar se validan', async () => {
    const ok = plainToInstance(ListarNotificacionesAppQueryDto, {
      soloNoLeidas: 'true',
      tipo: 'candidato_inactivo',
      dia: '2026-11-11',
      agrupar: 'dia',
    });
    expect(await validate(ok)).toHaveLength(0);
    expect(ok.soloNoLeidas).toBe(true);
    expect(
      plainToInstance(ListarNotificacionesAppQueryDto, {
        soloNoLeidas: 'false',
      }).soloNoLeidas,
    ).toBe(false);

    for (const mal of [
      { soloNoLeidas: 'quizá' },
      { tipo: 'curso_por_vencer' },
      { tipo: '{"$ne":null}' },
      { dia: '11/11/2026' },
      { dia: '2026-13-01' },
      { agrupar: 'semana' },
    ]) {
      const dto = plainToInstance(ListarNotificacionesAppQueryDto, mal);
      expect(await validate(dto)).not.toHaveLength(0);
    }

    const marcar = plainToInstance(FiltroNotificacionesAppQueryDto, {
      dia: 'hoy',
    });
    expect(await validate(marcar)).not.toHaveLength(0);
  });
});
