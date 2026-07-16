import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Curso, CursoSchema } from '../cursos/schemas/curso.schema';
import { Postulante, PostulanteSchema } from '../postulantes/schemas/postulante.schema';
import { Usuario, UsuarioSchema } from '../usuarios/schemas/usuario.schema';
import { Notificacion, NotificacionSchema } from './schemas/notificacion.schema';
import { NotificacionesController } from './notificaciones.controller';
import { AlertasVencimientoService } from './alertas-vencimiento.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Curso.name, schema: CursoSchema },
      { name: Postulante.name, schema: PostulanteSchema },
      { name: Usuario.name, schema: UsuarioSchema },
      { name: Notificacion.name, schema: NotificacionSchema },
    ]),
  ],
  controllers: [NotificacionesController],
  providers: [AlertasVencimientoService],
  exports: [AlertasVencimientoService],
})
export class AlertasVencimientoModule {}
