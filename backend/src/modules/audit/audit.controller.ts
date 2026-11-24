import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuditService, type AuditEventView } from './audit.service';
import { QueryAuditDto } from './dto/query-audit.dto';

@ApiTags('audit')
@ApiBearerAuth('access-token')
@Controller('audit')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('audit.view')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Listar eventos de auditoria com filtros e paginação [ADMIN]' })
  findAll(@Query() query: QueryAuditDto): Promise<PaginatedResponseDto<AuditEventView>> {
    return this.auditService.findAll(query);
  }
}
