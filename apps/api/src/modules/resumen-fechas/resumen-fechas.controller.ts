import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';

import {
  ResumenFechasResponse,
  ResumenFechasService,
} from './resumen-fechas.service';

@ApiTags('Resumen de Fechas')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('evaluador', 'administrador')
@Controller('resumen-fechas')
export class ResumenFechasController {
  constructor(private readonly resumenFechasService: ResumenFechasService) {}

  @Get('postulante/:postulanteId')
  @ApiOperation({
    summary:
      'Evaluador/Admin: generar resumen de fechas mediante extracción IA',
  })
  @ApiResponse({ status: 200, description: 'Resumen generado correctamente.' })
  @ApiResponse({ status: 400, description: 'ID de postulante inválido.' })
  @ApiResponse({ status: 401, description: 'No autenticado.' })
  @ApiResponse({ status: 403, description: 'Rol no autorizado.' })
  @ApiResponse({ status: 404, description: 'Postulante no encontrado.' })
  async generarResumen(
    @Param('postulanteId', ParseObjectIdPipe) postulanteId: string,
  ): Promise<ResumenFechasResponse> {
    return this.resumenFechasService.generarResumen(postulanteId);
  }

  @Get('postulante/:postulanteId/formateado')
  @ApiOperation({
    summary: 'Evaluador/Admin: generar resumen de fechas formateado',
  })
  @ApiResponse({
    status: 200,
    description: 'Resumen formateado correctamente.',
  })
  @ApiResponse({ status: 400, description: 'ID de postulante inválido.' })
  @ApiResponse({ status: 401, description: 'No autenticado.' })
  @ApiResponse({ status: 403, description: 'Rol no autorizado.' })
  @ApiResponse({ status: 404, description: 'Postulante no encontrado.' })
  async generarResumenFormateado(
    @Param('postulanteId', ParseObjectIdPipe) postulanteId: string,
  ) {
    return this.resumenFechasService.generarResumenFormateado(postulanteId);
  }
}
