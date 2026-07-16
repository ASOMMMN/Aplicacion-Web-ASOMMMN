import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';

import { IngestIaService } from './ingest-ia.service';
import { ConfirmarExtraccionDto } from './dto/confirmar-extraccion.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/strategies/jwt.strategy';

@ApiTags('ingest-ia')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ingest-ia')
export class IngestIaController {
  constructor(private readonly ingestIaService: IngestIaService) {}

  @Post('procesar/:postulanteId')
  @HttpCode(202)
  @Roles('evaluador', 'administrador')
  @ApiOperation({
    summary: 'Iniciar extracción IA del CV de un postulante (asíncrono)',
  })
  @ApiResponse({
    status: 202,
    description:
      'Extracción iniciada. Consulta GET /ingest-ia/:postulanteId para ver el resultado.',
  })
  procesar(@Param('postulanteId') postulanteId: string) {
    return this.ingestIaService.procesar(postulanteId);
  }

  @Get(':postulanteId')
  @Roles('evaluador', 'administrador')
  @ApiOperation({ summary: 'Obtener última extracción IA de un postulante' })
  obtenerUltima(@Param('postulanteId') postulanteId: string) {
    return this.ingestIaService.obtenerUltima(postulanteId);
  }

  @Patch(':id/confirmar')
  @HttpCode(200)
  @Roles('evaluador', 'administrador')
  @ApiOperation({
    summary:
      'Confirmar (y opcionalmente editar) los datos extraídos por la IA',
  })
  confirmar(
    @Param('id') id: string,
    @Body() dto: ConfirmarExtraccionDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.ingestIaService.confirmar(
      id,
      dto.datosConfirmados ?? {},
      actor,
    );
  }

  @Patch(':id/rechazar')
  @HttpCode(200)
  @Roles('evaluador', 'administrador')
  @ApiOperation({ summary: 'Rechazar la propuesta de extracción IA' })
  rechazar(@Param('id') id: string) {
    return this.ingestIaService.rechazar(id);
  }
}
