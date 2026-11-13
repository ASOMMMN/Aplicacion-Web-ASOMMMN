import {
  Body,
  Controller,
  Delete,
  Post,
  Get,
  Param,
  Patch,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiConsumes,
} from '@nestjs/swagger';

import { DocumentosService } from './documentos.service';
import {
  DocumentoActualResponseDto,
  HistorialDocumentosResponseDto,
  RenombrarDocumentoDto,
} from './dto/documento-response.dto';
import { Throttle } from '@nestjs/throttler';
import {
  MensajeTopeIa,
  UserThrottlerGuard,
} from '../../common/guards/user-throttler.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/strategies/jwt.strategy';
import { corregirMojibakeLatin1 } from '../../common/utils/fix-mojibake.util';

export const LIMITE_CV_BYTES = 20 * 1024 * 1024;

@ApiTags('documentos')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('documentos')
export class DocumentosController {
  constructor(private readonly documentosService: DocumentosService) {}

  @Post('subir')
  @Roles('postulante')
  @UseGuards(UserThrottlerGuard)
  // No llama a la IA: frena el abuso de almacenamiento (hasta 20 MB por CV).
  @Throttle({ ia: { limit: 20, ttl: 3_600_000 } }) // 20 subidas/hora por usuario
  @MensajeTopeIa(
    'Has subido demasiados CV en poco tiempo. Intenta de nuevo más tarde.',
  )
  @UseInterceptors(
    FileInterceptor('archivo', {
      storage: memoryStorage(),
      limits: { fileSize: LIMITE_CV_BYTES },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Subir un nuevo CV en PDF' })
  @ApiResponse({
    status: 201,
    description: 'CV subido exitosamente',
    type: DocumentoActualResponseDto,
  })
  async subirCV(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ): Promise<DocumentoActualResponseDto> {
    if (!file) {
      throw new BadRequestException('No se envió archivo');
    }
    file.originalname = corregirMojibakeLatin1(file.originalname);
    return this.documentosService.subirCV(user.userId, file);
  }

  @Get('mi-cv')
  @Roles('postulante')
  @ApiOperation({ summary: 'Obtener mi CV actual (postulante)' })
  @ApiResponse({
    status: 200,
    description: 'CV actual',
    type: DocumentoActualResponseDto,
  })
  async obtenerMiCV(
    @CurrentUser() user: AuthUser,
  ): Promise<DocumentoActualResponseDto | null> {
    return this.documentosService.obtenerCVActual(user.userId);
  }

  @Get('historial')
  @Roles('postulante')
  @ApiOperation({ summary: 'Obtener historial de todas las versiones del CV' })
  @ApiResponse({
    status: 200,
    description: 'Historial de documentos',
    type: HistorialDocumentosResponseDto,
  })
  async obtenerHistorial(
    @CurrentUser() user: AuthUser,
  ): Promise<HistorialDocumentosResponseDto> {
    return this.documentosService.obtenerHistorial(user.userId);
  }

  @Get(':id/descargar')
  @Roles('postulante', 'evaluador', 'administrador')
  @ApiOperation({ summary: 'Descargar un documento específico' })
  @ApiResponse({
    status: 200,
    description: 'URL prefirmada del documento',
    type: DocumentoActualResponseDto,
  })
  async descargarDocumento(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<DocumentoActualResponseDto> {
    return this.documentosService.descargarDocumento(id, user);
  }

  @Delete(':id')
  @Roles('postulante')
  @ApiOperation({ summary: 'Eliminar una versión del CV' })
  @ApiResponse({ status: 200, description: 'Documento eliminado' })
  async eliminarCV(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ message: string }> {
    return this.documentosService.eliminarCV(user.userId, id, user.email);
  }

  @Patch(':id/renombrar')
  @Roles('postulante')
  @ApiOperation({
    summary: 'Renombrar el nombre visible de una versión del CV',
  })
  @ApiResponse({ status: 200, description: 'Nombre actualizado' })
  async renombrarCV(
    @Param('id') id: string,
    @Body() body: RenombrarDocumentoDto,
    @CurrentUser() user: AuthUser,
  ): Promise<{ message: string }> {
    return this.documentosService.renombrarCV(
      user.userId,
      id,
      body.nombreOriginal,
      user.email,
    );
  }
}
