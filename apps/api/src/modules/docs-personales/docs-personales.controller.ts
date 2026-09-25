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

import {
  DocsPersonalesService,
  ExtraerDocPersonalIaResponse,
} from './docs-personales.service';

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

  // ── Postulante: extracción IA ─────────────────────────────────────────────

  @Post('extraer-ia')
  @Roles('postulante')
  @UseInterceptors(
    FileInterceptor('archivo', {
      storage: memoryStorage(),
      limits: {
        fileSize: 20 * 1024 * 1024,
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Postulante: analiza un documento personal mediante IA y extrae sus fechas',
    description:
      'Analiza un PDF, JPG o PNG y extrae únicamente las fechas que aparecen explícitamente en el documento. No guarda ni modifica el documento.',
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
          description: 'Tipo de documento personal',
        },
        archivo: {
          type: 'string',
          format: 'binary',
          description: 'Documento PDF, JPG o PNG',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Fechas extraídas correctamente mediante IA',
    schema: {
      type: 'object',
      properties: {
        fechaInicio: {
          type: 'string',
          nullable: true,
          example: '2026-01-15',
        },
        fechaVencimiento: {
          type: 'string',
          nullable: true,
          example: '2031-01-15',
        },
        fechaEmision: {
          type: 'string',
          nullable: true,
          example: '2026-01-15',
        },
        confianza: {
          type: 'object',
          properties: {
            fechaInicio: {
              type: 'string',
              enum: ['alta', 'media', 'baja'],
              example: 'alta',
            },
            fechaVencimiento: {
              type: 'string',
              enum: ['alta', 'media', 'baja'],
              example: 'alta',
            },
            fechaEmision: {
              type: 'string',
              enum: ['alta', 'media', 'baja'],
              example: 'alta',
            },
          },
        },
        iaDisponible: {
          type: 'boolean',
          example: true,
        },
        errorMensaje: {
          type: 'string',
          nullable: true,
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Archivo inexistente, tipo inválido o archivo no compatible',
  })
  async extraerIa(
    @Body() body: SubirDocPersonalDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ): Promise<ExtraerDocPersonalIaResponse> {
    if (!file) {
      return {
        fechaInicio: null,
        fechaVencimiento: null,
        fechaEmision: null,
        confianza: {
          fechaInicio: 'baja',
          fechaVencimiento: 'baja',
          fechaEmision: 'baja',
        },
        iaDisponible: false,
        errorMensaje: 'No se recibió ningún archivo.',
      };
    }

    return this.svc.extraerDatosDocPersonalIa(
      file.buffer,
      user.userId,
      body.tipo,
      file.mimetype,
    );
  }

  // ── Postulante: subir ──────────────────────────────────────────────────────

  @Post('subir')
  @Roles('postulante')
  @UseInterceptors(
    FileInterceptor('archivo', {
      storage: memoryStorage(),
      limits: {
        fileSize: 20 * 1024 * 1024,
      },
    }),
  )
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
        archivo: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    type: DocPersonalResponseDto,
  })
  subirDoc(
    @Body() body: SubirDocPersonalDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ): Promise<DocPersonalResponseDto> {
    return this.svc.subir(user, body.tipo, file);
  }

  // ── Postulante: listar propios ────────────────────────────────────────────

  @Get('mis-docs')
  @Roles('postulante')
  @ApiOperation({
    summary:
      'Postulante: lista sus documentos personales agrupados por tipo',
  })
  @ApiResponse({
    status: 200,
    type: MisDocsResponseDto,
  })
  misDocs(
    @CurrentUser() user: AuthUser,
  ): Promise<MisDocsResponseDto> {
    return this.svc.listarMios(user);
  }

  // ── Documento: URL de descarga ────────────────────────────────────────────

  @Get(':id/url')
  @Roles('postulante', 'evaluador', 'administrador')
  @ApiOperation({
    summary:
      'Obtiene la URL de descarga de un documento personal',
  })
  @ApiResponse({
    status: 200,
    type: DocPersonalResponseDto,
  })
  urlDescargar(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<DocPersonalResponseDto> {
    return this.svc.urlDescargar(user, id);
  }

  // ── Documento: eliminar ──────────────────────────────────────────────────

  @Delete(':id')
  @Roles('postulante', 'administrador')
  @ApiOperation({
    summary: 'Elimina un documento personal',
  })
  @ApiResponse({
    status: 200,
    description: 'Documento eliminado',
  })
  async eliminar(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ ok: boolean }> {
    await this.svc.eliminar(user, id);

    return {
      ok: true,
    };
  }

  // ── Documento: renombrar ─────────────────────────────────────────────────

  @Patch(':id/renombrar')
  @Roles('postulante')
  @ApiOperation({
    summary:
      'Postulante: renombra el nombre visible de un documento personal',
  })
  @ApiResponse({
    status: 200,
    description: 'Documento renombrado',
  })
  async renombrar(
    @Param('id') id: string,
    @Body() body: RenombrarDocPersonalDto,
    @CurrentUser() user: AuthUser,
  ): Promise<{ ok: boolean }> {
    await this.svc.renombrar(
      user,
      id,
      body.nombreOriginal,
    );

    return {
      ok: true,
    };
  }

  // ── Evaluador / Admin ─────────────────────────────────────────────────────

  @Get('postulante/:postulanteId')
  @Roles('evaluador', 'administrador')
  @ApiOperation({
    summary:
      'Evaluador/Admin: lista documentos personales de un postulante',
  })
  @ApiResponse({
    status: 200,
    type: MisDocsResponseDto,
  })
  listarPorPostulante(
    @Param('postulanteId') postulanteId: string,
  ): Promise<MisDocsResponseDto> {
    return this.svc.listarPorPostulante(postulanteId);
  }
}