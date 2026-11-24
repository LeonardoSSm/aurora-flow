import type { ConfigService } from '@nestjs/config';
import { SolicitationHistoryEventType } from '../../../common/enums/solicitation-history-event-type.enum';
import { SolicitationPriority } from '../../../common/enums/solicitation-priority.enum';
import { SolicitationStatus } from '../../../common/enums/solicitation-status.enum';
import type { SolicitationEntity } from '../../../database/entities';
import { WhatsAppMessageStatus } from '../../../database/entities/whatsapp-message.entity';
import { WhatsAppConnectorService } from './whatsapp-connector.service';

function makeSolicitation(overrides: Partial<SolicitationEntity> = {}): SolicitationEntity {
  return {
    id: 'solicitation-id',
    title: 'Compra de notebook',
    status: SolicitationStatus.IN_PROGRESS,
    priority: SolicitationPriority.HIGH,
    requesterPhone: '5585999999999',
    responsiblePhone: '5585888888888',
    submission: { responderName: 'Ana Solicitante' },
    assignee: { fullName: 'Bruno Responsável' },
    createdByUser: null,
    ...overrides,
  } as SolicitationEntity;
}

function makeService() {
  const whatsappClientService = {
    send: jest.fn(),
    isAvailable: jest.fn(() => false),
    listGroups: jest.fn(),
  };
  const configService = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        FRONTEND_URL: 'https://formhub.test',
        WHATSAPP_PROVIDER: 'mock',
      };
      return values[key];
    }),
  };
  const messagesRepository = {
    create: jest.fn((data: object) => data),
    save: jest.fn(async (entity: object) => ({
      id: 'whatsapp-message-id',
      ...entity,
    })),
    findAndCount: jest.fn(),
    count: jest.fn(),
  };
  const solicitationsRepository = {
    findOne: jest.fn(),
  };
  const historyRepository = {
    create: jest.fn((data: object) => data),
    save: jest.fn(async (entity: object) => entity),
  };

  const metricsService = { incrementWhatsAppMessages: jest.fn() };
  const service = new WhatsAppConnectorService(
    whatsappClientService as never,
    configService as unknown as ConfigService,
    metricsService as never,
    messagesRepository as never,
    solicitationsRepository as never,
    historyRepository as never,
  );

  return {
    service,
    whatsappClientService,
    configService,
    messagesRepository,
    solicitationsRepository,
    historyRepository,
  };
}

describe('WhatsAppConnectorService', () => {
  it('sendToSolicitation chama client.send com mensagem interpolada', async () => {
    const { service, whatsappClientService, solicitationsRepository } = makeService();
    solicitationsRepository.findOne.mockResolvedValue(makeSolicitation());
    whatsappClientService.send.mockResolvedValue({ messageId: 'provider-id', status: 'sent' });

    const result = await service.sendToSolicitation(
      'solicitation-id',
      'Olá {{solicitation_requester_name}}, solicitação {{solicitation_title}}',
    );

    expect(whatsappClientService.send).toHaveBeenCalledWith({
      to: '5585999999999',
      message: 'Olá Ana Solicitante, solicitação Compra de notebook',
    });
    expect(result).toEqual(
      expect.objectContaining({
        status: WhatsAppMessageStatus.SENT,
        externalMessageId: 'provider-id',
      }),
    );
  });

  it('sendToSolicitation sem telefone retorna status failed e não lança', async () => {
    const { service, whatsappClientService, solicitationsRepository } = makeService();
    solicitationsRepository.findOne.mockResolvedValue(
      makeSolicitation({ requesterPhone: null, responsiblePhone: null }),
    );

    await expect(service.sendToSolicitation('solicitation-id', 'Mensagem')).resolves.toEqual(
      expect.objectContaining({
        status: WhatsAppMessageStatus.FAILED,
        errorMessage: 'Número de telefone não disponível.',
      }),
    );
    expect(whatsappClientService.send).not.toHaveBeenCalled();
  });

  it('sendToSolicitation interpola approval_link quando approvalId é informado', async () => {
    const { service, whatsappClientService, solicitationsRepository } = makeService();
    solicitationsRepository.findOne.mockResolvedValue(makeSolicitation());
    whatsappClientService.send.mockResolvedValue({ messageId: 'provider-id', status: 'sent' });

    await service.sendToSolicitation('solicitation-id', 'Aprove em {{approval_link}}', {
      approvalId: 'approval-id',
    });

    expect(whatsappClientService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Aprove em https://formhub.test/aprovacoes?id=approval-id',
      }),
    );
  });

  it('sendToSolicitation persiste WhatsAppMessageEntity', async () => {
    const { service, whatsappClientService, solicitationsRepository, messagesRepository } =
      makeService();
    solicitationsRepository.findOne.mockResolvedValue(makeSolicitation());
    whatsappClientService.send.mockResolvedValue({ messageId: 'provider-id', status: 'queued' });

    await service.sendToSolicitation('solicitation-id', 'Mensagem', {
      flowExecutionId: 'execution-id',
    });

    expect(messagesRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        solicitationId: 'solicitation-id',
        flowExecutionId: 'execution-id',
        to: '5585999999999',
        provider: 'mock',
        externalMessageId: 'provider-id',
        status: WhatsAppMessageStatus.QUEUED,
      }),
    );
  });

  it('sendToSolicitation registra histórico na Solicitação', async () => {
    const { service, whatsappClientService, solicitationsRepository, historyRepository } =
      makeService();
    solicitationsRepository.findOne.mockResolvedValue(makeSolicitation());
    whatsappClientService.send.mockResolvedValue({ messageId: 'provider-id', status: 'sent' });

    await service.sendToSolicitation('solicitation-id', 'Mensagem');

    expect(historyRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        solicitationId: 'solicitation-id',
        eventType: SolicitationHistoryEventType.COMMENT,
        message: 'Mensagem WhatsApp enviada para 5585999999999.',
        metadata: expect.objectContaining({
          provider: 'mock',
          status: WhatsAppMessageStatus.SENT,
        }),
      }),
    );
  });

  describe('listGroups', () => {
    it('sem provedor configurado não consulta nada', async () => {
      const { service, whatsappClientService } = makeService();

      await expect(service.listGroups()).resolves.toEqual({ isAvailable: false, groups: [] });
      expect(whatsappClientService.listGroups).not.toHaveBeenCalled();
    });

    it('devolve os grupos do provedor', async () => {
      const { service, whatsappClientService } = makeService();
      whatsappClientService.isAvailable.mockReturnValue(true);
      const groups = [{ id: '120363000000000001@g.us', subject: 'Cancelamentos', size: 5 }];
      whatsappClientService.listGroups.mockResolvedValue(groups);

      await expect(service.listGroups()).resolves.toEqual({ isAvailable: true, groups });
    });

    it('falha do provedor vira 502 com mensagem para a tela', async () => {
      const { service, whatsappClientService } = makeService();
      whatsappClientService.isAvailable.mockReturnValue(true);
      whatsappClientService.listGroups.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.listGroups()).rejects.toMatchObject({ status: 502 });
    });
  });
});
