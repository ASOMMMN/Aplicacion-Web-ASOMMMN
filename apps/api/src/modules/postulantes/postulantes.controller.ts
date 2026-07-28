import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  Post,
  Delete,
  Query,
  UseInterceptors,
  UploadedFile,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiConsumes,
  ApiProduces,
} from '@nestjs/swagger';

import { PostulantesService } from './postulantes.service';
import { UpdatePerfilDto, GetPerfilResponseDto } from './dto/update-perfil.dto';
import { ExpedienteProgressDto } from './dto/expediente.dto';
import {
  CambiarCategoriaNubeItemDto,
  CrearCarpetaDto,
  ListarMiNubeQueryDto,
  MoverNubeItemDto,
  NubeItemResponseDto,
  NubeListadoResponseDto,
  RenombrarNubeItemDto,
  SubirDocumentoNubeDto,
} from './dto/nube.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/strategies/jwt.strategy';

@ApiTags('postulantes')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('postulantes')
export class PostulantesController {
  constructor(private readonly postulantesService: PostulantesService) {}

  @Get('mi-perfil')
  @Roles('postulante')
  @ApiOperation({ summary: 'Obtener mi perfil (postulante)' })
  @ApiResponse({
    status: 200,
    description: 'Perfil del postulante',
    type: GetPerfilResponseDto,
  })
  async obtenerMiPerfil(
    @CurrentUser() user: AuthUser,
  ): Promise<GetPerfilResponseDto> {
    return this.postulantesService.obtenerPerfil(user.userId);
  }

  @Patch('mi-perfil')
  @Roles('postulante')
  @ApiOperation({ summary: 'Actualizar mi perfil (postulante)' })
  @ApiResponse({
    status: 200,
    description: 'Perfil actualizado',
    type: GetPerfilResponseDto,
  })
  async actualizarMiPerfil(
    @Body() dto: UpdatePerfilDto,
    @CurrentUser() user: AuthUser,
  ): Promise<GetPerfilResponseDto> {
    return this.postulantesService.actualizarPerfil(user.userId, dto);
  }

  @Get('mi-expediente')
  @Roles('postulante')
  @ApiOperation({ summary: 'Progreso del expediente del postulante autenticado' })
  @ApiResponse({ status: 200, type: ExpedienteProgressDto })
  async miExpediente(
    @CurrentUser() user: AuthUser,
  ): Promise<ExpedienteProgressDto> {
    return this.postulantesService.calcularProgreso(user.userId);
  }

  @Post('finalizar-postulacion')
  @Roles('postulante')
  @ApiOperation({ summary: 'Finalizar y enviar postulación (requiere expediente 100%)' })
  @ApiResponse({ status: 200, type: ExpedienteProgressDto })
  async finalizarPostulacion(
    @CurrentUser() user: AuthUser,
  ): Promise<ExpedienteProgressDto> {
    return this.postulantesService.finalizarPostulacion(user.userId, user);
  }

  @Post('recordatorios-semanales/forzar')
  @Roles('administrador')
  @ApiOperation({
    summary:
      'Forzar el envío del recordatorio semanal de documentos pendientes (uso manual/pruebas, sin esperar al cron del lunes)',
  })
  async forzarRecordatoriosSemanales(): Promise<{ enviados: number }> {
    return this.postulantesService.enviarRecordatoriosSemanales();
  }

  @Get(':id')
  @Roles('administrador', 'evaluador')
  @ApiOperation({
    summary: 'Obtener perfil de un postulante (admin/evaluador)',
  })
  @ApiResponse({
    status: 200,
    description: 'Perfil del postulante',
    type: GetPerfilResponseDto,
  })
  async obtenerPostulante(
    @Param('id') id: string,
  ): Promise<GetPerfilResponseDto> {
    return this.postulantesService.obtenerPerfilPor(id);
  }

  @Get('mi-nube')
  @Roles('evaluador')
  @ApiOperation({ summary: 'Listar nube documental de evaluador (archivos de postulantes)' })
  @ApiResponse({ status: 200, type: NubeListadoResponseDto })
  async listarMiNube(
    @CurrentUser() user: AuthUser,
    @Query() query: ListarMiNubeQueryDto,
  ): Promise<NubeListadoResponseDto> {
    return this.postulantesService.listarMiNube(
      user.userId,
      query.parentId,
      query.categoria,
    );
  }

