import { Global, MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AdminMetricsController } from './admin-metrics.controller';
import { HttpMetricsMiddleware } from './http-metrics.middleware';
import { MetricsController } from './metrics.controller';
import { MetricsSummaryService } from './metrics-summary.service';
import { MetricsService } from './metrics.service';

@Global()
@Module({
  controllers: [MetricsController, AdminMetricsController],
  providers: [MetricsService, HttpMetricsMiddleware, MetricsSummaryService],
  exports: [MetricsService],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(HttpMetricsMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
