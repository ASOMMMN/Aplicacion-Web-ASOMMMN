import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Query,
  Body,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';

import { EvalArchivosService } from './eval-archivos.service';
import {
  BuscarArchivosDto,
  CrearCarpetaDto,
  MoverArchivoDto,
  RenombrarArchivoDto,
} from './dto/eval-archivos.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/strategies/jwt.strategy';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('evaluador', 'administrador')
@Controller('eval-archivos/:postulanteId')
export class EvalArchivosController {
  constructor(private readonly service: EvalArchivosService) {}

  @Get()
  listar(
    @Param('postulanteId') postulanteId: string,
    @Query('parentId') parentId?: string,
  ) {
    return this.service.listar(postulanteId, parentId ?? null);
  }

  @Get('buscar')
  buscar(
    @Param('postulanteId') postulanteId: string,
    @Query() query: BuscarArchivosDto,
  ) {
    return this.service.buscar(postulanteId, query.q ?? '');
  }

  @Post('carpeta')
  crearCarpeta(
    @Param('postulanteId') postulanteId: string,
    @Body() dto: CrearCarpetaDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.crearCarpeta(
      postulanteId,
      dto.nombre,
      dto.parentId,
      actor,
    );
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  subirArchivo(
    @Param('postulanteId') postulanteId: string,
    @Query('parentId') parentId: string | undefined,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.subirArchivo(postulanteId, parentId, file, actor);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  eliminar(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.service.eliminar(id, actor);
  }

  @Patch(':id/mover')
  mover(
    @Param('id') id: string,
    @Body() dto: MoverArchivoDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.mover(id, dto.parentId, actor);
  }

  @Patch(':id/renombrar')
  renombrar(
    @Param('id') id: string,
    @Body() dto: RenombrarArchivoDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.renombrar(id, dto.nombre, actor);
  }

  @Get(':id/descargar')
  async descargar(
    @Param('postulanteId') postulanteId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const doc = await this.service.descargar(id, postulanteId);
    res.redirect(302, doc.url);
  }
}
