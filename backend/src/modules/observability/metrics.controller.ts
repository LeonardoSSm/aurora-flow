import { timingSafeEqual } from 'crypto';
import { Controller, Get, Headers, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { MetricsService } from './metrics.service';

@ApiExcludeController()
@SkipThrottle()
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metricsService: MetricsService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  async getMetrics(
    @Headers('authorization') authHeader: string,
    @Res() res: Response,
  ): Promise<void> {
    const secret = this.configService.get<string>('METRICS_SECRET_TOKEN');
    if (secret) {
      const provided = authHeader?.replace(/^Bearer\s+/i, '').trim() ?? '';
      const secretBuf = Buffer.from(secret);
      const providedBuf = Buffer.from(provided);
      const valid =
        providedBuf.length === secretBuf.length && timingSafeEqual(providedBuf, secretBuf);
      if (!valid) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }
    }
    res.setHeader('Content-Type', this.metricsService.contentType);
    res.send(await this.metricsService.metrics());
  }
}
