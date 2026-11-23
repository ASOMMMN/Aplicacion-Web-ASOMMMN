import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PermitirSinConsentimiento } from '../../common/decorators/permitir-sin-consentimiento.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../auth/strategies/jwt.strategy';
import { AceptarConsentimientoDto } from './dto/privacy-consent.dto';
import { PrivacidadService } from './privacidad.service';

/**
 * Consentimiento del aviso de privacidad para cuentas existentes (P-01).
 * El aviso en sí es una página pública de la web (/aviso-de-privacidad).
 */
@ApiTags('privacidad')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('postulante', 'evaluador', 'administrador')
@PermitirSinConsentimiento()
@Controller('privacidad/consentimiento')
export class PrivacidadController {
  constructor(private readonly svc: PrivacidadService) {}

  @Get()
  @ApiOperation({
    summary: 'Versión vigente del aviso y si el usuario ya la aceptó',
  })
  estado(@CurrentUser() user: AuthUser) {
    return this.svc.estado(user.userId);
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Registra la aceptación del aviso vigente (versión, fecha e IP del servidor)',
  })
  @ApiResponse({ status: 400, description: 'Versión distinta a la vigente.' })
  aceptar(
    // Solo se valida que la web mostró la versión vigente; lo que se guarda
    // lo decide el servidor.
    @Body() _dto: AceptarConsentimientoDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.svc.aceptar(user, req.ip);
  }
}
