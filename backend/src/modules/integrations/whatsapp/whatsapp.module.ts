import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  SolicitationEntity,
  SolicitationHistoryEntity,
  WhatsAppMessageEntity,
} from '../../../database/entities';
import { EvolutionApiProvider } from './evolution-api.provider';
import { MockWhatsAppProvider } from './mock-whatsapp.provider';
import { WhatsAppConnectorService } from './whatsapp-connector.service';
import { WhatsAppIntegrationsController } from './whatsapp-integrations.controller';
import { WhatsAppClientService } from './whatsapp-client.service';
import { WHATSAPP_PROVIDER } from './whatsapp-provider.interface';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WhatsAppMessageEntity,
      SolicitationEntity,
      SolicitationHistoryEntity,
    ]),
  ],
  controllers: [WhatsAppIntegrationsController],
  providers: [
    EvolutionApiProvider,
    MockWhatsAppProvider,
    {
      provide: WHATSAPP_PROVIDER,
      inject: [ConfigService, EvolutionApiProvider, MockWhatsAppProvider],
      useFactory: (
        configService: ConfigService,
        evolutionApiProvider: EvolutionApiProvider,
        mockProvider: MockWhatsAppProvider,
      ) => {
        const provider = configService
          .get<string>('WHATSAPP_PROVIDER', 'mock')
          .trim()
          .toLowerCase();
        if (provider === 'evolution' && evolutionApiProvider.isConfigured()) {
          return evolutionApiProvider;
        }
        return mockProvider;
      },
    },
    WhatsAppClientService,
    WhatsAppConnectorService,
  ],
  exports: [WhatsAppClientService, WhatsAppConnectorService],
})
export class WhatsAppModule {}
