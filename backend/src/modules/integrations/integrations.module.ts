import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  InboundWebhookEventEntity,
  WebhookDeliveryEntity,
  WebhookEndpointEntity,
} from '../../database/entities';
import { HmacService } from '../../common/crypto/hmac.service';
import { InboundWebhookService } from './inbound-webhook.service';
import { OutboundWebhookService } from './outbound-webhook.service';
import { WebhooksController } from './webhooks.controller';
import { WhatsAppModule } from './whatsapp/whatsapp.module';

@Module({
  imports: [
    WhatsAppModule,
    TypeOrmModule.forFeature([
      WebhookDeliveryEntity,
      WebhookEndpointEntity,
      InboundWebhookEventEntity,
    ]),
  ],
  controllers: [WebhooksController],
  providers: [HmacService, OutboundWebhookService, InboundWebhookService],
  exports: [HmacService, OutboundWebhookService, InboundWebhookService, WhatsAppModule],
})
export class IntegrationsModule {}
