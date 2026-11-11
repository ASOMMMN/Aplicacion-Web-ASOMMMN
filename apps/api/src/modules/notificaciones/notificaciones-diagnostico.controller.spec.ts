import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';

import { NotificacionesDiagnosticoController } from './notificaciones-diagnostico.controller';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

describe('NotificacionesDiagnosticoController', () => {
  it('es solo para administrador y autenticado', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, NotificacionesDiagnosticoController),
    ).toEqual(['administrador']);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, NotificacionesDiagnosticoController),
    ).toEqual([JwtAuthGuard, RolesGuard]);
    expect(
      Reflect.getMetadata(PATH_METADATA, NotificacionesDiagnosticoController),
    ).toBe('notificaciones/diagnostico');
  });

  it('solo expone GET (lectura)', () => {
    const proto =
      NotificacionesDiagnosticoController.prototype as unknown as Record<
        string,
        unknown
      >;
    const metodos = Object.getOwnPropertyNames(proto)
      .filter((k) => k !== 'constructor')
      .map(
        (k) =>
          Reflect.getMetadata(METHOD_METADATA, proto[k] as object) as
            | RequestMethod
            | undefined,
      );
    expect(metodos).toEqual([RequestMethod.GET]);
  });

  it('delega el correo consultado al servicio', async () => {
    const diagnosticar = jest.fn().mockResolvedValue({ soloLectura: true });
    const ctrl = new NotificacionesDiagnosticoController({
      diagnosticar,
    } as never);
    await ctrl.diagnosticar({ email: 'a@b.mx' });
    expect(diagnosticar).toHaveBeenCalledWith('a@b.mx');
  });
});
