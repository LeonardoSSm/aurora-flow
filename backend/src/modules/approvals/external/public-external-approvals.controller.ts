import { Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { DecideExternalApprovalDto } from '../dto/decide-external-approval.dto';
import { ExternalApprovalsService, type ExternalApprovalView } from './external-approvals.service';

/** Cabeçalhos para uma página com credencial na URL: nada de cache, indexação ou vazamento por Referer. */
function sealResponse(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
}

/**
 * Aprovação por link pessoal. Rotas públicas (sem JWT): a autorização é o token da URL + a
 * confirmação do e-mail no corpo. Toda falha de token devolve o mesmo 404, sem distinguir causas.
 */
@ApiTags('public-approvals')
@Controller('public/approvals/external')
export class PublicExternalApprovalsController {
  constructor(private readonly externalApprovals: ExternalApprovalsService) {}

  @Get(':token')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'Consultar a aprovação de um link pessoal (público, somente leitura)' })
  getByToken(
    @Param('token') token: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ExternalApprovalView> {
    sealResponse(res);
    return this.externalApprovals.getForToken(token);
  }

  @Post(':token/decide')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Aprovar ou reprovar pelo link pessoal (público)' })
  decide(
    @Param('token') token: string,
    @Body() dto: DecideExternalApprovalDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ExternalApprovalView> {
    sealResponse(res);
    return this.externalApprovals.decide(token, dto, req.ip ?? null);
  }
}
