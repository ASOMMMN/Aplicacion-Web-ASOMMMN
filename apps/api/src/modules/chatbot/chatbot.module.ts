import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  ChatConversacion,
  ChatConversacionSchema,
} from './schemas/chat-conversacion.schema';
import {
  Postulante,
  PostulanteSchema,
} from '../postulantes/schemas/postulante.schema';
import { ChatbotService } from './chatbot.service';
import { ChatbotController } from './chatbot.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChatConversacion.name, schema: ChatConversacionSchema },
      { name: Postulante.name, schema: PostulanteSchema },
    ]),
  ],
  controllers: [ChatbotController],
  providers: [ChatbotService],
})
export class ChatbotModule {}
