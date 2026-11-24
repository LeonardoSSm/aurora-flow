import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { InboundWebhookEventEntity, WebhookDeliveryEntity } from '../../database/entities';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import {
  InboundWebhookService,
  type InboundListInput,
  type WebhookEndpointResponse,
} from './inbound-webhook.service';
import { OutboundWebhookService } from './outbound-webhook.service';
import { CreateWebhookEndpointDto } from './dto/create-webhook-endpoint.dto';
import { QueryWebhookDeliveriesDto } from './dto/query-webhook-deliveries.dto';
import { QueryWebhookEventsDto } from './dto/query-webhook-events.dto';

type RawBodyRequest = Request & { rawBody?: Buffer };

/** Arquivo da rota de lista: 1 MB cabe dezenas de milhares de números de pedido. */
const MAX_LIST_FILE_BYTES = 1024 * 1024;
type IncomingHeaders = Record<string, string | string[] | undefined>;

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly inboundWebhookService: InboundWebhookService,
    private readonly outboundWebhookService: OutboundWebhookService,
  ) {}

  @Post('in/:token')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  @ApiOperation({ summary: 'Receber webhook externo por token público' })
  async receiveInbound(
    @Param('token') token: string,
    @Headers() headers: IncomingHeaders,
    @Req() req: RawBodyRequest,
  ): Promise<{ received: true; eventId: string }> {
    const event = await this.inboundWebhookService.receiveWebhook(
      token,
      headers,
      this.getRawBody(req),
    );
    return { received: true, eventId: event.id };
  }

  @Post('in/:token/list')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_LIST_FILE_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data', 'text/plain', 'text/csv', 'application/json')
  @ApiOperation({
    summary:
      'Receber uma lista (ex.: números de pedido) por token público: arquivo .txt/.csv no campo "file", texto no corpo ou JSON. Os fluxos recebem { itens: [...] }.',
  })
  async receiveInboundList(
    @Param('token') token: string,
    @Headers() headers: IncomingHeaders,
    @Req() req: RawBodyRequest,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<{ received: true; eventId: string; itens: number }> {
    const { event, items } = await this.inboundWebhookService.receiveList(
      token,
      headers,
      this.toListInput(req, file),
    );
    return { received: true, eventId: event.id, itens: items };
  }

  @Get('endpoints')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('integrations.manage_channels')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Listar endpoints de webhooks [ADMIN, MANAGER]' })
  listEndpoints(@CurrentUser() currentUser: JwtPayload): Promise<WebhookEndpointResponse[]> {
    return this.inboundWebhookService.listEndpoints(currentUser);
  }

  @Post('endpoints')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('integrations.manage_channels')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Criar endpoint de webhook [ADMIN, MANAGER]' })
  createEndpoint(
    @Body() dto: CreateWebhookEndpointDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<WebhookEndpointResponse> {
    return this.inboundWebhookService.createEndpoint(dto, currentUser);
  }

  @Delete('endpoints/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('integrations.manage_channels')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Desativar endpoint de webhook [ADMIN, MANAGER]' })
  deactivateEndpoint(
    @Param('id') id: string,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<void> {
    return this.inboundWebhookService.deactivateEndpoint(id, currentUser);
  }

  @Get('deliveries')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('integrations.manage_channels')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Listar entregas de webhooks de saída [ADMIN, MANAGER]' })
  listDeliveries(
    @Query() query: QueryWebhookDeliveriesDto,
  ): Promise<PaginatedResponseDto<WebhookDeliveryEntity>> {
    return this.inboundWebhookService.listDeliveries(query);
  }

  @Post('deliveries/:id/retry')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('integrations.manage_channels')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Reprocessar entrega de webhook [ADMIN, MANAGER]' })
  retryDelivery(@Param('id') id: string): Promise<WebhookDeliveryEntity> {
    return this.outboundWebhookService.retry(id);
  }

  @Get('events')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('integrations.manage_channels')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Listar eventos de webhooks de entrada [ADMIN, MANAGER]' })
  listEvents(
    @Query() query: QueryWebhookEventsDto,
  ): Promise<PaginatedResponseDto<InboundWebhookEventEntity>> {
    return this.inboundWebhookService.listEvents(query);
  }

  /**
   * O que a rota de lista aceita: arquivo (multipart, campo `file`), texto puro (`text/plain` ou
   * `text/csv`) ou JSON — uma lista (`["123","456"]`), `{ "conteudo": "123\n456" }` ou um objeto
   * com uma lista dentro (`{ "pedidos": [...] }`).
   */
  private toListInput(req: RawBodyRequest, file: Express.Multer.File | undefined): InboundListInput {
    if (file) {
      // Byte zero não existe em texto: é planilha do Excel, PDF ou outro binário.
      if (file.buffer.includes(0)) {
        throw new BadRequestException('O arquivo precisa ser texto (.txt ou .csv), com um valor por linha.');
      }
      return { rawBody: file.buffer.toString('utf8'), source: 'arquivo', fileName: file.originalname };
    }

    const body: unknown = req.body;
    if (typeof body === 'string') return { rawBody: body, source: 'texto' };
    if (Array.isArray(body)) return { rawBody: this.getRawBody(req), values: body, source: 'json' };
    if (body && typeof body === 'object') {
      const record = body as Record<string, unknown>;
      const text = record.conteudo ?? record.content;
      if (typeof text === 'string') return { rawBody: this.getRawBody(req), text, source: 'json' };
      const list = Object.values(record).find(Array.isArray);
      if (list) return { rawBody: this.getRawBody(req), values: list, source: 'json' };
    }
    throw new BadRequestException(
      'Envie a lista como arquivo (campo "file"), texto no corpo (text/plain) ou JSON.',
    );
  }

  private getRawBody(req: RawBodyRequest): string {
    if (req.rawBody) return req.rawBody.toString('utf8');
    if (typeof req.body === 'string') return req.body;
    return JSON.stringify(req.body ?? {});
  }
}
