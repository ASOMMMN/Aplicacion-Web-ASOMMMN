import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { DocsPersonalesController } from './docs-personales.controller';
import { DocsPersonalesService } from './docs-personales.service';
import { AnalisisGlobalService } from './analisis-global.service';
import { DocPersonal, DocPersonalSchema } from './schemas/doc-personal.schema';
import {
  CacheExtraccionIa,
  CacheExtraccionIaSchema,
} from './schemas/cache-extraccion-ia.schema';
import { ExtraccionIaService } from './extraccion-ia.service';
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
      { name: CacheExtraccionIa.name, schema: CacheExtraccionIaSchema },
      { name: Postulante.name, schema: PostulanteSchema },
      { name: Usuario.name, schema: UsuarioSchema },
    ]),
    StorageModule,
    AuditoriaModule,
  ],
  controllers: [DocsPersonalesController],
  providers: [
    DocsPersonalesService,
    AnalisisGlobalService,
    ExtraccionIaService,
  ],
  exports: [DocsPersonalesService, ExtraccionIaService],
})
export class DocsPersonalesModule {}
