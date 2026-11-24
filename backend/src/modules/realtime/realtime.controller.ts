import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { RealtimeService } from './realtime.service';

/** Comentário a cada 25 s: proxies (nginx, Cloudflare) derrubam conexão parada por ~60–100 s. */
export const REALTIME_HEARTBEAT_MS = 25_000;

@ApiTags('realtime')
@ApiBearerAuth('access-token')
@Controller('realtime')
@UseGuards(JwtAuthGuard)
export class RealtimeController {
  constructor(private readonly realtimeService: RealtimeService) {}

  @Get('stream')
  @ApiOperation({ summary: 'Eventos em tempo real (Server-Sent Events) para as telas abertas' })
  stream(@CurrentUser() actor: JwtPayload, @Req() req: Request, @Res() res: Response): void {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // nginx não segura a resposta no buffer (senão o evento só chega quando o buffer enche).
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write(': conectado\n\n');

    const heartbeat = setInterval(() => res.write(': ping\n\n'), REALTIME_HEARTBEAT_MS);
    const id = this.realtimeService.add({
      actor,
      send: (event) => res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`),
      close: () => res.end(),
    });

    req.on('close', () => {
      clearInterval(heartbeat);
      this.realtimeService.remove(id);
    });
  }
}
