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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/strategies/jwt.strategy';

@ApiTags('documentos')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('documentos')
export class DocumentosController {
  constructor(private readonly documentosService: DocumentosService) {}

  @Post('subir')
  @Roles('postulante')
  @UseInterceptors(FileInterceptor('archivo'))
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
    return this.documentosService.descargarDocumento(id, user.userId);
  }

  @Delete(':id')
  @Roles('postulante')
  @ApiOperation({ summary: 'Eliminar una versión del CV' })
  @ApiResponse({ status: 200, description: 'Documento eliminado' })
  async eliminarCV(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ message: string }> {
    return this.documentosService.eliminarCV(user.userId, id);
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
    );
  }
}
