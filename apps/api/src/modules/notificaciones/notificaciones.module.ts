import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificacionesService } from './notificaciones.service';
import { NotificacionesAppService } from './notificaciones-app.service';
import { NotificacionesAppController } from './notificaciones-app.controller';
import { NotificacionesDiagnosticoController } from './notificaciones-diagnostico.controller';
import {
  NotificacionApp,
  NotificacionAppSchema,
} from './schemas/notificacion-app.schema';
import { Usuario, UsuarioSchema } from '../usuarios/schemas/usuario.schema';
import {
  Postulante,
  PostulanteSchema,
} from '../postulantes/schemas/postulante.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: NotificacionApp.name, schema: NotificacionAppSchema },
      { name: Usuario.name, schema: UsuarioSchema },
      { name: Postulante.name, schema: PostulanteSchema },
    ]),
  ],
  controllers: [
    NotificacionesAppController,
    NotificacionesDiagnosticoController,
  ],
  providers: [NotificacionesService, NotificacionesAppService],
  exports: [NotificacionesService, NotificacionesAppService],
})
export class NotificacionesModule {}
