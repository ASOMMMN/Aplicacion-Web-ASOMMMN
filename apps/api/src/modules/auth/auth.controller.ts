import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Req,
  Res,
  HttpCode,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';

import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangeRequiredPasswordDto } from './dto/change-required-password.dto';
import {
  ActivarMfaDto,
  IniciarSetupMfaDto,
  VerificarMfaLoginDto,
} from './dto/mfa-auth.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from './strategies/jwt.strategy';

const COOKIE_NAME = 'refresh_token';
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('registro')
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @ApiOperation({ summary: 'Registrar postulante (auto-registro)' })
  @ApiResponse({ status: 201, description: 'Cuenta creada. Puedes iniciar sesión.' })
  @ApiResponse({ status: 409, description: 'El correo ya está registrado.' })
  async registro(@Body() dto: RegisterDto) {
    await this.authService.registrar(dto);
    return { message: 'Cuenta creada. Puedes iniciar sesión de inmediato.' };
  }

  @Get('verificar-email')
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @ApiOperation({ summary: 'Verificar correo con token' })
  async verificarEmail(@Query('token') token: string) {
    await this.authService.verificarEmail(token);
    return { message: 'Correo verificado. Ya puedes iniciar sesión.' };
  }

  @Get('test-verificar-email')
  @ApiOperation({
    summary: '(TEST ONLY) Verificar email por correo - Eliminar en producción',
  })
  async testVerificarEmail(@Query('email') email: string) {
    // Endpoint solo para testing - ELIMINAR EN PRODUCCIÓN
    // Requiere NODE_ENV=development Y ENABLE_TEST_ENDPOINTS=true explícito,
    // para que un NODE_ENV mal configurado en producción no lo deje expuesto.
    if (
      process.env.NODE_ENV !== 'development' ||
      process.env.ENABLE_TEST_ENDPOINTS !== 'true'
    ) {
      throw new Error('No disponible');
    }
    await this.authService.verificarEmailPorEmail(email);
    return { message: 'Correo verificado para testing.' };
  }

  @Post('reenviar-verificacion')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 600_000 } })
  @ApiOperation({ summary: 'Reenviar correo de verificación' })
  async reenviarVerificacion(@Body() dto: ForgotPasswordDto) {
    await this.authService.reenviarVerificacion(dto.email);
    return {
      message: 'Si el correo existe y no está verificado, recibirás el enlace.',
    };
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @ApiOperation({ summary: 'Iniciar sesión' })
  @ApiResponse({ status: 200, description: 'Access token + usuario.' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip ?? '';
    const ua = req.headers['user-agent'] ?? '';
    const result = await this.authService.login(dto, ip, ua);

    if (result.requiresPasswordChange) {
      res.clearCookie(COOKIE_NAME, { path: '/' });
      return result;
    }

    if (result.requiresMfa) {
      res.clearCookie(COOKIE_NAME, { path: '/' });
      return result;
    }

    res.cookie(COOKIE_NAME, result.refreshToken, COOKIE_OPTS);
    return result;
  }

  @Post('mfa/verificar-login')
  @HttpCode(200)
  @Throttle({ default: { limit: 8, ttl: 300_000 } })
  @ApiOperation({ summary: 'Completar login MFA con TOTP o codigo de recuperacion' })
  async verificarMfaLogin(
    @Body() dto: VerificarMfaLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip ?? '';
    const ua = req.headers['user-agent'] ?? '';

    const result = await this.authService.verificarMfaLogin(
      dto.tempSessionToken,
      dto.codigo,
      dto.codigoRecuperacion,
      ip,
      ua,
    );

    res.cookie(COOKIE_NAME, result.refreshToken, COOKIE_OPTS);
    return result;
  }

  @Post('mfa/setup/iniciar')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @ApiOperation({ summary: 'Iniciar setup MFA usando sesion temporal de login' })
  async iniciarSetupMfa(@Body() dto: IniciarSetupMfaDto) {
    return this.authService.iniciarSetupMfa(dto.tempSessionToken);
  }

  @Post('mfa/setup/activar')
  @HttpCode(200)
  @Throttle({ default: { limit: 8, ttl: 300_000 } })
  @ApiOperation({ summary: 'Activar MFA y completar login inicial obligatorio' })
  async activarSetupMfa(
    @Body() dto: ActivarMfaDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip ?? '';
    const ua = req.headers['user-agent'] ?? '';

    const result = await this.authService.activarSetupMfa(
      dto.tempSessionToken,
      dto.codigo,
      ip,
      ua,
    );

    res.cookie(COOKIE_NAME, result.refreshToken, COOKIE_OPTS);
    return result;
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 300_000 } })
  @ApiOperation({ summary: 'Renovar access token (usa cookie httpOnly)' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const oldToken = req.cookies?.[COOKIE_NAME] as string | undefined;
    if (!oldToken) throw new UnauthorizedException('Sin refresh token');

    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip ?? '';
    const ua = req.headers['user-agent'] ?? '';
    const result = await this.authService.rotarRefreshToken(oldToken, ip, ua);

    res.cookie(COOKIE_NAME, result.refreshToken, COOKIE_OPTS);
    return { accessToken: result.accessToken };
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Cerrar sesión (revoca refresh token actual)' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[COOKIE_NAME] as string | undefined;
    if (token) await this.authService.logout(token);
    res.clearCookie(COOKIE_NAME, { path: '/' });
    return { message: 'Sesión cerrada.' };
  }

  @Post('logout-todos')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Cerrar todas las sesiones del usuario' })
  async logoutAll(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logoutAll(user.userId);
    res.clearCookie(COOKIE_NAME, { path: '/' });
    return { message: 'Todas las sesiones cerradas.' };
  }

  @Post('recuperar-contrasena')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 600_000 } })
  @ApiOperation({ summary: 'Solicitar enlace de recuperación de contraseña por correo' })
  async recuperarContrasena(@Body() dto: ForgotPasswordDto) {
    await this.authService.solicitarRecuperacion(dto.email);
    return {
      message:
        'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.',
    };
  }

  @Post('restablecer-contrasena')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @ApiOperation({ summary: 'Definir nueva contraseña usando el token del correo' })
  async restablecerContrasena(@Body() dto: ResetPasswordDto) {
    await this.authService.resetearPassword(dto.token, dto.nuevaPassword);
    return {
      message: 'Contraseña actualizada correctamente. Ya puedes iniciar sesión.',
    };
  }

  @Post('cambiar-contrasena-obligatoria')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @ApiOperation({
    summary:
      'Cambiar contraseña temporal obligatoria para usuarios marcados por admin',
  })
  async cambiarContrasenaObligatoria(@Body() dto: ChangeRequiredPasswordDto) {
    await this.authService.cambiarContrasenaObligatoria(dto);
    return {
      message: 'Contraseña actualizada correctamente. Inicia sesión de nuevo.',
    };
  }
}
