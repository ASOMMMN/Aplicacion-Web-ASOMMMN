import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import {
  MensajeTopeIa,
  UserThrottlerGuard,
} from '../../common/guards/user-throttler.guard';
import { AuthUser } from '../auth/strategies/jwt.strategy';
import { ExpedienteService } from './expediente.service';
import { ExpedienteZipService } from './expediente-zip.service';

@ApiTags('expediente')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('evaluador', 'administrador')
@Controller('candidatos/:id')
export class ExpedienteController {
  constructor(
    private readonly expedienteService: ExpedienteService,
    private readonly expedienteZipService: ExpedienteZipService,
  ) {}

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
    // El expediente se genera de nuevo en cada petición (fechas, cursos y
    // documentos pueden haber cambiado): sin esto, el navegador o un proxy
    // intermedio puede servir una descarga anterior cacheada.
    res.setHeader('Cache-Control', 'no-store');
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
    res.setHeader('Cache-Control', 'no-store');
    res.end(buffer);
  }

  @Get('documentos-zip')
  @UseGuards(UserThrottlerGuard)
  @Throttle({ ia: { limit: 10, ttl: 600_000 } })
  @MensajeTopeIa(
    'Has alcanzado el límite de descargas ZIP del expediente. Intenta de nuevo en unos minutos.',
  )
  @ApiProduces('application/zip')
  @ApiOperation({
    summary:
      'Descargar en un ZIP todos los documentos que subió el aspirante (personales, cursos/certificaciones y CV)',
    description:
      'Streaming directo desde S3, sin compresión (los PDF ya vienen comprimidos). Si un archivo no se puede leer se incluye LEEME.txt con el detalle. Queda registrado en auditoría (expediente_zip_descargado).',
  })
  @ApiResponse({
    status: 404,
    description: 'Postulante sin documentos o inexistente',
  })
  @ApiResponse({
    status: 422,
    description: 'Expediente por encima del límite de tamaño',
  })
  @ApiResponse({ status: 503, description: 'Demasiadas descargas simultáneas' })
  async descargarDocumentosZip(
    @Param('id', ParseObjectIdPipe) postulanteId: string,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // Plan y límites antes de cualquier cabecera: los errores salen como JSON normal.
    const plan = await this.expedienteZipService.planificar(postulanteId);
    const liberar = this.expedienteZipService.reservarTurno();
    try {
      await this.expedienteZipService.transmitir(plan, res, actor, req.ip);
    } finally {
      liberar();
    }
  }
}
