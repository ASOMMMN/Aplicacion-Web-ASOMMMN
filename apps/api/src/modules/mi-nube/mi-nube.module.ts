import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  DocumentoNube,
  DocumentoNubeSchema,
} from './schemas/documento-nube.schema';
import { MiNubeController } from './mi-nube.controller';
import { MiNubeService } from './mi-nube.service';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { Usuario, UsuarioSchema } from '../usuarios/schemas/usuario.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DocumentoNube.name, schema: DocumentoNubeSchema },
      { name: Usuario.name, schema: UsuarioSchema },
    ]),
    AuditoriaModule,
  ],
  controllers: [MiNubeController],
  providers: [MiNubeService],
})
export class MiNubeModule {}
