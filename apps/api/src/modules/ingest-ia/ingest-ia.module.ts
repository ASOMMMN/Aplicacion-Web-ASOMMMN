import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Extraccion, ExtraccionSchema } from './schemas/extraccion.schema';
import { IngestIaService } from './ingest-ia.service';
import { IngestIaController } from './ingest-ia.controller';
import { OpenAiIaService } from './openai-ia.service';
import { Documento, DocumentoSchema } from '../documentos/schemas/documento.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Extraccion.name, schema: ExtraccionSchema },
      { name: Documento.name, schema: DocumentoSchema },
    ]),
  ],
  controllers: [IngestIaController],
  providers: [IngestIaService, OpenAiIaService],
})
export class IngestIaModule {}
