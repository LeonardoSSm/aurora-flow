import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { validateEnv } from './config/validate-env';
import { entities } from './database/entities';
import { AreasModule } from './modules/areas/areas.module';
import { StorageModule } from './modules/storage/storage.module';
import { AuditModule } from './modules/audit/audit.module';
import { FlowsModule } from './modules/flows/flows.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { GoogleWorkspaceModule } from './modules/google-workspace/google-workspace.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { MetricsService } from './modules/observability/metrics.service';
import { AdminModule } from './modules/admin/admin.module';
import { ObservabilityModule } from './modules/observability/observability.module';
import { TypeOrmMetricsLogger } from './modules/observability/typeorm-metrics.logger';
import { RolesModule } from './modules/roles/roles.module';
import { SettingsModule } from './modules/settings/settings.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ErpModule } from './modules/integrations/erp/erp.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      ignoreEnvFile: false,
      expandVariables: true,
      validate: validateEnv,
    }),
    EventEmitterModule.forRoot({ wildcard: true, maxListeners: 20 }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProd = configService.get<string>('NODE_ENV', 'development') === 'production';
        return {
          pinoHttp: {
            level: isProd ? 'info' : 'debug',
            genReqId: () => randomUUID(),
            transport: isProd ? undefined : { target: 'pino-pretty' },
            redact: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers["set-cookie"]',
              'password',
              'passwordHash',
              '*.googleAccessToken',
              '*.googleRefreshToken',
              '*.apiKey',
              '*.signingSecret',
              '*.appToken',
              '*.userToken',
              '*.sessionToken',
            ],
            serializers: { req: (req: unknown) => req },
          },
        };
      },
    }),
    TypeOrmModule.forRootAsync({
      imports: [ObservabilityModule],
      inject: [ConfigService, MetricsService],
      useFactory: (configService: ConfigService, metricsService: MetricsService) => {
        const slowQueryThresholdMs = Number(
          configService.get<string>('DB_SLOW_QUERY_THRESHOLD_MS', '500'),
        );

        return {
          type: 'postgres',
          host: configService.getOrThrow<string>('DB_HOST'),
          port: Number(configService.getOrThrow<string>('DB_PORT')),
          username: configService.getOrThrow<string>('DB_USER'),
          password: configService.getOrThrow<string>('DB_PASSWORD'),
          database: configService.getOrThrow<string>('DB_NAME'),
          entities,
          synchronize: configService.getOrThrow<string>('DB_SYNC') === 'true',
          migrations: [`${__dirname}/database/migrations/*{.ts,.js}`],
          migrationsRun: configService.get<string>('DB_AUTO_MIGRATE') === 'true',
          logging: ['query', 'error', 'warn', 'schema', 'migration'],
          logger: new TypeOrmMetricsLogger(metricsService),
          maxQueryExecutionTime:
            Number.isFinite(slowQueryThresholdMs) && slowQueryThresholdMs > 0
              ? slowQueryThresholdMs
              : 500,
        };
      },
    }),
    StorageModule,
    AreasModule,
    UsersModule,
    AuthModule,
    IntegrationsModule,
    FlowsModule,
    GoogleWorkspaceModule,
    AuditModule,
    RolesModule,
    SettingsModule,
    HealthModule,
    NotificationsModule,
    ObservabilityModule,
    AdminModule,
    ErpModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
