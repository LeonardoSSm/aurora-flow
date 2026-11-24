import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { buildAiOpenApi } from './ai-openapi';
import { CreateLopsAiSessionDto } from './dto/create-lops-ai-session.dto';
import { LopsAiApiKeyOnly, LopsAiAuthGuard } from './lops-ai-auth.guard';
import { LopsAiSessionService, type LopsAiSessionUser } from './lops-ai-session.service';

/**
 * Entrada da LOPS IA: o documento OpenAPI (só a chave), abrir a sessão pelo e-mail do Workspace
 * (só a chave) e conferir quem está na sessão.
 */
@Controller('ai')
@UseGuards(LopsAiAuthGuard, PermissionsGuard)
export class AiSessionController {
  constructor(
    private readonly sessions: LopsAiSessionService,
    private readonly configService: ConfigService,
  ) {}

  /** Para importar na LOPS IA como ferramentas — lido antes de qualquer sessão. */
  @Get('openapi.json')
  @LopsAiApiKeyOnly()
  openapi(@Req() request: Request): Record<string, unknown> {
    const prefix = this.configService.get<string>('API_PREFIX') ?? 'api';
    return buildAiOpenApi(`${request.protocol}://${request.get('host') ?? 'localhost'}/${prefix}/v1`);
  }

  @Post('session')
  @HttpCode(200)
  @LopsAiApiKeyOnly()
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  createSession(
    @Body() dto: CreateLopsAiSessionDto,
  ): Promise<{ token: string; expiresAt: string; user: LopsAiSessionUser }> {
    return this.sessions.createSession(dto.email);
  }

  @Get('me')
  @RequirePermission('ai.copilot.use')
  me(@CurrentUser() user: JwtPayload): Promise<LopsAiSessionUser> {
    return this.sessions.describeUserById(user.sub);
  }
}
