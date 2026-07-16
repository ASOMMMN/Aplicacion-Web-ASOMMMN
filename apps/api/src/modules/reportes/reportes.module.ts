import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Usuario, UsuarioSchema } from '../usuarios/schemas/usuario.schema';
import {
  Postulante,
  PostulanteSchema,
} from '../postulantes/schemas/postulante.schema';
import {
  Documento,
  DocumentoSchema,
} from '../documentos/schemas/documento.schema';
import {
  Evaluacion,
  EvaluacionSchema,
} from '../evaluaciones/schemas/evaluacion.schema';
import { ReportesController } from './reportes.controller';
import { ReportesService } from './reportes.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Usuario.name, schema: UsuarioSchema },
      { name: Postulante.name, schema: PostulanteSchema },
      { name: Documento.name, schema: DocumentoSchema },
      { name: Evaluacion.name, schema: EvaluacionSchema },
    ]),
  ],
  controllers: [ReportesController],
  providers: [ReportesService],
})
export class ReportesModule {}
