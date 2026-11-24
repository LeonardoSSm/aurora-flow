import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { MetricsService } from './metrics.service';

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(private readonly metricsService: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    if (this.isMetricsRequest(req)) {
      next();
      return;
    }

    const method = req.method;
    const startedAt = process.hrtime.bigint();
    this.metricsService.incrementInFlight(method);

    res.on('finish', () => {
      const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
      this.metricsService.decrementInFlight(method);
      this.metricsService.observeHttpRequest(
        {
          method,
          route: this.resolveRoute(req),
          status_code: String(res.statusCode),
        },
        durationSeconds,
      );
    });

    next();
  }

  private isMetricsRequest(req: Request): boolean {
    return req.path === '/metrics' || req.path.endsWith('/metrics');
  }

  private resolveRoute(req: Request): string {
    const routePath = req.route?.path;
    if (typeof routePath === 'string') {
      return this.normalizeRoute(`${req.baseUrl ?? ''}${routePath}`);
    }
    if (Array.isArray(routePath) && typeof routePath[0] === 'string') {
      return this.normalizeRoute(`${req.baseUrl ?? ''}${routePath[0]}`);
    }
    return this.normalizeRoute(req.path || req.originalUrl || '/');
  }

  private normalizeRoute(route: string): string {
    const normalized = route
      .replace(/\/+/g, '/')
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, ':id')
      .replace(/\/\d+(?=\/|$)/g, '/:id')
      .replace(/\/$/, '');

    return normalized || '/';
  }
}
