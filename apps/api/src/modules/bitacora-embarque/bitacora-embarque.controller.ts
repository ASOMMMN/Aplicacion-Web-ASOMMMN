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
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/strategies/jwt.strategy';
import { BitacoraEmbarqueService } from './bitacora-embarque.service';
import { CreateEmbarqueDto } from './dto/create-embarque.dto';
import { UpdateEmbarqueDto } from './dto/update-embarque.dto';
import { BitacoraEmbarqueListResponseDto } from './dto/embarque-response.dto';

@ApiTags('bitacora-embarque')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('bitacora-embarque')
export class BitacoraEmbarqueController {
  constructor(
    private readonly bitacoraEmbarqueService: BitacoraEmbarqueService,
  ) {}

  @Post()
  @Roles('postulante')
  @ApiOperation({ summary: 'Registrar un embarque en la bitácora propia' })
  async crearEmbarque(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateEmbarqueDto,
  ): Promise<{ message: string; embarqueId: string }> {
    return this.bitacoraEmbarqueService.crearEmbarque(
      user.userId,
      user.email,
      dto,
    );
  }

  @Get('mis-embarques')
  @Roles('postulante')
  @ApiOperation({ summary: 'Listar mi bitácora de embarque' })
  async misEmbarques(
    @CurrentUser() user: AuthUser,
  ): Promise<BitacoraEmbarqueListResponseDto> {
    return this.bitacoraEmbarqueService.listarMisEmbarques(user.userId);
  }

  @Get('postulante/:postulanteId')
  @Roles('evaluador', 'administrador')
  @ApiOperation({
    summary: 'Listar la bitácora de embarque de un postulante (solo lectura)',
  })
  async embarquesPorPostulante(
    @Param('postulanteId') postulanteId: string,
  ): Promise<BitacoraEmbarqueListResponseDto> {
    return this.bitacoraEmbarqueService.listarEmbarquesPorPostulante(
      postulanteId,
    );
  }

  @Get('postulante/:postulanteId/exportar-bitacora-doc')
  @Roles('evaluador', 'administrador')
  @ApiOperation({
    summary:
      'Exportar bitácora de embarque de un postulante a Word (.docx) o PDF',
  })
  async exportarBitacoraDoc(
    @Param('postulanteId') postulanteId: string,
    @Query('formato') formato: string = 'pdf',
    @Res() res: Response,
  ): Promise<void> {
    const fmt: 'docx' | 'pdf' = formato === 'docx' ? 'docx' : 'pdf';
    const { filename, buffer, mimeType } =
      await this.bitacoraEmbarqueService.exportarBitacoraDocPorPostulante(
        postulanteId,
        fmt,
      );
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.end(buffer);
  }

  @Patch(':embarqueId')
  @Roles('postulante')
  @ApiOperation({ summary: 'Editar un embarque propio' })
  async editarEmbarque(
    @CurrentUser() user: AuthUser,
    @Param('embarqueId') embarqueId: string,
    @Body() dto: UpdateEmbarqueDto,
  ): Promise<{ message: string }> {
    return this.bitacoraEmbarqueService.editarEmbarque(
      user.userId,
      user.email,
      embarqueId,
      dto,
    );
  }

  @Delete(':embarqueId')
  @Roles('postulante')
  @ApiOperation({ summary: 'Eliminar un embarque propio' })
  async eliminarEmbarque(
    @CurrentUser() user: AuthUser,
    @Param('embarqueId') embarqueId: string,
  ): Promise<{ message: string }> {
    return this.bitacoraEmbarqueService.eliminarEmbarque(
      user.userId,
      user.email,
      embarqueId,
    );
  }
}
