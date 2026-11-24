import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { UsersModule } from '../users/users.module';
import { AdminSeedIndicator, HealthController } from './health.controller';
import { ServiceMapController } from './service-map/service-map.controller';
import { ServiceMapProbe } from './service-map/service-map.probe';
import { ServiceMapService } from './service-map/service-map.service';

@Module({
  imports: [TerminusModule, UsersModule],
  controllers: [HealthController, ServiceMapController],
  providers: [AdminSeedIndicator, ServiceMapService, ServiceMapProbe],
})
export class HealthModule {}
