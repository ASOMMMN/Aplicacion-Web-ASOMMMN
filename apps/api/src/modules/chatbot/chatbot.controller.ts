import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/strategies/jwt.strategy';

import { ChatbotService } from './chatbot.service';
import {
  EliminarConversacionResponseDto,
  EnviarMensajeDto,
  EnviarMensajeResponseDto,
  HistorialResponseDto,
  ListarConversacionesResponseDto,
  NuevaConversacionResponseDto,
} from './dto/chatbot.dto';

@ApiTags('chatbot')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('chatbot')
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  @Post('mensaje')
  @Roles('postulante')
  @ApiOperation({ summary: 'Postulante: envía un mensaje al chatbot de ayuda' })
  @ApiResponse({ status: 201, type: EnviarMensajeResponseDto })
  enviarMensaje(
    @CurrentUser() user: AuthUser,
    @Body() body: EnviarMensajeDto,
  ): Promise<EnviarMensajeResponseDto> {
    return this.chatbotService.enviarMensaje(user.userId, body.mensaje);
  }

  @Get('historial')
  @Roles('postulante')
  @ApiOperation({
    summary: 'Postulante: obtiene el historial de la conversación activa',
  })
  @ApiResponse({ status: 200, type: HistorialResponseDto })
  obtenerHistorial(
    @CurrentUser() user: AuthUser,
  ): Promise<HistorialResponseDto> {
    return this.chatbotService.obtenerHistorial(user.userId);
  }

  @Post('nueva-conversacion')
  @Roles('postulante')
  @ApiOperation({
    summary:
      'Postulante: archiva la conversación activa e inicia una nueva vacía',
  })
  @ApiResponse({ status: 201, type: NuevaConversacionResponseDto })
  iniciarNuevaConversacion(
    @CurrentUser() user: AuthUser,
  ): Promise<NuevaConversacionResponseDto> {
    return this.chatbotService.iniciarNuevaConversacion(user.userId);
  }

  @Get('conversaciones')
  @Roles('postulante')
  @ApiOperation({
    summary:
      'Postulante: lista todas sus conversaciones (activas y archivadas)',
  })
  @ApiResponse({ status: 200, type: ListarConversacionesResponseDto })
  listarConversaciones(
    @CurrentUser() user: AuthUser,
  ): Promise<ListarConversacionesResponseDto> {
    return this.chatbotService.listarConversaciones(user.userId);
  }

  @Patch('conversaciones/:id/seleccionar')
  @Roles('postulante')
  @ApiOperation({
    summary:
      'Postulante: activa una conversación anterior y retorna su historial',
  })
  @ApiResponse({ status: 200, type: HistorialResponseDto })
  seleccionarConversacion(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<HistorialResponseDto> {
    return this.chatbotService.seleccionarConversacion(user.userId, id);
  }

  @Delete('conversaciones/:id')
  @Roles('postulante')
  @ApiOperation({
    summary: 'Postulante: elimina permanentemente una conversación',
  })
  @ApiResponse({ status: 200, type: EliminarConversacionResponseDto })
  eliminarConversacion(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<EliminarConversacionResponseDto> {
    return this.chatbotService.eliminarConversacion(user.userId, id);
  }
}
