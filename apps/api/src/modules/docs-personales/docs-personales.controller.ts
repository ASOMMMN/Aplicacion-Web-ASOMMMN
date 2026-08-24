import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/strategies/jwt.strategy';

import { DocsPersonalesService } from './docs-personales.service';
import {
  SubirDocPersonalDto,
  DocPersonalResponseDto,
  MisDocsResponseDto,
  RenombrarDocPersonalDto,
} from './dto/doc-personal.dto';

@ApiTags('docs-personales')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('docs-personales')
export class DocsPersonalesController {
  constructor(private readonly svc: DocsPersonalesService) {}

  // ── Postulante ─────────────────────────────────────────────────────────────

  @Post('subir')
  @Roles('postulante')
  @UseInterceptors(FileInterceptor('archivo', { storage: memoryStorage() }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Postulante: sube un archivo de documento personal',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['archivo', 'tipo'],
      properties: {
        tipo: {
          type: 'string',
          enum: [
            'CURP',
            'INE',
            'acta_nacimiento',
            'visa',
            'pasaporte',
            'vacuna_fiebre_amarilla',
            'constancia_participacion',
            'certificado_medico',
            'libreta_identidad_maritima',
            'certificado_competencia',
          ],
        },
        archivo: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 201, type: DocPersonalResponseDto })
  subirDoc(
    @Body() body: SubirDocPersonalDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ): Promise<DocPersonalResponseDto> {
    return this.svc.subir(user, body.tipo, file);
  }

  @Get('mis-docs')
  @Roles('postulante')
  @ApiOperation({
    summary: 'Postulante: lista sus documentos personales agrupados por tipo',
  })
  @ApiResponse({ status: 200, type: MisDocsResponseDto })
  misDocs(@CurrentUser() user: AuthUser): Promise<MisDocsResponseDto> {
    return this.svc.listarMios(user);
  }

  @Get(':id/url')
  @Roles('postulante', 'evaluador', 'administrador')
  @ApiOperation({
    summary: 'Obtiene la URL de descarga de un documento personal',
  })
  @ApiResponse({ status: 200, type: DocPersonalResponseDto })
  urlDescargar(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<DocPersonalResponseDto> {
    return this.svc.urlDescargar(user, id);
  }

  @Delete(':id')
  @Roles('postulante', 'administrador')
  @ApiOperation({ summary: 'Elimina un documento personal' })
  @ApiResponse({ status: 200, description: 'Documento eliminado' })
  async eliminar(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ ok: boolean }> {
    await this.svc.eliminar(user, id);
    return { ok: true };
  }

  @Patch(':id/renombrar')
  @Roles('postulante')
  @ApiOperation({
    summary: 'Postulante: renombra el nombre visible de un documento personal',
  })
  @ApiResponse({ status: 200, description: 'Documento renombrado' })
  async renombrar(
    @Param('id') id: string,
    @Body() body: RenombrarDocPersonalDto,
    @CurrentUser() user: AuthUser,
  ): Promise<{ ok: boolean }> {
    await this.svc.renombrar(user, id, body.nombreOriginal);
    return { ok: true };
  }

  // ── Evaluador / Admin ──────────────────────────────────────────────────────

  @Get('postulante/:postulanteId')
  @Roles('evaluador', 'administrador')
  @ApiOperation({
    summary: 'Evaluador/Admin: lista documentos personales de un postulante',
  })
  @ApiResponse({ status: 200, type: MisDocsResponseDto })
  listarPorPostulante(
    @Param('postulanteId') postulanteId: string,
  ): Promise<MisDocsResponseDto> {
    return this.svc.listarPorPostulante(postulanteId);
  }
}
