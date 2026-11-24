import { Controller, Get, UseGuards } from '@nestjs/common';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { GoogleSheetsSyncService } from './google-sheets-sync.service';

type SyncHealthResponse = Awaited<ReturnType<GoogleSheetsSyncService['getSyncHealth']>>;

@Controller('admin/google-sync')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('system.maintenance')
export class GoogleSyncAdminController {
  constructor(private readonly syncService: GoogleSheetsSyncService) {}

  @Get('health')
  getSyncHealth(): Promise<SyncHealthResponse> {
    return this.syncService.getSyncHealth();
  }
}
