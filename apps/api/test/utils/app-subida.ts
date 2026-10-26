/**
 * App Nest mínima para probar endpoints de subida por HTTP: el
 * FileInterceptor y multer son los reales (límite de tamaño incluido); el
 * servicio va simulado y los guards de JWT/rol se sustituyen por uno que
 * deja pasar y pone `usuario` en req.user (los guards se prueban aparte).
 */
import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  type Type,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/common/guards/roles.guard';

export interface UsuarioPrueba {
  userId: string;
  email: string;
  rol: string;
}

export async function crearAppDeSubida(
  controlador: Type,
  servicio: { provide: Type; useValue: unknown },
  usuario: UsuarioPrueba,
): Promise<INestApplication> {
  const permitir: CanActivate = {
    canActivate: (ctx: ExecutionContext) => {
      ctx.switchToHttp().getRequest<{ user?: UsuarioPrueba }>().user = usuario;
      return true;
    },
  };
  const modulo = await Test.createTestingModule({
    controllers: [controlador],
    providers: [servicio],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue(permitir)
    .overrideGuard(RolesGuard)
    .useValue(permitir)
    .compile();
  const app = modulo.createNestApplication({ logger: false });
  await app.init();
  return app;
}

/** POST multipart con un solo archivo de `bytes` bytes (contenido en ceros). */
export function subirArchivo(
  app: INestApplication,
  ruta: string,
  campo: string,
  bytes: number,
  nombre = 'archivo.pdf',
) {
  return request(app.getHttpServer() as Parameters<typeof request>[0])
    .post(ruta)
    .attach(campo, Buffer.alloc(bytes), {
      filename: nombre,
      contentType: 'application/pdf',
    });
}
