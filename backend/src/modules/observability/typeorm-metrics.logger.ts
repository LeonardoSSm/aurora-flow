import { Logger } from '@nestjs/common';
import type { Logger as TypeOrmLogger, QueryRunner } from 'typeorm';
import type { MetricsService } from './metrics.service';

export class TypeOrmMetricsLogger implements TypeOrmLogger {
  private readonly logger = new Logger(TypeOrmMetricsLogger.name);

  constructor(private readonly metricsService: MetricsService) {}

  logQuery(query: string, _parameters?: unknown[], _queryRunner?: QueryRunner): void {
    this.metricsService.incrementDbQuery({ operation: this.resolveOperation(query) });
  }

  logQueryError(
    error: string | Error,
    query: string,
    _parameters?: unknown[],
    _queryRunner?: QueryRunner,
  ): void {
    const operation = this.resolveOperation(query);
    this.metricsService.incrementDbQueryError({ operation });
    this.logger.warn(`Database query failed (${operation}): ${this.errorMessage(error)}`);
  }

  logQuerySlow(
    time: number,
    query: string,
    _parameters?: unknown[],
    _queryRunner?: QueryRunner,
  ): void {
    const operation = this.resolveOperation(query);
    this.metricsService.observeDbSlowQuery({ operation }, time / 1000);
    this.logger.warn(`Slow database query (${operation}) took ${time}ms.`);
  }

  logSchemaBuild(message: string, _queryRunner?: QueryRunner): void {
    this.logger.log(message);
  }

  logMigration(message: string, _queryRunner?: QueryRunner): void {
    this.logger.log(message);
  }

  log(level: 'log' | 'info' | 'warn', message: unknown, _queryRunner?: QueryRunner): void {
    const formattedMessage =
      typeof message === 'string' ? message : (JSON.stringify(message) ?? String(message));
    if (level === 'warn') {
      this.logger.warn(formattedMessage);
      return;
    }
    this.logger.log(formattedMessage);
  }

  private resolveOperation(query: string): string {
    const match = query.trim().match(/^([a-z]+)/i);
    return match?.[1]?.toLowerCase() ?? 'unknown';
  }

  private errorMessage(error: string | Error): string {
    return error instanceof Error ? error.message : error;
  }
}
