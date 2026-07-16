import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Embarque, EmbarqueSchema } from './schemas/embarque.schema';
import {
  Postulante,
  PostulanteSchema,
} from '../postulantes/schemas/postulante.schema';
import { Usuario, UsuarioSchema } from '../usuarios/schemas/usuario.schema';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { BitacoraEmbarqueController } from './bitacora-embarque.controller';
import { BitacoraEmbarqueService } from './bitacora-embarque.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Embarque.name, schema: EmbarqueSchema },
      { name: Postulante.name, schema: PostulanteSchema },
      { name: Usuario.name, schema: UsuarioSchema },
    ]),
    AuditoriaModule,
  ],
  controllers: [BitacoraEmbarqueController],
  providers: [BitacoraEmbarqueService],
  exports: [BitacoraEmbarqueService],
})
export class BitacoraEmbarqueModule {}
