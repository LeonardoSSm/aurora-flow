import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { LopsAiService } from './lops-ai.service';
import type { LopsAiAgentsResponse } from './lops-ai.types';

@ApiTags('lops-ai')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('integrations/lops-ai')
export class LopsAiController {
  constructor(private readonly lopsAiService: LopsAiService) {}

  @Get('agents')
  @RequirePermission('flows.view')
  @ApiOperation({ summary: 'Listar os agentes disponíveis na LOPS IA (para o nó "LOPS IA" do fluxo)' })
  async listAgents(): Promise<LopsAiAgentsResponse> {
    return { agents: await this.lopsAiService.listAgents() };
  }
}
