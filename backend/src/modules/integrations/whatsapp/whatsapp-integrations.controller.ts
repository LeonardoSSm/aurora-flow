import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import type { WhatsAppMessageEntity } from '../../../database/entities';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { QueryWhatsAppMessagesDto } from './dto/query-whatsapp-messages.dto';
import {
  WhatsAppConnectorService,
  type WhatsAppGroupsResponse,
  type WhatsAppIntegrationStatus,
} from './whatsapp-connector.service';

@ApiTags('integrations-whatsapp')
@ApiBearerAuth('access-token')
@Controller('integrations/whatsapp')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('integrations.manage_channels')
export class WhatsAppIntegrationsController {
  constructor(private readonly whatsappConnectorService: WhatsAppConnectorService) {}

  @Get('messages')
  @ApiOperation({ summary: 'Listar mensagens WhatsApp [ADMIN, MANAGER]' })
  listMessages(
    @Query() query: QueryWhatsAppMessagesDto,
  ): Promise<PaginatedResponseDto<WhatsAppMessageEntity>> {
    return this.whatsappConnectorService.listMessages(query);
  }

  /**
   * Grupos da instância para o destinatário do nó Notificação (WhatsApp). Quem monta fluxos
   * (`flows.manage`) precisa escolher o grupo sem ter acesso às integrações.
   */
  @Get('groups')
  @RequirePermission('flows.manage')
  @ApiOperation({ summary: 'Listar grupos do WhatsApp da instância configurada' })
  listGroups(): Promise<WhatsAppGroupsResponse> {
    return this.whatsappConnectorService.listGroups();
  }

  @Get('status')
  @ApiOperation({ summary: 'Consultar status da integração WhatsApp [ADMIN, MANAGER]' })
  getStatus(): Promise<WhatsAppIntegrationStatus> {
    return this.whatsappConnectorService.getStatus();
  }
}
