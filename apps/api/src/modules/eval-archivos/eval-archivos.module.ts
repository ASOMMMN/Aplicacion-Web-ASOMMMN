import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { EvalArchivo, EvalArchivoSchema } from './schemas/eval-archivo.schema';
import {
  Postulante,
  PostulanteSchema,
} from '../postulantes/schemas/postulante.schema';
import { Usuario, UsuarioSchema } from '../usuarios/schemas/usuario.schema';
import { EvalArchivosService } from './eval-archivos.service';
import { EvalArchivosController } from './eval-archivos.controller';
import { AuditoriaModule } from '../auditoria/auditoria.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: EvalArchivo.name, schema: EvalArchivoSchema },
      { name: Postulante.name, schema: PostulanteSchema },
      { name: Usuario.name, schema: UsuarioSchema },
    ]),
    AuditoriaModule,
  ],
  controllers: [EvalArchivosController],
  providers: [EvalArchivosService],
})
export class EvalArchivosModule {}
