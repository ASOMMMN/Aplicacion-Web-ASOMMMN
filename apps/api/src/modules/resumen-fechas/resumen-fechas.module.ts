import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ResumenFechasController } from './resumen-fechas.controller';
import { ResumenFechasService } from './resumen-fechas.service';

import { CursosModule } from '../cursos/cursos.module';
import { DocsPersonalesModule } from '../docs-personales/docs-personales.module';

import {
  Extraccion,
  ExtraccionSchema,
} from '../ingest-ia/schemas/extraccion.schema';

import {
  Postulante,
  PostulanteSchema,
} from '../postulantes/schemas/postulante.schema';

import {
  Usuario,
  UsuarioSchema,
} from '../usuarios/schemas/usuario.schema';

@Module({
  imports: [
    CursosModule,
    DocsPersonalesModule,

    MongooseModule.forFeature([
      {
        name: Extraccion.name,
        schema: ExtraccionSchema,
      },
      {
        name: Postulante.name,
        schema: PostulanteSchema,
      },
      {
        name: Usuario.name,
        schema: UsuarioSchema,
      },
    ]),
  ],

  controllers: [ResumenFechasController],

  providers: [ResumenFechasService],
})
export class ResumenFechasModule {}