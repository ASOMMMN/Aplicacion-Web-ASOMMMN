import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Usuario, UsuarioSchema } from '../usuarios/schemas/usuario.schema';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { PrivacidadController } from './privacidad.controller';
import { PrivacidadService } from './privacidad.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Usuario.name, schema: UsuarioSchema }]),
    AuditoriaModule,
  ],
  controllers: [PrivacidadController],
  providers: [PrivacidadService],
})
export class PrivacidadModule {}
