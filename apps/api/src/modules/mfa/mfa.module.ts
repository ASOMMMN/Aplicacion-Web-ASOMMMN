import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MFA, MFASchema } from './schemas/mfa.schema';
import { MFAService } from './mfa.service';
import { MFAController } from './mfa.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: MFA.name, schema: MFASchema }])],
  providers: [MFAService],
  controllers: [MFAController],
  exports: [MFAService],
})
export class MFAModule {}
