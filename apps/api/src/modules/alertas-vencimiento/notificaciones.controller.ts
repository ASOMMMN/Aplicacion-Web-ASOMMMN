import { Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AlertasVencimientoService } from './alertas-vencimiento.service';
import {
  ContadorNoLeidasDto,
  NotificacionItemDto,
  RevisionVencimientosDto,
} from './dto/notificacion-response.dto';

@ApiTags('notificaciones')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notificaciones')
export class NotificacionesController {
  constructor(private readonly alertasVencimientoService: AlertasVencimientoService) {}

  @Get()
  @Roles('evaluador', 'administrador')
  @ApiOperation({ summary: 'Listar notificaciones (opcionalmente solo no leídas)' })
  @ApiResponse({ status: 200, type: [NotificacionItemDto] })
  async listar(
    @Query('leida') leida?: string,
  ): Promise<NotificacionItemDto[]> {
    const soloNoLeidas = leida === 'false';
    return this.alertasVencimientoService.listar(soloNoLeidas);
  }

  @Get('no-leidas/contador')
  @Roles('evaluador', 'administrador')
  @ApiOperation({ summary: 'Contar notificaciones no leídas' })
  @ApiResponse({ status: 200, type: ContadorNoLeidasDto })
  async contarNoLeidas(): Promise<ContadorNoLeidasDto> {
    return this.alertasVencimientoService.contarNoLeidas();
  }

  @Patch(':id/leida')
  @Roles('evaluador', 'administrador')
  @ApiOperation({ summary: 'Marcar una notificación como leída' })
  async marcarLeida(@Param('id') id: string): Promise<{ message: string }> {
    return this.alertasVencimientoService.marcarLeida(id);
  }

  @Patch('marcar-todas-leidas')
  @Roles('evaluador', 'administrador')
  @ApiOperation({ summary: 'Marcar todas las notificaciones como leídas' })
  async marcarTodasLeidas(): Promise<{ message: string }> {
    return this.alertasVencimientoService.marcarTodasLeidas();
  }

  @Post('revisar-ahora')
  @Roles('evaluador', 'administrador')
  @ApiOperation({
    summary: 'Forzar la revisión de vencimientos (uso manual/pruebas, sin esperar al cron diario)',
  })
  @ApiResponse({ status: 200, type: RevisionVencimientosDto })
  async revisarAhora(): Promise<RevisionVencimientosDto> {
    return this.alertasVencimientoService.revisarVencimientos();
  }
}
