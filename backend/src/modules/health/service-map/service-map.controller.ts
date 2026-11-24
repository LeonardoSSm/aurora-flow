import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ServiceMapService } from './service-map.service';
import type { ServiceMapStatusResponse } from './service-map.types';

@ApiTags('admin')
@SkipThrottle()
@Controller('admin/service-map')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('observability.view_metrics')
export class ServiceMapController {
  constructor(private readonly serviceMap: ServiceMapService) {}

  @Get('status')
  @ApiOperation({ summary: 'Estado de cada container do docker-compose (Mapa de serviços do Admin)' })
  getStatus(): Promise<ServiceMapStatusResponse> {
    return this.serviceMap.getStatus();
  }
}
