import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { TokenGuard } from './auth/token.guard';
import { BancoExceptionFilter } from './banco-exception.filter';
import { APP_CONFIG, lerConfig } from './config/app-config';
import { validateEnv } from './config/validate-env';
import { MysqlService } from './db/mysql.service';
import { FontesRegistry } from './fontes/fontes.registry';
import { HealthController } from './health.controller';
import { LookupController } from './lookup.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv })],
  controllers: [HealthController, LookupController],
  providers: [
    { provide: APP_CONFIG, inject: [ConfigService], useFactory: lerConfig },
    { provide: APP_FILTER, useClass: BancoExceptionFilter },
    MysqlService,
    FontesRegistry,
    TokenGuard,
  ],
})
export class AppModule {}
