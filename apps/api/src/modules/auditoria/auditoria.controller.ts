import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';

import { AuditoriaService } from './auditoria.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ListarAuditoriaQueryDto } from './dto/listar-auditoria-query.dto';

@ApiTags('auditoria')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador')
@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly auditoriaService: AuditoriaService) {}

  @Get()
  @ApiOperation({ summary: 'Listar registros de auditoría (solo admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'actorEmail', required: false })
  @ApiQuery({ name: 'accion', required: false })
  @ApiQuery({ name: 'desde', required: false, description: 'Fecha inicio YYYY-MM-DD' })
  @ApiQuery({ name: 'hasta', required: false, description: 'Fecha fin YYYY-MM-DD' })
  listar(@Query() query: ListarAuditoriaQueryDto) {
    return this.auditoriaService.listar(query);
  }
}