  @Post('mi-nube/carpeta')
  @Roles('evaluador')
  @ApiOperation({ summary: 'Crear carpeta/subcarpeta en nube de evaluador' })
  @ApiResponse({ status: 201, type: NubeItemResponseDto })
  async crearCarpeta(
    @CurrentUser() user: AuthUser,
    @Body() dto: CrearCarpetaDto,
  ): Promise<NubeItemResponseDto> {
    return this.postulantesService.crearCarpetaNube(user.userId, dto);
  }

  @Post('mi-nube/subir')
  @Roles('evaluador')
  @UseInterceptors(FileInterceptor('archivo'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Subir documento a nube de evaluador' })
  @ApiResponse({ status: 201, type: NubeItemResponseDto })
  async subirArchivo(
    @CurrentUser() user: AuthUser,
    @Body() dto: SubirDocumentoNubeDto,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<NubeItemResponseDto> {
    return this.postulantesService.subirDocumentoNube(user.userId, dto, file);
  }

  @Patch('mi-nube/:itemId/renombrar')
  @Roles('evaluador')
  @ApiOperation({ summary: 'Renombrar archivo/carpeta en nube de evaluador' })
  async renombrarItem(
    @CurrentUser() user: AuthUser,
    @Param('itemId') itemId: string,
    @Body() dto: RenombrarNubeItemDto,
  ): Promise<NubeItemResponseDto> {
    return this.postulantesService.renombrarItemNube(user.userId, itemId, dto);
  }

  @Patch('mi-nube/:itemId/mover')
  @Roles('evaluador')
  @ApiOperation({ summary: 'Mover archivo/carpeta en nube de evaluador' })
  async moverItem(
    @CurrentUser() user: AuthUser,
    @Param('itemId') itemId: string,
    @Body() dto: MoverNubeItemDto,
  ): Promise<NubeItemResponseDto> {
    return this.postulantesService.moverItemNube(user.userId, itemId, dto);
  }

  @Patch('mi-nube/:itemId/categoria')
  @Roles('evaluador')
  @ApiOperation({ summary: 'Cambiar categoría de archivo en nube de evaluador' })
  async cambiarCategoria(
    @CurrentUser() user: AuthUser,
    @Param('itemId') itemId: string,
    @Body() dto: CambiarCategoriaNubeItemDto,
  ): Promise<NubeItemResponseDto> {
    return this.postulantesService.cambiarCategoriaItemNube(user.userId, itemId, dto);
  }

  @Delete('mi-nube/:itemId')
  @Roles('evaluador')
  @ApiOperation({ summary: 'Eliminar archivo/carpeta en nube de evaluador' })
  async eliminarItem(
    @CurrentUser() user: AuthUser,
    @Param('itemId') itemId: string,
  ): Promise<{ message: string }> {
    return this.postulantesService.eliminarItemNube(user.userId, itemId);
  }

  @Get('mi-nube/:itemId/descargar')
  @Roles('evaluador')
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Descargar archivo de nube de evaluador' })
  async descargarItem(
    @CurrentUser() user: AuthUser,
    @Param('itemId') itemId: string,
    @Res() res: Response,
  ): Promise<void> {
    const doc = await this.postulantesService.resolverDescargaNube(user.userId, itemId);
    res.download(doc.path, doc.nombre);
  }

  @Get(':id/nube')
  @Roles('administrador', 'evaluador')
  @ApiOperation({ summary: 'Listar nube documental de un postulante' })
  @ApiResponse({ status: 200, type: NubeListadoResponseDto })
  async listarNubePostulante(
    @Param('id') id: string,
  ): Promise<NubeListadoResponseDto> {
    return this.postulantesService.listarNubePorPostulante(id);
  }

  @Get(':id/nube/:itemId/descargar')
  @Roles('administrador', 'evaluador')
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Descargar documento de la nube de un postulante' })
  async descargarNubePostulante(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Res() res: Response,
  ): Promise<void> {
    const doc = await this.postulantesService.resolverDescargaNubeEvaluador(id, itemId);
    res.download(doc.path, doc.nombre);
  }
}
