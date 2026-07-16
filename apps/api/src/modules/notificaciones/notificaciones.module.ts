import { Module, Global } from '@nestjs/common';
import { NotificacionesService } from './notificaciones.service';

@Global()
@Module({
  providers: [NotificacionesService],
  exports: [NotificacionesService],
})
export class NotificacionesModule {}
