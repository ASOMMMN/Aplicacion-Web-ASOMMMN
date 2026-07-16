import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReportesService } from './reportes.service';
import { EstadisticasResponseDto } from './dto/estadisticas-response.dto';

@ApiTags('reportes')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  @Get('estadisticas')
  @Roles('administrador')
  @ApiOperation({ summary: 'Estadísticas generales del sistema' })
  @ApiResponse({ status: 200, type: EstadisticasResponseDto })
  async getEstadisticas(): Promise<EstadisticasResponseDto> {
    return this.reportesService.getEstadisticas();
  }

  @Get('exportar-csv')
  @Roles('administrador')
  @ApiOperation({ summary: 'Exportar candidatos a CSV' })
  @ApiProduces('text/csv')
  @ApiResponse({
    status: 200,
    description: 'Archivo CSV con todos los candidatos',
  })
  async exportarCSV(@Res() res: Response): Promise<void> {
    const csv = await this.reportesService.exportarCandidatosCSV();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="candidatos.csv"',
    );
    res.send(csv);
  }
}
