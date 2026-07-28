import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { Request } from 'express';

import { UsuariosService } from './usuarios.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateEstadoDto } from './dto/update-estado.dto';
import { FindAllUsuariosQueryDto } from './dto/find-all-usuarios-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/strategies/jwt.strategy';

@ApiTags('usuarios')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Get()
  @Roles('administrador', 'evaluador')
  @ApiOperation({ summary: 'Listar usuarios (paginado)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'rol',
    required: false,
    enum: ['postulante', 'evaluador', 'administrador'],
  })
  findAll(@Query() query: FindAllUsuariosQueryDto) {
    return this.usuariosService.findAll(query);
  }

  @Post()
  @Roles('administrador')
  @ApiOperation({ summary: 'Crear evaluador o administrador (solo admin)' })
  create(@Body() dto: CreateUsuarioDto, @CurrentUser() user: AuthUser) {
    return this.usuariosService.crearUsuario(dto, user.userId);
  }

  @Get(':id')
  @Roles('administrador')
  @ApiOperation({ summary: 'Obtener usuario por ID' })
  findOne(@Param('id') id: string) {
    return this.usuariosService.findById(id);
  }

  @Patch(':id/estado')
  @Roles('administrador')
  @ApiOperation({ summary: 'Activar o bloquear usuario' })
  cambiarEstado(
    @Param('id') id: string,
    @Body() dto: UpdateEstadoDto,
    @CurrentUser() admin: AuthUser,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip;
    return this.usuariosService.cambiarEstado(id, dto.estado, admin, ip);
  }

  @Post(':id/restablecer-contrasena')
  @Roles('administrador')
  @ApiOperation({
    summary: 'Restablecer contraseña de un usuario (solo admin)',
  })
  @ApiResponse({
    status: 200,
    description:
      'Contraseña temporal generada (se devuelve una sola vez) y usuario marcado para cambio obligatorio.',
  })
  restablecerContrasena(
    @Param('id') id: string,
    @CurrentUser() admin: AuthUser,
    @Req() req: Request,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip;
    return this.usuariosService.restablecerContrasenaPorAdmin(id, admin, ip);
  }
}
