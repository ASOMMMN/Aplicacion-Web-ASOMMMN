import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/strategies/jwt.strategy';
import { CrearEvaluacionDto } from './dto/crear-evaluacion.dto';
import { DecidirCandidatoDto } from './dto/decidir-candidato.dto';
import {
  CandidatoDetalleDto,
  CandidatosPaginadosDto,
  EvaluacionDocumentoDto,
  EvaluacionGlobalItemDto,
  EvaluacionItemDto,
  ResumenCandidatosDto,
} from './dto/evaluaciones-response.dto';
import {
  ExportarCandidatosQueryDto,
  ListarCandidatosQueryDto,
  ResumenCandidatosQueryDto,
} from './dto/listar-candidatos-query.dto';
import { EvaluacionesService } from './evaluaciones.service';

@ApiTags('evaluaciones')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('evaluaciones')
export class EvaluacionesController {
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
  @ApiResponse({ status: 200, type: CandidatosPaginadosDto })
  async listarCandidatos(
    @Query() query: ListarCandidatosQueryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<CandidatosPaginadosDto> {
    return this.evaluacionesService.listarCandidatos(query, user);
  }

  @Get('candidatos/resumen')
  @Roles('evaluador', 'administrador')
  @ApiOperation({
    summary: 'Conteos por estado para las tarjetas de resumen del panel',
  })
  @ApiResponse({ status: 200, type: ResumenCandidatosDto })
  async resumenCandidatos(
    @Query() query: ResumenCandidatosQueryDto,
  ): Promise<ResumenCandidatosDto> {
    return this.evaluacionesService.resumenCandidatos(query);
  }

  @Get('candidatos/exportar')
  @Roles('evaluador', 'administrador')
  @ApiOperation({
    summary: 'Exportar a CSV los candidatos que coinciden con los filtros',
  })
  async exportarCandidatosCSV(
    @Query() query: ExportarCandidatosQueryDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip;
    const { filename, csv } =
      await this.evaluacionesService.exportarCandidatosCSV(query, user, ip);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  @Get('candidatos/:id')
  @Roles('evaluador', 'administrador')
  @ApiOperation({ summary: 'Obtener detalle de un candidato' })
  @ApiResponse({ status: 200, type: CandidatoDetalleDto })
  async obtenerCandidato(
    @Param('id') id: string,
  ): Promise<CandidatoDetalleDto> {
    return this.evaluacionesService.obtenerCandidato(id);
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
