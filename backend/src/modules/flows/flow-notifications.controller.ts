import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { ProcessAccessService } from '../access/process-access.service';
import { NotificationsService, type NotificationSummary } from '../notifications/notifications.service';
import { PreviewNotificationDto, QueryFlowNotificationsDto } from './dto/notification.dto';
import { FlowNotificationNodeExecutor } from './notification/flow-notification-node.executor';
import { toNotificationView, type NotificationMessageView } from './notification/notification.presenter';
import { FlowsService } from './flows.service';

/**
 * Notificações geradas pelos nós `action_notification` de um fluxo: prévia no editor, histórico por
 * fluxo/execução (com tentativas), cancelamento e reenvio.
 *
 * Autorização: ver exige `flows.view` **e** acesso ao fluxo; cancelar/reenviar exige
 * `flows.manage`. Conteúdo e endereços completos só para `flows.manage` — `flows.view` recebe
 * estados e erros, com endereços mascarados.
 */
@ApiTags('flows')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class FlowNotificationsController {
  constructor(
    private readonly flowsService: FlowsService,
    private readonly notificationsService: NotificationsService,
    private readonly nodeExecutor: FlowNotificationNodeExecutor,
    private readonly processAccess: ProcessAccessService,
    private readonly audit: AuditService,
  ) {}

  @Post('flows/notifications/preview')
  @RequirePermission('flows.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Prévia da mensagem do nó de notificação (valores de exemplo)' })
  preview(@Body() dto: PreviewNotificationDto): ReturnType<FlowNotificationNodeExecutor['preview']> {
    return this.nodeExecutor.preview(dto);
  }

  @Get('flows/:flowId/notifications')
  @RequirePermission('flows.view')
  @ApiOperation({ summary: 'Notificações geradas por um fluxo (opcionalmente de uma execução)' })
  async list(
    @Param('flowId', ParseUUIDPipe) flowId: string,
    @Query() query: QueryFlowNotificationsDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PaginatedResponseDto<NotificationMessageView>> {
    await this.flowsService.assertFlowAccess(flowId, user.sub, user.role, 'view');
    const canViewDetails = await this.canViewDetails(user);
    const { data, total } = await this.notificationsService.findMessages({
      flowId,
      flowExecutionId: query.executionId,
      status: query.status,
      page: query.page,
      limit: query.limit,
    });
    return PaginatedResponseDto.of(
      data.map((message) => toNotificationView(message, { canViewDetails })),
      total,
      query.page,
      query.limit,
    );
  }

  @Get('flows/:flowId/notifications/:notificationId')
  @RequirePermission('flows.view')
  @ApiOperation({ summary: 'Detalhe de uma notificação, com destinatários e tentativas' })
  async detail(
    @Param('flowId', ParseUUIDPipe) flowId: string,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<NotificationMessageView> {
    await this.flowsService.assertFlowAccess(flowId, user.sub, user.role, 'view');
    const message = await this.notificationsService.findMessageWithAttempts(notificationId);
    if (message?.flowId !== flowId) throw new NotFoundException('Notificação não encontrada.');
    return toNotificationView(message, { canViewDetails: await this.canViewDetails(user) });
  }

  @Post('flows/:flowId/notifications/:notificationId/cancel')
  @RequirePermission('flows.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar o que ainda não foi enviado (pendente/agendado)' })
  async cancel(
    @Param('flowId', ParseUUIDPipe) flowId: string,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ cancelled: number; summary: NotificationSummary }> {
    await this.assertOwnedByFlow(flowId, notificationId, user);
    const result = await this.notificationsService.cancel(notificationId);
    await this.audit.log({
      actorId: user.sub,
      module: 'flows',
      entity: 'notification',
      entityId: notificationId,
      action: 'cancelled',
      payload: { flowId, cancelled: result.cancelled },
    });
    return result;
  }

  @Post('flows/:flowId/notifications/:notificationId/retry')
  @RequirePermission('flows.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reenviar os destinatários que falharam por motivo recuperável' })
  async retry(
    @Param('flowId', ParseUUIDPipe) flowId: string,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ requeued: number; summary: NotificationSummary }> {
    await this.assertOwnedByFlow(flowId, notificationId, user);
    const result = await this.notificationsService.retryFailed(notificationId);
    await this.audit.log({
      actorId: user.sub,
      module: 'flows',
      entity: 'notification',
      entityId: notificationId,
      action: 'retried',
      payload: { flowId, requeued: result.requeued },
    });
    return result;
  }

  private async assertOwnedByFlow(
    flowId: string,
    notificationId: string,
    user: JwtPayload,
  ): Promise<void> {
    await this.flowsService.assertFlowAccess(flowId, user.sub, user.role, 'manage');
    const message = await this.notificationsService.findMessageWithAttempts(notificationId);
    if (message?.flowId !== flowId) throw new NotFoundException('Notificação não encontrada.');
  }

  private async canViewDetails(user: JwtPayload): Promise<boolean> {
    return this.processAccess.hasAnywhere(user, 'flows.manage');
  }
}
