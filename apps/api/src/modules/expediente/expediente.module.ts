import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CursosModule } from '../cursos/cursos.module';
import { BitacoraEmbarqueModule } from '../bitacora-embarque/bitacora-embarque.module';
import { ResumenFechasModule } from '../resumen-fechas/resumen-fechas.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { ExpedienteController } from './expediente.controller';
import { ExpedienteService } from './expediente.service';
import { ExpedienteZipService } from './expediente-zip.service';
import {
  Postulante,
  PostulanteSchema,
} from '../postulantes/schemas/postulante.schema';
import {
  DocPersonal,
  DocPersonalSchema,
} from '../docs-personales/schemas/doc-personal.schema';
import { Curso, CursoSchema } from '../cursos/schemas/curso.schema';
import {
  Documento,
  DocumentoSchema,
} from '../documentos/schemas/documento.schema';

@Module({
  imports: [
    CursosModule,
    BitacoraEmbarqueModule,
    ResumenFechasModule,
    AuditoriaModule,
    MongooseModule.forFeature([
      { name: Postulante.name, schema: PostulanteSchema },
      { name: DocPersonal.name, schema: DocPersonalSchema },
      { name: Curso.name, schema: CursoSchema },
      { name: Documento.name, schema: DocumentoSchema },
    ]),
  ],
  controllers: [ExpedienteController],
  providers: [ExpedienteService, ExpedienteZipService],
})
export class ExpedienteModule {}
