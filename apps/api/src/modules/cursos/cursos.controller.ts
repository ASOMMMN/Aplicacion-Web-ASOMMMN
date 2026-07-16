import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/strategies/jwt.strategy';
import { CursosService } from './cursos.service';
import { CreateCursoDto } from './dto/create-curso.dto';
import {
  CursosListResponseDto,
  ExtraerIaResponseDto,
} from './dto/curso-response.dto';

@ApiTags('cursos')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cursos')
export class CursosController {
  constructor(private readonly cursosService: CursosService) {}

  @Post('extraer-ia')
  @Roles('postulante')
  @UseInterceptors(
    FileInterceptor('archivo', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Extrae datos del PDF de un curso/certificado usando IA (no guarda nada)',
  })
  @ApiResponse({ status: 200, type: ExtraerIaResponseDto })
  async extraerIa(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ExtraerIaResponseDto> {
    if (!file) {
      return {
        nombreCurso: null,
        fechaInicio: null,
        fechaVencimiento: null,
        fechaEmision: null,
        confianza: {
          nombreCurso: 'baja',
          fechaInicio: 'baja',
          fechaVencimiento: 'baja',
        },
        iaDisponible: false,
        errorMensaje: 'No se recibió archivo.',
      };
    }
    return this.cursosService.extraerDatosCursoIa(file.buffer, user.userId);
  }

  @Post()
  @Roles('postulante')
  @UseInterceptors(FileInterceptor('documentoExtra'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Registrar curso/certificación. Si no aparece en CV, requiere documento extra.',
  })
  async crearCurso(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCursoDto,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<{ message: string; cursoId: string }> {
    return this.cursosService.crearCurso(user.userId, dto, file);
  }

  @Get('mis-cursos')
  @Roles('postulante')
  @ApiOperation({ summary: 'Listar mis cursos/certificaciones' })
  @ApiResponse({ status: 200, type: CursosListResponseDto })
  async misCursos(
    @CurrentUser() user: AuthUser,
  ): Promise<CursosListResponseDto> {
    return this.cursosService.listarMisCursos(user.userId);
  }

  @Get('postulante/:postulanteId')
  @Roles('evaluador', 'administrador')
  @ApiOperation({ summary: 'Listar cursos de un postulante (evaluador/admin)' })
  async cursosPorPostulante(
    @Param('postulanteId') postulanteId: string,
  ): Promise<CursosListResponseDto> {
    return this.cursosService.listarCursosPorPostulante(postulanteId);
  }

  @Delete(':cursoId')
  @Roles('postulante')
  @ApiOperation({ summary: 'Eliminar curso/certificación propio' })
  async eliminarCurso(
    @CurrentUser() user: AuthUser,
    @Param('cursoId') cursoId: string,
  ): Promise<{ message: string }> {
    return this.cursosService.eliminarCurso(user.userId, cursoId);
  }

  @Patch(':cursoId/renombrar')
  @Roles('postulante')
  @ApiOperation({
    summary: 'Renombrar el nombre visible de un curso/certificación',
  })
  async renombrarCurso(
    @CurrentUser() user: AuthUser,
    @Param('cursoId') cursoId: string,
    @Body('nombreCurso') nombreCurso: string,
  ): Promise<{ message: string }> {
    return this.cursosService.renombrarCurso(user.userId, cursoId, nombreCurso);
  }

  @Get('exportar-resumen')
  @Roles('postulante')
  @ApiOperation({ summary: 'Exportar resumen de cursos/certificaciones a CSV' })
  @ApiProduces('text/csv')
  async exportarResumen(
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ): Promise<void> {
    const { filename, csv } = await this.cursosService.exportarResumenCSV(
      user.userId,
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  @Get('exportar-resumen-txt')
  @Roles('postulante')
  @ApiOperation({ summary: 'Exportar resumen de cursos/certificaciones a TXT' })
  @ApiProduces('text/plain')
  async exportarResumenTXT(
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ): Promise<void> {
    const { filename, txt } = await this.cursosService.exportarResumenTXT(
      user.userId,
    );
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(txt);
  }

  @Get('postulante/:postulanteId/exportar-resumen')
  @Roles('evaluador', 'administrador')
  @ApiOperation({
    summary: 'Exportar resumen de cursos de un postulante a CSV',
  })
  @ApiProduces('text/csv')
  async exportarResumenPostulante(
    @Param('postulanteId') postulanteId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { filename, csv } =
      await this.cursosService.exportarResumenCSVPorPostulante(postulanteId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  @Get('postulante/:postulanteId/exportar-resumen-txt')
  @Roles('evaluador', 'administrador')
  @ApiOperation({
    summary: 'Exportar resumen de cursos de un postulante a TXT',
  })
  @ApiProduces('text/plain')
  async exportarResumenTXTPostulante(
    @Param('postulanteId') postulanteId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { filename, txt } =
      await this.cursosService.exportarResumenTXTPorPostulante(postulanteId);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(txt);
  }

  @Get('postulante/:postulanteId/exportar-resumen-doc')
  @Roles('evaluador', 'administrador')
  @ApiOperation({ summary: 'Exportar resumen de cursos a Word (.docx) o PDF' })
  async exportarResumenDoc(
    @Param('postulanteId') postulanteId: string,
    @Query('formato') formato: string = 'pdf',
    @Res() res: Response,
  ): Promise<void> {
    const fmt: 'docx' | 'pdf' = formato === 'docx' ? 'docx' : 'pdf';
    const { filename, buffer, mimeType } =
      await this.cursosService.exportarResumenDocPorPostulante(
        postulanteId,
        fmt,
      );
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.end(buffer);
  }
}
