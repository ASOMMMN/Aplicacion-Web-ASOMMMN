import { Module } from '@nestjs/common';
import { CursosModule } from '../cursos/cursos.module';
import { BitacoraEmbarqueModule } from '../bitacora-embarque/bitacora-embarque.module';
import { ResumenFechasModule } from '../resumen-fechas/resumen-fechas.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { ExpedienteController } from './expediente.controller';
import { ExpedienteService } from './expediente.service';

@Module({
  imports: [
    CursosModule,
    BitacoraEmbarqueModule,
    ResumenFechasModule,
    AuditoriaModule,
  ],
  controllers: [ExpedienteController],
  providers: [ExpedienteService],
})
export class ExpedienteModule {}
