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
  ConflictException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
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
import {
  POLITICAS,
  ProteccionFuerzaBrutaService,
} from './proteccion-fuerza-bruta.service';

/**
 * IP para los contadores de fuerza bruta: `req.ip`, que Express ya resuelve
 * con `trust proxy` (1 salto, el proxy de Render). No se usa el primer valor
 * de X-Forwarded-For porque lo controla el cliente y permitiría saltarse el
 * bloqueo por IP cambiando la cabecera.
 */
const ipCliente = (req: Request): string => req.ip ?? '';

const COOKIE_NAME = 'refresh_token';
const isProd = process.env.NODE_ENV === 'production';
// sameSite 'none' es necesario porque el frontend (Netlify) y el backend
// (Render) son dominios raíz distintos: con 'strict' o 'lax' el navegador
// no envía la cookie en las peticiones cross-site y /auth/refresh falla.
// 'none' exige secure:true (requiere HTTPS), por eso solo se activa en prod.
const COOKIE_OPTS = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? ('none' as const) : ('lax' as const),
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};
// Para borrarla hay que repetir secure y sameSite: en producción el navegador
// ignora un Set-Cookie cross-site sin "SameSite=None; Secure" y la cookie
// vieja seguía ahí ("Sesión expirada" en la siguiente visita).
const CLEAR_COOKIE_OPTS = {
  httpOnly: COOKIE_OPTS.httpOnly,
  secure: COOKIE_OPTS.secure,
  sameSite: COOKIE_OPTS.sameSite,
  path: COOKIE_OPTS.path,
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly fuerzaBruta: ProteccionFuerzaBrutaService,
  ) {}

  @Post('registro')
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @ApiOperation({ summary: 'Registrar postulante (auto-registro)' })
  @ApiResponse({
    status: 201,
    description: 'Cuenta creada. Puedes iniciar sesión.',
  })
  @ApiResponse({ status: 409, description: 'El correo ya está registrado.' })
  @ApiResponse({
    status: 429,
    description:
      'Bloqueo temporal: demasiados registros rechazados desde esta IP.',
  })
  async registro(@Body() dto: RegisterDto, @Req() req: Request) {
    const ip = ipCliente(req);
    // Cada 409 ("ya registrado") confirma que un correo existe: limitarlos
    // por IP frena la enumeración de cuentas.
    await this.fuerzaBruta.exigirSinBloqueo(
      [[POLITICAS.registroIp, ip]],
      (min) =>
        `Demasiados intentos de registro. Espera ${min} ${min === 1 ? 'minuto' : 'minutos'} e inténtalo de nuevo.`,
    );
    try {
      await this.authService.registrar(dto, ip);
    } catch (err) {
      if (err instanceof ConflictException) {
        await this.fuerzaBruta.registrar(POLITICAS.registroIp, ip);
      }
      throw err;
    }
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
  // S-01 (AUDITORIA.md): antes sin límite. Ahora, 10 peticiones/min por IP
  // y bloqueo temporal por cuenta (5 fallos) y por IP (20 fallos) en 15 min.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Iniciar sesión' })
  @ApiResponse({ status: 200, description: 'Access token + usuario.' })
  @ApiResponse({
    status: 429,
    description: 'Bloqueo temporal por intentos fallidos.',
  })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip ?? '';
    const ua = req.headers['user-agent'] ?? '';
    const result = await this.conBloqueoPorCuenta(dto.email, req, () =>
      this.authService.login(dto, ip, ua),
    );

    if (result.requiresPasswordChange) {
      res.clearCookie(COOKIE_NAME, CLEAR_COOKIE_OPTS);
      return result;
    }

    if (result.requiresMfa) {
      res.clearCookie(COOKIE_NAME, CLEAR_COOKIE_OPTS);
      return result;
    }

    res.cookie(COOKIE_NAME, result.refreshToken, COOKIE_OPTS);
    return result;
  }

  @Post('mfa/verificar-login')
  @HttpCode(200)
  @Throttle({ default: { limit: 8, ttl: 300_000 } })
  @ApiOperation({
    summary: 'Completar login MFA con TOTP o codigo de recuperacion',
  })
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
  @ApiOperation({
    summary: 'Iniciar setup MFA usando sesion temporal de login',
  })
  async iniciarSetupMfa(@Body() dto: IniciarSetupMfaDto) {
    return this.authService.iniciarSetupMfa(dto.tempSessionToken);
  }

  @Post('mfa/setup/activar')
  @HttpCode(200)
  @Throttle({ default: { limit: 8, ttl: 300_000 } })
  @ApiOperation({
    summary: 'Activar MFA y completar login inicial obligatorio',
  })
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
    return {
      accessToken: result.accessToken,
      rol: result.rol,
      requiresPrivacyConsent: result.requiresPrivacyConsent,
    };
  }

  // Sin JwtAuthGuard: con el access token vencido o perdido (p. ej. tras
  // recargar) el logout fallaba con 401 y la sesión quedaba abierta. El
  // refresh token se identifica por la cookie httpOnly: solo quien la tiene
  // puede revocarlo. Sin límite, para que cerrar sesión nunca dé 429.
  @Post('logout')
  @HttpCode(200)
  @SkipThrottle()
  @ApiOperation({ summary: 'Cerrar sesión (revoca refresh token actual)' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[COOKIE_NAME] as string | undefined;
    if (token) await this.authService.logout(token);
    res.clearCookie(COOKIE_NAME, CLEAR_COOKIE_OPTS);
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
    res.clearCookie(COOKIE_NAME, CLEAR_COOKIE_OPTS);
    return { message: 'Todas las sesiones cerradas.' };
  }

  @Post('recuperar-contrasena')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 600_000 } })
  @ApiOperation({
    summary: 'Solicitar enlace de recuperación de contraseña por correo',
  })
  async recuperarContrasena(@Body() dto: ForgotPasswordDto) {
    // Máximo 3 correos por destinatario y hora, aunque lleguen desde IPs
    // distintas (el @Throttle de arriba es por IP). Pasado el tope no se
    // envía nada, pero la respuesta es idéntica: no revela si el correo
    // existe ni si está en tope.
    const enTope =
      (await this.fuerzaBruta.segundosDeBloqueo([
        [POLITICAS.recuperacionCorreo, dto.email],
      ])) > 0;
    if (!enTope) {
      await this.fuerzaBruta.registrar(POLITICAS.recuperacionCorreo, dto.email);
      await this.authService.solicitarRecuperacion(dto.email);
    }
    return {
      message:
        'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.',
    };
  }

  @Post('restablecer-contrasena')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @ApiOperation({
    summary: 'Definir nueva contraseña usando el token del correo',
  })
  async restablecerContrasena(@Body() dto: ResetPasswordDto) {
    await this.authService.resetearPassword(dto.token, dto.nuevaPassword);
    return {
      message:
        'Contraseña actualizada correctamente. Ya puedes iniciar sesión.',
    };
  }

  @Post('cambiar-contrasena-obligatoria')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @ApiOperation({
    summary:
      'Cambiar contraseña temporal obligatoria para usuarios marcados por admin',
  })
  async cambiarContrasenaObligatoria(
    @Body() dto: ChangeRequiredPasswordDto,
    @Req() req: Request,
  ) {
    // Comprueba correo + contraseña temporal: es otro login y comparte el
    // contador de la cuenta (no se puede alternar endpoints para adivinar).
    await this.conBloqueoPorCuenta(dto.email, req, () =>
      this.authService.cambiarContrasenaObligatoria(dto),
    );
    return {
      message: 'Contraseña actualizada correctamente. Inicia sesión de nuevo.',
    };
  }

  /**
   * Bloqueo temporal por contraseña errónea (S-01):
   * - antes de verificar nada, 429 si la cuenta o la IP están bloqueadas
   *   (aunque esta vez la contraseña sea correcta);
   * - cada 401 suma un fallo a la cuenta y a la IP; cuentan también los
   *   correos que no existen, para que el bloqueo no revele cuáles existen;
   * - un acceso correcto limpia el contador de la cuenta (no el de la IP).
   */
  private async conBloqueoPorCuenta<T>(
    email: string,
    req: Request,
    accion: () => Promise<T>,
  ): Promise<T> {
    const ip = ipCliente(req);
    await this.fuerzaBruta.exigirSinBloqueo([
      [POLITICAS.cuenta, email],
      [POLITICAS.loginIp, ip],
    ]);
    let resultado: T;
    try {
      resultado = await accion();
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        await Promise.all([
          this.fuerzaBruta.registrar(POLITICAS.cuenta, email),
          this.fuerzaBruta.registrar(POLITICAS.loginIp, ip),
        ]);
      }
      throw err;
    }
    await this.fuerzaBruta.limpiar(POLITICAS.cuenta, email);
    return resultado;
  }
}
