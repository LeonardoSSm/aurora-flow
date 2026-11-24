import { NotFoundException } from '@nestjs/common';
import { SolicitationHistoryEventType } from '../../common/enums/solicitation-history-event-type.enum';
import { SolicitationOriginType } from '../../common/enums/solicitation-origin-type.enum';
import { SolicitationPriority } from '../../common/enums/solicitation-priority.enum';
import { SolicitationStatus } from '../../common/enums/solicitation-status.enum';
import type { AttachmentEntity, SolicitationEntity, SolicitationHistoryEntity } from '../../database/entities';
import type { AttachmentsService } from '../attachments/attachments.service';
import type { SolicitationsService } from './solicitations.service';
import { PublicSolicitationsController } from './public-solicitations.controller';

function makeSolicitation(overrides: Partial<SolicitationEntity> = {}): SolicitationEntity {
  return {
    id: 'solicitation-id',
    title: 'Solicitacao de teste',
    description: null,
    status: SolicitationStatus.OPEN,
    priority: SolicitationPriority.MEDIUM,
    originType: SolicitationOriginType.MANUAL,
    trackingToken: 'test-tracking-token',
    formId: 'form-id',
    form: { id: 'form-id', name: 'Formulario TI' } as never,
    submissionId: null,
    submission: null,
    createdBy: null,
    createdByUser: null,
    assigneeId: null,
    assignee: null,
    metadata: null,
    slaStatus: null,
    slaDueAt: null,
    slaStartedAt: null,
    slaPausedAt: null,
    slaBreachedAt: null,
    slaDurationHours: null,
    slaWarningThresholdPercent: null,
    areaId: null,
    externalRefs: null,
    requesterPhone: null,
    responsiblePhone: null,
    history: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as SolicitationEntity;
}

function makeHistoryEntry(
  eventType: SolicitationHistoryEventType,
  overrides: Partial<SolicitationHistoryEntity> = {},
): SolicitationHistoryEntity {
  return {
    id: `history-${eventType}`,
    solicitationId: 'solicitation-id',
    solicitation: null as never,
    eventType,
    actorId: null,
    actor: null,
    fromValue: null,
    toValue: eventType === SolicitationHistoryEventType.STATUS_CHANGED ? SolicitationStatus.IN_PROGRESS : null,
    message: null,
    metadata: null,
    createdAt: new Date('2026-01-01T01:00:00.000Z'),
    ...overrides,
  } as SolicitationHistoryEntity;
}

function makeController(): {
  controller: PublicSolicitationsController;
  solicitationsService: { findByTrackingToken: jest.Mock };
  attachmentsService: { findBySolicitation: jest.Mock };
} {
  const solicitationsService = {
    findByTrackingToken: jest.fn(),
  } as unknown as jest.Mocked<SolicitationsService>;

  const attachmentsService = {
    findBySolicitation: jest.fn().mockResolvedValue([]),
    download: jest.fn(),
  } as unknown as jest.Mocked<AttachmentsService>;

  const commentsService = {
    addPublicComment: jest.fn(),
    findByToken: jest.fn().mockResolvedValue([]),
  } as never;

  const controller = new PublicSolicitationsController(
    solicitationsService as unknown as SolicitationsService,
    attachmentsService as unknown as AttachmentsService,
    commentsService,
  );

  return {
    controller,
    solicitationsService: solicitationsService as never,
    attachmentsService: attachmentsService as never,
  };
}

describe('PublicSolicitationsController.trackByToken', () => {
  it('retorna dados publicos da solicitacao para token valido', async () => {
    const { controller, solicitationsService } = makeController();
    const solicitation = makeSolicitation({
      history: [
        makeHistoryEntry(SolicitationHistoryEventType.CREATED),
        makeHistoryEntry(SolicitationHistoryEventType.STATUS_CHANGED, {
          toValue: SolicitationStatus.IN_PROGRESS,
        }),
        makeHistoryEntry(SolicitationHistoryEventType.ASSIGNEE_CHANGED),
      ],
    });

    solicitationsService.findByTrackingToken.mockResolvedValue(solicitation);

    const result = await controller.trackByToken('test-tracking-token');

    expect(result.number).toBe('solicitation-id');
    expect(result.title).toBe('Solicitacao de teste');
    expect(result.status).toBe(SolicitationStatus.OPEN);
    expect(result.statusLabel).toBe('Aberto');
    expect(result.formName).toBe('Formulario TI');
    expect(result.attachments).toEqual([]);
  });

  it('retorna 404 para token invalido', async () => {
    const { controller, solicitationsService } = makeController();

    solicitationsService.findByTrackingToken.mockRejectedValue(
      new NotFoundException('not found'),
    );

    await expect(controller.trackByToken('invalid-token')).rejects.toThrow(NotFoundException);
  });

  it('timeline filtrada: inclui apenas eventos relevantes ao solicitante', async () => {
    const { controller, solicitationsService } = makeController();
    const solicitation = makeSolicitation({
      history: [
        makeHistoryEntry(SolicitationHistoryEventType.CREATED),
        makeHistoryEntry(SolicitationHistoryEventType.STATUS_CHANGED, {
          toValue: SolicitationStatus.IN_PROGRESS,
        }),
        makeHistoryEntry(SolicitationHistoryEventType.ASSIGNEE_CHANGED),
        makeHistoryEntry(SolicitationHistoryEventType.PRIORITY_CHANGED),
      ],
    });

    solicitationsService.findByTrackingToken.mockResolvedValue(solicitation);

    const result = await controller.trackByToken('test-tracking-token');

    const types = result.timeline.map((e) => e.eventType);
    expect(types).toContain(SolicitationHistoryEventType.CREATED);
    expect(types).toContain(SolicitationHistoryEventType.STATUS_CHANGED);
    expect(types).not.toContain(SolicitationHistoryEventType.ASSIGNEE_CHANGED);
    expect(types).not.toContain(SolicitationHistoryEventType.PRIORITY_CHANGED);
  });

  it('timeline: label correto para status_changed', async () => {
    const { controller, solicitationsService } = makeController();
    const solicitation = makeSolicitation({
      history: [
        makeHistoryEntry(SolicitationHistoryEventType.STATUS_CHANGED, {
          toValue: SolicitationStatus.IN_PROGRESS,
        }),
      ],
    });

    solicitationsService.findByTrackingToken.mockResolvedValue(solicitation);

    const result = await controller.trackByToken('test-tracking-token');

    expect(result.timeline[0].label).toContain('Em andamento');
  });

  it('anexos nao publicos nao aparecem na lista publica', async () => {
    const { controller, solicitationsService, attachmentsService } = makeController();
    const solicitation = makeSolicitation();

    solicitationsService.findByTrackingToken.mockResolvedValue(solicitation);
    // findBySolicitation sem "ver todos" e sem pessoa: só os anexos públicos
    (attachmentsService.findBySolicitation as jest.Mock).mockResolvedValue([
      { id: 'att-1', originalName: 'public.pdf', sizeBytes: 1024, createdAt: new Date(), isPublic: true } as AttachmentEntity,
    ]);

    const result = await controller.trackByToken('test-tracking-token');

    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0].id).toBe('att-1');
    expect(
      (attachmentsService.findBySolicitation as jest.Mock).mock.calls[0][1],
    ).toBe(false);
  });
});

describe('SolicitationsService tracking token', () => {
  it('tokens sao UUID validos', () => {
    const { randomUUID } = require('crypto');
    const token = randomUUID();
    expect(token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});
