import { Controller, Get, Injectable } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { HealthCheckResult, HealthIndicatorResult } from '@nestjs/terminus';
import {
  DiskHealthIndicator,
  HealthCheck,
  HealthCheckError,
  HealthCheckService,
  HealthIndicator,
  MemoryHealthIndicator,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { SEED_ADMIN_EMAIL } from '../../common/constants/product';
import { UsersService } from '../users/users.service';

/** Limites do GET /health — o Mapa de serviços usa os mesmos para marcar o backend como degradado. */
export const HEALTH_HEAP_LIMIT_BYTES = 300 * 1024 * 1024;
export const HEALTH_DISK_THRESHOLD_PERCENT = 0.9;

@Injectable()
export class AdminSeedIndicator extends HealthIndicator {
  constructor(private readonly usersService: UsersService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    // Precisa bater com o e-mail que UsersService.ensureSeedAdmin() usa pra criar/checar o
    // admin semente — senão /health/ready nunca fica pronto em ambiente nenhum. Já divergiu
    // uma vez (sobrou "admin@formhub.local" de antes do rebrand pra Tijuca Flow).
    if (process.env.NODE_ENV === 'production' && !process.env.SEED_ADMIN_PASSWORD?.trim()) {
      return this.getStatus(key, true);
    }
    const admin = await this.usersService._internalFindByEmail(SEED_ADMIN_EMAIL);
    const up = admin !== null;
    const result = this.getStatus(key, up);
    if (up) {
      return result;
    }
    throw new HealthCheckError('Admin seed not found', result);
  }
}

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly disk: DiskHealthIndicator,
    private readonly adminSeed: AdminSeedIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Verificar saude geral da aplicacao' })
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.memory.checkHeap('memory_heap', HEALTH_HEAP_LIMIT_BYTES),
      () =>
        this.disk.checkStorage('disk', {
          path: process.cwd(),
          thresholdPercent: HEALTH_DISK_THRESHOLD_PERCENT,
        }),
    ]);
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Verificar se a aplicacao esta pronta para receber trafego' })
  ready(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.adminSeed.isHealthy('admin_seed'),
    ]);
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe - retorna 200 se o processo esta ativo' })
  live(): { status: string } {
    return { status: 'ok' };
  }
}
