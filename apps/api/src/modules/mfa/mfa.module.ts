import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MFA, MFASchema } from './schemas/mfa.schema';
import { Usuario, UsuarioSchema } from '../usuarios/schemas/usuario.schema';
import { MFAService } from './mfa.service';
import { MFAController } from './mfa.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MFA.name, schema: MFASchema },
      { name: Usuario.name, schema: UsuarioSchema },
    ]),
  ],
  providers: [MFAService],
  controllers: [MFAController],
  exports: [MFAService],
})
export class MFAModule {}
