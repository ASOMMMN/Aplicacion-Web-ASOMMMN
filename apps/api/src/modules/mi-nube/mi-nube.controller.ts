import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';

import { MiNubeService } from './mi-nube.service';
import {
  CrearCarpetaNubeDto,
  MoverDocumentoNubeDto,
  RenombrarDocumentoNubeDto,
} from './dto/mi-nube.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/strategies/jwt.strategy';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador', 'evaluador')
@Controller('mi-nube')
export class MiNubeController {
  constructor(private readonly service: MiNubeService) {}

  @Get()
  listar(@CurrentUser() actor: AuthUser, @Query('parentId') parentId?: string) {
    return this.service.listar(actor, parentId ?? null);
  }

  @Get('search')
  buscar(@CurrentUser() actor: AuthUser, @Query('q') q = '') {
    return this.service.buscar(actor, q);
  }

  @Post('folder')
  crearCarpeta(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CrearCarpetaNubeDto,
  ) {
    return this.service.crearCarpeta(actor, dto.nombre, dto.parentId);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  subirArchivo(
    @CurrentUser() actor: AuthUser,
    @Query('parentId') parentId: string | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.service.subirArchivo(actor, parentId, file);
  }

  @Get('download/:id')
  async descargar(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const archivo = await this.service.obtenerArchivo(actor, id);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(archivo.nombre)}"`,
    );
    res.setHeader('Content-Type', archivo.mimeType);
    res.setHeader('Content-Length', archivo.size);
    res.send(archivo.buffer);
  }

  @Get('view/:id')
  @Header('Cache-Control', 'private, max-age=60')
  async ver(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const archivo = await this.service.obtenerArchivo(actor, id);
    res.setHeader('Content-Type', archivo.mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(archivo.nombre)}"`,
    );
    res.setHeader('Content-Length', archivo.size);
    res.send(archivo.buffer);
  }

  @Patch(':id/rename')
  renombrar(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: RenombrarDocumentoNubeDto,
  ) {
    return this.service.renombrar(actor, id, dto.nombre);
  }

  @Patch(':id/move')
  mover(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: MoverDocumentoNubeDto,
  ) {
    return this.service.mover(actor, id, dto.parentId ?? null);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  eliminar(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.service.eliminar(actor, id);
  }
}
