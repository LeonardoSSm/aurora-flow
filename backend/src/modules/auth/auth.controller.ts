import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  buildRefreshCookieOptions,
  REFRESH_COOKIE_NAME,
} from '../../common/helpers/refresh-cookie.helper';
import type { GoogleConnectionStatusResponse } from '../google-workspace/types/google-workspace.types';
import { GoogleWorkspaceService } from '../google-workspace/google-workspace.service';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AuthService, AuthTokens } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { RefreshTokenService } from './refresh-token.service';
import type { JwtPayload } from './types/jwt-payload.type';
import type { UserResponseDto } from '../users/dto/user-response.dto';
import { UserInviteService, type UserInviteView } from '../users/invite/user-invite.service';
import { AcceptInviteDto } from './dto/accept-invite.dto';

/** Cabeçalhos para uma rota com credencial na URL: nada de cache, indexação ou vazamento por Referer. */
function sealResponse(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    @InjectPinoLogger(AuthController.name) private readonly logger: PinoLogger,
    private readonly authService: AuthService,
    private readonly googleWorkspaceService: GoogleWorkspaceService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly userInviteService: UserInviteService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Autenticar com email e senha' })
  async login(
    @Body() payload: LoginDto,
    @Ip() ip: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokens> {
    const rawAgent = req.headers['user-agent'];
    const userAgent = typeof rawAgent === 'string' ? rawAgent.substring(0, 255) : null;
    const tokens = await this.authService.login(payload, ip ?? null, userAgent);
    this.setRefreshCookie(res, tokens.refreshToken);
    return tokens;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtRefreshGuard)
  @ApiOperation({ summary: 'Renovar access token usando refresh token' })
  async refresh(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokens> {
    const authHeader = req.headers.authorization;
    const cookies = req.cookies as Record<string, string> | undefined;
    const rawToken =
      (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : null) ??
      cookies?.['formhub_refresh'] ??
      (req.body as { refreshToken?: string } | undefined)?.refreshToken ??
      '';
    const rawAgent = req.headers['user-agent'];
    const userAgent = typeof rawAgent === 'string' ? rawAgent.substring(0, 255) : null;
    const tokens = await this.authService.refresh(rawToken, user, req.ip ?? null, userAgent);
    this.setRefreshCookie(res, tokens.refreshToken);
    return tokens;
  }

  @Post('password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Cadastrar ou trocar a senha local do usuário autenticado',
    description:
      'Usado pela tela de cadastro de senha exibida após o primeiro login com Google Workspace. ' +
      'Quando o usuário já possui senha, currentPassword é obrigatória.',
  })
  async setPassword(
    @CurrentUser() user: JwtPayload,
    @Body() payload: SetPasswordDto,
    @Ip() ip: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokens> {
    const rawAgent = req.headers['user-agent'];
    const userAgent = typeof rawAgent === 'string' ? rawAgent.substring(0, 255) : null;
    const tokens = await this.authService.setPassword(user.sub, payload, ip ?? null, userAgent);
    this.setRefreshCookie(res, tokens.refreshToken);
    return tokens;
  }

  @Get('invite/:token')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({
    summary: 'Consultar um convite de acesso (público) — nome e e-mail de quem foi convidado',
  })
  getInvite(
    @Param('token') token: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserInviteView> {
    sealResponse(res);
    return this.userInviteService.getForToken(token);
  }

  @Post('invite/:token')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({
    summary: 'Criar a senha pelo convite (público) e abrir a sessão — o link vale uma vez só',
  })
  async acceptInvite(
    @Param('token') token: string,
    @Body() payload: AcceptInviteDto,
    @Ip() ip: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthTokens> {
    sealResponse(res);
    const rawAgent = req.headers['user-agent'];
    const userAgent = typeof rawAgent === 'string' ? rawAgent.substring(0, 255) : null;
    const tokens = await this.authService.acceptInvite(token, payload.password, ip ?? null, userAgent);
    this.setRefreshCookie(res, tokens.refreshToken);
    return tokens;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Encerrar sessão e revogar refresh token' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    const cookies = req.cookies as Record<string, string> | undefined;
    // Web: cookie. App mobile: não tem cookie e manda o refresh token no corpo (como no /refresh).
    const bodyToken = (req.body as { refreshToken?: unknown } | undefined)?.refreshToken;
    const rawToken = cookies?.['formhub_refresh'] ?? (typeof bodyToken === 'string' ? bodyToken : undefined);
    if (rawToken) {
      await this.refreshTokenService.revokeByRawToken(rawToken);
    }
    res.clearCookie('formhub_refresh', { path: '/api/v1/auth' });
    return { message: 'Sessão encerrada com sucesso.' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Retorna dados do usuário autenticado' })
  me(@CurrentUser() user: JwtPayload): Promise<UserResponseDto> {
    return this.authService.me(user.sub);
  }

  @Get('google/login-url')
  @ApiOperation({ summary: 'Gerar URL de login com Google Workspace' })
  getGoogleLoginUrl(): { url: string } {
    return { url: this.googleWorkspaceService.buildLoginUrl() };
  }

  @Get('google/connect-url')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Gerar URL para conectar conta Google Workspace do usuário autenticado',
  })
  async getGoogleConnectUrl(
    @CurrentUser() user: JwtPayload,
    @Query('redirectPath') redirectPath?: string,
  ): Promise<{ url: string }> {
    return { url: await this.googleWorkspaceService.buildConnectUrl(user.sub, redirectPath) };
  }

  @Get('google/status')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Obter status da integração Google Workspace do usuário autenticado' })
  getGoogleStatus(@CurrentUser() user: JwtPayload): Promise<GoogleConnectionStatusResponse> {
    return this.googleWorkspaceService.getUserConnectionStatus(user.sub);
  }

  @Post('google/disconnect')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Desconectar conta Google Workspace do usuário autenticado' })
  disconnectGoogle(@CurrentUser() user: JwtPayload): Promise<GoogleConnectionStatusResponse> {
    return this.googleWorkspaceService.disconnectUserConnection(user.sub);
  }

  @Get('google/callback')
  @ApiOperation({ summary: 'Callback OAuth do Google Workspace' })
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!code || !state) {
      return res.redirect(
        this.googleWorkspaceService.buildFrontendErrorRedirect(
          '/login',
          'Não foi possível concluir a autenticação com Google.',
        ),
      );
    }

    try {
      const { redirectUrl, tokens } = await this.googleWorkspaceService.handleOAuthCallback(
        code,
        state,
      );

      if (tokens) {
        this.setRefreshCookie(res, tokens.refreshToken);
      }

      return res.redirect(redirectUrl);
    } catch (error) {
      this.logger.error({ err: error }, 'Falha no callback OAuth do Google Workspace');
      const message =
        error instanceof Error
          ? error.message
          : 'Não foi possível concluir a autenticação com Google.';

      return res.redirect(
        this.googleWorkspaceService.buildFrontendErrorRedirect('/login', message),
      );
    }
  }

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE_NAME, token, buildRefreshCookieOptions());
  }
}
