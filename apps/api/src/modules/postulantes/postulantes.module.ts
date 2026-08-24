import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { PostulantesController } from './postulantes.controller';
import { PostulantesService } from './postulantes.service';
import { Postulante, PostulanteSchema } from './schemas/postulante.schema';
import { NubeItem, NubeItemSchema } from './schemas/nube-item.schema';
import {
  DocPersonal,
  DocPersonalSchema,
} from '../docs-personales/schemas/doc-personal.schema';
import {
  Documento,
  DocumentoSchema,
} from '../documentos/schemas/documento.schema';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Postulante.name, schema: PostulanteSchema },
      { name: NubeItem.name, schema: NubeItemSchema },
      { name: DocPersonal.name, schema: DocPersonalSchema },
      { name: Documento.name, schema: DocumentoSchema },
    ]),
    UsuariosModule,
    AuditoriaModule,
  ],
  controllers: [PostulantesController],
  providers: [PostulantesService],
  exports: [PostulantesService],
})
export class PostulantesModule {}
