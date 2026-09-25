import {
  Controller,
  Get,
  Param,
} from '@nestjs/common';

import {
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import {
  ResumenFechasResponse,
  ResumenFechasService,
} from './resumen-fechas.service';

@ApiTags('Resumen de Fechas')
@Controller('resumen-fechas')
export class ResumenFechasController {
  constructor(
    private readonly resumenFechasService: ResumenFechasService,
  ) {}

  @Get('postulante/:postulanteId')
  @ApiOperation({
    summary:
      'Generar resumen de fechas mediante extracción IA',
  })
  @ApiResponse({
    status: 200,
    description:
      'Resumen generado correctamente.',
  })
  async generarResumen(
    @Param('postulanteId')
    postulanteId: string,
  ): Promise<ResumenFechasResponse> {
    return this.resumenFechasService.generarResumen(
      postulanteId,
    );
  }

  @Get(
    'postulante/:postulanteId/formateado',
  )
  @ApiOperation({
    summary:
      'Generar resumen de fechas formateado',
  })
  @ApiResponse({
    status: 200,
    description:
      'Resumen formateado correctamente.',
  })
  async generarResumenFormateado(
    @Param('postulanteId')
    postulanteId: string,
  ) {
    return this.resumenFechasService.generarResumenFormateado(
      postulanteId,
    );
  }
}