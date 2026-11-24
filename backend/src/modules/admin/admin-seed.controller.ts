import { Controller, GoneException, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('admin')
@Controller('admin/seed')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('system.maintenance')
export class AdminSeedController {
  @Post('demo')
  seedDemo(): never {
    throw new GoneException(
      'O seed de demonstração de formulários/processos foi desativado no Aurora Flow (ciclo 01).',
    );
  }
}
