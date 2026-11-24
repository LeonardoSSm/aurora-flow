import { Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { GoogleAccessAuditService, type GoogleAccessAuditReport } from './google-access-audit.service';

/** Ferramenta de manutenção: confere e limpa autorizações Google com acesso além do necessário. */
@ApiTags('google-workspace')
@Controller('admin/google-access')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('system.maintenance')
export class GoogleAccessAdminController {
  constructor(private readonly auditService: GoogleAccessAuditService) {}

  @Get('audit')
  @ApiOperation({ summary: 'Audita os escopos Google concedidos a cada usuário (não altera nada)' })
  audit(): Promise<GoogleAccessAuditReport> {
    return this.auditService.run({ apply: false });
  }

  @Post('revoke-broad')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Desconecta e revoga no Google quem tem acesso além do necessário (exige reconectar)',
  })
  revokeBroad(): Promise<GoogleAccessAuditReport> {
    return this.auditService.run({ apply: true });
  }
}
