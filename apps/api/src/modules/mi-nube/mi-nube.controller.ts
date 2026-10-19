import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Logger,
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
import type { Readable } from 'node:stream';

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
import { corregirMojibakeLatin1 } from '../../common/utils/fix-mojibake.util';
import { construirContentDisposition } from '../../common/utils/content-disposition.util';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador', 'evaluador')
@Controller('mi-nube')
export class MiNubeController {
  private readonly logger = new Logger(MiNubeController.name);

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
    if (file) {
      file.originalname = corregirMojibakeLatin1(file.originalname);
    }
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
      construirContentDisposition('attachment', archivo.nombre),
    );
    res.setHeader('Content-Type', archivo.mimeType);
    res.setHeader('Content-Length', archivo.size);
    this.transmitir(archivo.stream, res);
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
      construirContentDisposition('inline', archivo.nombre),
    );
    res.setHeader('Content-Length', archivo.size);
    this.transmitir(archivo.stream, res);
  }

  /**
   * Streaming directo de S3 a la respuesta: nunca carga el archivo completo
   * en memoria del servidor. Si el stream de S3 falla a medio camino, o el
   * cliente cancela la descarga, se destruye el stream en vez de dejarlo
   * colgado.
   */
  private transmitir(stream: Readable, res: Response): void {
    stream.on('error', (err) => {
      this.logger.error(`Error al transmitir archivo de Mi Nube: ${err.message}`);
      if (!res.headersSent) res.sendStatus(HttpStatus.INTERNAL_SERVER_ERROR);
      else res.destroy();
    });
    res.on('close', () => {
      if (!stream.destroyed) stream.destroy();
    });
    stream.pipe(res);
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
