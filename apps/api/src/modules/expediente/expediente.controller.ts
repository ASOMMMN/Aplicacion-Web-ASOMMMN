import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { AuthUser } from '../auth/strategies/jwt.strategy';
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
      'Exportar expediente combinado (cursos/certificaciones, documentos personales y bitácora de embarque) a Word o PDF',
  })
  async generarExpediente(
    @Param('id', ParseObjectIdPipe) postulanteId: string,
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

  @Get('bitacora-vigencias')
  @ApiOperation({
    summary:
      'Exportar bitácora de vigencias (cursos/certificaciones y documentos personales, ordenados por vencimiento) a Word o PDF',
    description:
      'Documento propio, distinto del expediente: mismo encabezado y estilos, solo el resumen de vigencias.',
  })
  async generarBitacoraVigencias(
    @Param('id', ParseObjectIdPipe) postulanteId: string,
    @Query('formato') formato: string = 'pdf',
    @CurrentUser() actor: AuthUser,
    @Res() res: Response,
  ): Promise<void> {
    const fmt: 'docx' | 'pdf' = formato === 'docx' ? 'docx' : 'pdf';
    const { filename, buffer, mimeType } =
      await this.expedienteService.generarBitacoraVigencias(
        postulanteId,
        fmt,
        actor,
      );
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.end(buffer);
  }
}
