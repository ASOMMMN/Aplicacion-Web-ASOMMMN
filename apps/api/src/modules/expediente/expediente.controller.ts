import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ExpedienteService } from './expediente.service';

@ApiTags('expediente')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('evaluador', 'administrador')
@Controller('candidatos/:id')
export class ExpedienteController {
  constructor(private readonly expedienteService: ExpedienteService) {}

  @Get('expediente')
  @ApiOperation({
    summary:
      'Exportar expediente combinado (cursos/certificaciones + bitácora de embarque) a Word o PDF',
  })
  async generarExpediente(
    @Param('id') postulanteId: string,
    @Query('formato') formato: string = 'pdf',
    @Res() res: Response,
  ): Promise<void> {
    const fmt: 'docx' | 'pdf' = formato === 'docx' ? 'docx' : 'pdf';
    const { filename, buffer, mimeType } =
      await this.expedienteService.generarExpediente(postulanteId, fmt);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.end(buffer);
  }
}
