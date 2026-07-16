import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  Postulante,
  PostulanteSchema,
} from '../postulantes/schemas/postulante.schema';
import {
  Documento,
  DocumentoSchema,
} from '../documentos/schemas/documento.schema';
import { Usuario, UsuarioSchema } from '../usuarios/schemas/usuario.schema';
import {
  DocPersonal,
  DocPersonalSchema,
} from '../docs-personales/schemas/doc-personal.schema';
import { DocumentosModule } from '../documentos/documentos.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { Evaluacion, EvaluacionSchema } from './schemas/evaluacion.schema';
import { EvaluacionesController } from './evaluaciones.controller';
import { EvaluacionesService } from './evaluaciones.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Postulante.name, schema: PostulanteSchema },
      { name: Documento.name, schema: DocumentoSchema },
      { name: Usuario.name, schema: UsuarioSchema },
      { name: DocPersonal.name, schema: DocPersonalSchema },
      { name: Evaluacion.name, schema: EvaluacionSchema },
    ]),
    DocumentosModule,
    AuditoriaModule,
  ],
  controllers: [EvaluacionesController],
  providers: [EvaluacionesService],
  exports: [EvaluacionesService],
})
export class EvaluacionesModule {}
