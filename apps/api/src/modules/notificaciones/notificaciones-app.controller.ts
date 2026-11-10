import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
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
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import type { AuthUser } from '../auth/strategies/jwt.strategy';
import { NotificacionesAppService } from './notificaciones-app.service';
import {
  ListaNotificacionesAppDto,
  ListarNotificacionesAppQueryDto,
  MarcarTodasAppDto,
} from './dto/notificacion-app.dto';

/**
 * Campanita: avisos de nuevo candidato y expediente completo. El usuario se
 * toma SIEMPRE del JWT; ningún endpoint recibe un userId (sin IDOR).
 *
 * Vive bajo /notificaciones/mias para no chocar con las rutas de
 * vencimientos (/notificaciones, /notificaciones/:id/leida, ...).
 */
@ApiTags('notificaciones')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('evaluador', 'administrador')
@Controller('notificaciones/mias')
export class NotificacionesAppController {
  constructor(private readonly service: NotificacionesAppService) {}

  @Get()
  @ApiOperation({
    summary: 'Mis notificaciones (paginado, más recientes primero) y no leídas',
  })
  @ApiResponse({ status: 200, type: ListaNotificacionesAppDto })
  @ApiResponse({ status: 403, description: 'Rol sin acceso (postulante)' })
  listar(
    @CurrentUser() user: AuthUser,
    @Query() query: ListarNotificacionesAppQueryDto,
  ): Promise<ListaNotificacionesAppDto> {
    return this.service.listarMias(user.userId, query.pagina, query.limite);
  }

  @Patch('marcar-todas-leidas')
  @ApiOperation({ summary: 'Marcar todas mis notificaciones como leídas' })
  @ApiResponse({ status: 200, type: MarcarTodasAppDto })
  marcarTodas(@CurrentUser() user: AuthUser): Promise<MarcarTodasAppDto> {
    return this.service.marcarTodasLeidas(user.userId);
  }

  @Patch(':id/leida')
  @ApiOperation({ summary: 'Marcar una de mis notificaciones como leída' })
  @ApiResponse({ status: 404, description: 'No existe o no es mía' })
  marcarLeida(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ): Promise<{ message: string }> {
    return this.service.marcarLeida(user.userId, id);
  }
}
