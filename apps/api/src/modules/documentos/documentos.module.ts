import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { DocumentosController } from './documentos.controller';
import { DocumentosService } from './documentos.service';
import { Documento, DocumentoSchema } from './schemas/documento.schema';
import {
  Postulante,
  PostulanteSchema,
} from '../postulantes/schemas/postulante.schema';
import { Usuario, UsuarioSchema } from '../usuarios/schemas/usuario.schema';
import { PostulantesModule } from '../postulantes/postulantes.module';
import { StorageModule } from '../storage/storage.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Documento.name, schema: DocumentoSchema },
      { name: Postulante.name, schema: PostulanteSchema },
      { name: Usuario.name, schema: UsuarioSchema },
    ]),
    PostulantesModule,
    StorageModule,
    AuditoriaModule,
  ],
  controllers: [DocumentosController],
  providers: [DocumentosService],
  exports: [DocumentosService],
})
export class DocumentosModule {}
