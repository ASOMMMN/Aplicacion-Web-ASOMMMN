import {
  Controller,
  Post,
  Body,
  UseGuards,
  BadRequestException,
  HttpCode,
} from '@nestjs/common';
import { MFAService } from './mfa.service';
import { GenerateMFARecoveryCodesDto, DisableMFADto } from './dto/mfa.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/strategies/jwt.strategy';

@Controller('mfa')
export class MFAController {
  constructor(private readonly mfaService: MFAService) {}

  /**
   * Genera nuevos códigos de recuperación
   * POST /mfa/regenerate-recovery-codes
   */
  @Post('regenerate-recovery-codes')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async regenerateRecoveryCodes(
    @Body() dto: GenerateMFARecoveryCodesDto,
    @CurrentUser() user: AuthUser,
  ): Promise<{
    success: boolean;
    recoveryCodes: string[];
    message: string;
  }> {
    if (!dto.password) {
      throw new BadRequestException('Contraseña requerida.');
    }

    const recoveryCodes = await this.mfaService.generateAndSaveRecoveryCodes(
      user.userId,
    );

    return {
      success: true,
      recoveryCodes,
      message: 'Nuevos codigos de recuperacion generados',
    };
  }

  /**
   * Desactiva MFA
   * POST /mfa/disable
   */
  @Post('disable')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async disableMFA(
    @Body() dto: DisableMFADto,
    @CurrentUser() user: AuthUser,
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    if (!dto.password) {
      throw new BadRequestException('Contraseña requerida.');
    }

    await this.mfaService.disableMFA(user.userId);

    return {
      success: true,
      message: 'MFA desactivado',
    };
  }

  /**
   * Obtiene estado de MFA del usuario
   * POST /mfa/status
   */
  @Post('status')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async getMFAStatus(@CurrentUser() user: AuthUser): Promise<{
    email: string;
    mfaActivo: boolean;
    codigosRecuperacionDisponibles: number;
  }> {
    const mfaActivo = await this.mfaService.isMFAActive(user.userId);
    const codigosCount = await this.mfaService.getRecoveryCodeCount(user.userId);

    return {
      email: user.email,
      mfaActivo,
      codigosRecuperacionDisponibles: codigosCount,
    };
  }
}
