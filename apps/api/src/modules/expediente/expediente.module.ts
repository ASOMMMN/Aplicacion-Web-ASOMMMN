import { Module } from '@nestjs/common';
import { CursosModule } from '../cursos/cursos.module';
import { BitacoraEmbarqueModule } from '../bitacora-embarque/bitacora-embarque.module';
import { ResumenFechasModule } from '../resumen-fechas/resumen-fechas.module';
import { ExpedienteController } from './expediente.controller';
import { ExpedienteService } from './expediente.service';

@Module({
  imports: [CursosModule, BitacoraEmbarqueModule, ResumenFechasModule],
  controllers: [ExpedienteController],
  providers: [ExpedienteService],
})
export class ExpedienteModule {}
