import { Controller, Get, Query, Res, VERSION_NEUTRAL, Version } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
  buildRefreshCookieOptions,
  REFRESH_COOKIE_NAME,
} from '../../common/helpers/refresh-cookie.helper';
import { GoogleWorkspaceService } from './google-workspace.service';

@ApiTags('google-workspace')
@Controller('integrations/google')
export class GoogleWorkspaceController {
  constructor(
    @InjectPinoLogger(GoogleWorkspaceController.name) private readonly logger: PinoLogger,
    private readonly googleWorkspaceService: GoogleWorkspaceService,
  ) {}

  @Get('callback')
  @Version(VERSION_NEUTRAL)
  @ApiOperation({ summary: 'Callback OAuth alternativo do Google Workspace' })
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!code || !state) {
      return res.redirect(
        this.googleWorkspaceService.buildFrontendErrorRedirect(
          '/login',
          'Nao foi possivel concluir a autenticacao com Google.',
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
      this.logger.error({ err: error }, 'Falha no callback alternativo OAuth do Google Workspace');
      const message =
        error instanceof Error
          ? error.message
          : 'Nao foi possivel concluir a autenticacao com Google.';

      return res.redirect(
        this.googleWorkspaceService.buildFrontendErrorRedirect('/login', message),
      );
    }
  }

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE_NAME, token, buildRefreshCookieOptions());
  }
}
