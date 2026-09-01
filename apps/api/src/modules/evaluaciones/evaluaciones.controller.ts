import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/strategies/jwt.strategy';
import { CrearEvaluacionDto } from './dto/crear-evaluacion.dto';
import { DecidirCandidatoDto } from './dto/decidir-candidato.dto';
import {
  CandidatoDetalleDto,
  CandidatoListaItemDto,
  EvaluacionDocumentoDto,
  EvaluacionGlobalItemDto,
  EvaluacionItemDto,
} from './dto/evaluaciones-response.dto';
import { EvaluacionesService } from './evaluaciones.service';

@ApiTags('evaluaciones')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('evaluaciones')
export class EvaluacionesController {
  private readonly logger = new Logger(EvaluacionesController.name);

  constructor(private readonly evaluacionesService: EvaluacionesService) {}

  @Get('todas')
  @Roles('administrador')
  @ApiOperation({ summary: 'Listar todas las evaluaciones (admin)' })
  @ApiResponse({ status: 200, type: [EvaluacionGlobalItemDto] })
  async listarTodas(): Promise<EvaluacionGlobalItemDto[]> {
    return this.evaluacionesService.listarTodas();
  }

  @Get('candidatos')
  @Roles('evaluador', 'administrador')
  @ApiOperation({ summary: 'Listar candidatos para evaluación' })
  @ApiResponse({ status: 200, type: [CandidatoListaItemDto] })
  async listarCandidatos(): Promise<CandidatoListaItemDto[]> {
    const resultado = await this.evaluacionesService.listarCandidatos();
    // TEMP debug — quitar una vez confirmado el fix de docsEvaluados/docsTotal.
    this.logger.debug(
      `[TEMP] listarCandidatos → ${resultado.length} candidatos, primero: ${JSON.stringify(
        resultado[0]
          ? {
              postulanteId: resultado[0].postulanteId,
              docsEvaluados: resultado[0].docsEvaluados,
              docsTotal: resultado[0].docsTotal,
              estadoEvaluacion: resultado[0].estadoEvaluacion,
            }
          : null,
      )}`,
    );
    return resultado;
  }

  @Get('candidatos/:id')
  @Roles('evaluador', 'administrador')
  @ApiOperation({ summary: 'Obtener detalle de un candidato' })
  @ApiResponse({ status: 200, type: CandidatoDetalleDto })
  async obtenerCandidato(
    @Param('id') id: string,
  ): Promise<CandidatoDetalleDto> {
    try {
      const resultado = await this.evaluacionesService.obtenerCandidato(id);
      // TEMP debug — quitar una vez confirmado el fix del bug "no encontrado".
      this.logger.debug(
        `[TEMP] obtenerCandidato(${id}) → ok, docsEvaluados=${resultado.docsEvaluados}/${resultado.docsTotal}`,
      );
      return resultado;
    } catch (err) {
      this.logger.warn(
        `[TEMP] obtenerCandidato(${id}) → falló: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  @Get('mis-comentarios')
  @Roles('postulante')
  @ApiOperation({
    summary: 'Listar comentarios de evaluación del postulante autenticado',
  })
  @ApiResponse({ status: 200, type: [EvaluacionItemDto] })
  async listarMisComentarios(
    @CurrentUser() user: AuthUser,
  ): Promise<EvaluacionItemDto[]> {
    return this.evaluacionesService.listarMisComentarios(user.userId);
  }

  @Get(':id/comentarios')
  @Roles('evaluador', 'administrador')
  @ApiOperation({ summary: 'Listar comentarios de evaluación de un candidato' })
  @ApiResponse({ status: 200, type: [EvaluacionItemDto] })
  async listarComentarios(
    @Param('id') id: string,
  ): Promise<EvaluacionItemDto[]> {
    return this.evaluacionesService.listarComentarios(id);
  }

  @Get(':id/documentos')
  @Roles('evaluador', 'administrador')
  @ApiOperation({
    summary: 'Listar evaluaciones agrupadas por documento del expediente',
  })
  @ApiResponse({ status: 200, type: [EvaluacionDocumentoDto] })
  async listarEvaluacionesPorDocumento(
    @Param('id') id: string,
  ): Promise<EvaluacionDocumentoDto[]> {
    return this.evaluacionesService.listarEvaluacionesPorDocumento(id);
  }

  @Post(':id/comentarios')
  @Roles('evaluador', 'administrador')
  @ApiOperation({
    summary: 'Evaluar un documento del expediente de un candidato',
  })
  @ApiResponse({ status: 201, type: EvaluacionItemDto })
  async evaluarDocumento(
    @Param('id') id: string,
    @Body() dto: CrearEvaluacionDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ): Promise<EvaluacionItemDto> {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip;
    return this.evaluacionesService.evaluarDocumento(id, user.userId, dto, ip);
  }

  @Post(':id/decision')
  @Roles('evaluador', 'administrador')
  @ApiOperation({
    summary:
      'Registrar la decisión final (aprobado/rechazado/en proceso) de un candidato',
  })
  @ApiResponse({ status: 201, type: CandidatoDetalleDto })
  async decidirCandidato(
    @Param('id') id: string,
    @Body() dto: DecidirCandidatoDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ): Promise<CandidatoDetalleDto> {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip;
    return this.evaluacionesService.decidirCandidato(id, user.userId, dto, ip);
  }
}
