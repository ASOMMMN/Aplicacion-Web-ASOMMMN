import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { NotificacionesAppService } from './notificaciones-app.service';
import {
  DiagnosticoNotificacionesAppDto,
  DiagnosticoNotificacionesAppQueryDto,
} from './dto/diagnostico-notificaciones-app.dto';

/**
 * Comprobación de la campanita para el administrador. SOLO LECTURA: no crea
 * ni modifica notificaciones, usuarios ni índices.
 */
@ApiTags('notificaciones')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador')
@Controller('notificaciones/diagnostico')
export class NotificacionesDiagnosticoController {
  constructor(private readonly service: NotificacionesAppService) {}

  @Get()
  @ApiOperation({
    summary:
      'Solo lectura: cuántos destinatarios tendría hoy un aviso de la campanita y si un correo está incluido',
  })
  @ApiResponse({ status: 200, type: DiagnosticoNotificacionesAppDto })
  @ApiResponse({ status: 403, description: 'Solo administrador' })
  diagnosticar(
    @Query() query: DiagnosticoNotificacionesAppQueryDto,
  ): Promise<DiagnosticoNotificacionesAppDto> {
    return this.service.diagnosticar(query.email);
  }
}
