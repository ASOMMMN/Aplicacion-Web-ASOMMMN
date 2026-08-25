import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { DocsPersonalesController } from './docs-personales.controller';
import { DocsPersonalesService } from './docs-personales.service';
import { DocPersonal, DocPersonalSchema } from './schemas/doc-personal.schema';
import {
  Postulante,
  PostulanteSchema,
} from '../postulantes/schemas/postulante.schema';
import { Usuario, UsuarioSchema } from '../usuarios/schemas/usuario.schema';
import { StorageModule } from '../storage/storage.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DocPersonal.name, schema: DocPersonalSchema },
      { name: Postulante.name, schema: PostulanteSchema },
      { name: Usuario.name, schema: UsuarioSchema },
    ]),
    StorageModule,
    AuditoriaModule,
  ],
  controllers: [DocsPersonalesController],
  providers: [DocsPersonalesService],
  exports: [DocsPersonalesService],
})
export class DocsPersonalesModule {}
