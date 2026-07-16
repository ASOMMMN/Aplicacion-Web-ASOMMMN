import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
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
import {
  CandidatoDetalleDto,
  CandidatoListaItemDto,
  EvaluacionGlobalItemDto,
  EvaluacionItemDto,
} from './dto/evaluaciones-response.dto';
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
  @ApiResponse({ status: 200, type: [CandidatoListaItemDto] })
  async listarCandidatos(): Promise<CandidatoListaItemDto[]> {
    return this.evaluacionesService.listarCandidatos();
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
  @ApiOperation({ summary: 'Listar comentarios de evaluación del postulante autenticado' })
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

  @Post(':id/comentarios')
  @Roles('evaluador', 'administrador')
  @ApiOperation({
    summary: 'Registrar comentario/evaluación para un candidato',
  })
  @ApiResponse({ status: 201, type: EvaluacionItemDto })
  async crearComentario(
    @Param('id') id: string,
    @Body() dto: CrearEvaluacionDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ): Promise<EvaluacionItemDto> {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip;
    return this.evaluacionesService.crearComentario(id, user.userId, dto, ip);
  }
}
