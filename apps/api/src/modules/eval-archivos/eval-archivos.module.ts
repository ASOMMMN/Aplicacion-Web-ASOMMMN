import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { EvalArchivo, EvalArchivoSchema } from './schemas/eval-archivo.schema';
import { EvalArchivosService } from './eval-archivos.service';
import { EvalArchivosController } from './eval-archivos.controller';
import { AuditoriaModule } from '../auditoria/auditoria.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: EvalArchivo.name, schema: EvalArchivoSchema },
    ]),
    AuditoriaModule,
  ],
  controllers: [EvalArchivosController],
  providers: [EvalArchivosService],
})
export class EvalArchivosModule {}
