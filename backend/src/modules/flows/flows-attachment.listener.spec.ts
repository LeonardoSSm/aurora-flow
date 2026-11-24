import { AttachmentUploadedEvent } from '../../common/events/attachment-events';
import type { FlowEntity, SolicitationEntity, SubmissionEntity } from '../../database/entities';
import { DEFAULT_FLOW_SUBMISSION_QUEUE } from './flows.queue';
import { FlowsAttachmentListener } from './flows-attachment.listener';

function makeFlow(overrides: Partial<FlowEntity> = {}): FlowEntity {
  return {
    id: 'flow-id',
    formId: 'form-id',
    nodes: [
      { id: 'trigger-id', type: 'trigger_attachment_uploaded', position: { x: 0, y: 0 }, data: {} },
    ],
    edges: [],
    ...overrides,
  } as FlowEntity;
}

/** O que findActiveFlowEntries devolve: cada fluxo com o primeiro gatilho como entrada. */
function entriesOf(...flows: FlowEntity[]) {
  return flows.map((flow) => ({
    flow,
    entryNode: flow.nodes.find((node) => node.type.startsWith('trigger_')),
  }));
}

function makeAttachment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'attach-1',
    mimeType: 'image/jpeg',
    solicitationId: null,
    phaseId: null,
    ...overrides,
  };
}

function makeSubmission(overrides: Partial<SubmissionEntity> = {}): SubmissionEntity {
  return {
    id: 'sub-1',
    formId: 'form-id',
    form: { id: 'form-id', name: 'Formulario' },
    items: [],
    ...overrides,
  } as SubmissionEntity;
}

function makeSolicitation(overrides: Partial<SolicitationEntity> = {}): SolicitationEntity {
  return {
    id: 'sol-1',
    formId: 'form-id',
    currentPhaseId: null,
    submissionId: 'sub-1',
    ...overrides,
  } as SolicitationEntity;
}

function makeListener() {
  const configService = { get: jest.fn((_key: string, fallback: string) => fallback) };
  const rabbitMqService = { publishJson: jest.fn() };
  const flowsService = {
    findActiveFlowEntries: jest.fn(),
    executeFlowWithContext: jest.fn(),
  };
  const attachmentsRepo = {
    findOne: jest.fn(),
    save: jest.fn((data: object) => Promise.resolve(data)),
  };
  const submissionsRepo = { findOne: jest.fn() };
  const solicitationsRepo = { findOne: jest.fn() };
  const kanbanPhasesRepo = { findOne: jest.fn(), find: jest.fn().mockResolvedValue([]) };

  const listener = new FlowsAttachmentListener(
    configService as never,
    rabbitMqService as never,
    flowsService as never,
    attachmentsRepo as never,
    submissionsRepo as never,
    solicitationsRepo as never,
    kanbanPhasesRepo as never,
  );

  return {
    listener,
    rabbitMqService,
    flowsService,
    attachmentsRepo,
    submissionsRepo,
    solicitationsRepo,
    kanbanPhasesRepo,
  };
}

describe('FlowsAttachmentListener', () => {
  it('ignora anexos que não são imagem', async () => {
    const { listener, attachmentsRepo, flowsService } = makeListener();
    attachmentsRepo.findOne.mockResolvedValue(makeAttachment({ mimeType: 'application/pdf' }));

    await listener.handleAttachmentUploaded(new AttachmentUploadedEvent(null, 'attach-1', 'sub-1'));

    expect(flowsService.findActiveFlowEntries).not.toHaveBeenCalled();
  });

  it('ignora quando não há submissão associada (upload de fase, não de formulário)', async () => {
    const { listener, attachmentsRepo, flowsService } = makeListener();
    attachmentsRepo.findOne.mockResolvedValue(makeAttachment());

    await listener.handleAttachmentUploaded(new AttachmentUploadedEvent(null, 'attach-1', null));

    expect(flowsService.findActiveFlowEntries).not.toHaveBeenCalled();
  });

  it('não dispara quando não há fluxo ativo para o formulário', async () => {
    const { listener, attachmentsRepo, submissionsRepo, flowsService, rabbitMqService } = makeListener();
    attachmentsRepo.findOne.mockResolvedValue(makeAttachment());
    submissionsRepo.findOne.mockResolvedValue(makeSubmission());
    flowsService.findActiveFlowEntries.mockResolvedValue([]);

    await listener.handleAttachmentUploaded(new AttachmentUploadedEvent(null, 'attach-1', 'sub-1'));

    expect(flowsService.findActiveFlowEntries).toHaveBeenCalledWith(
      'trigger_attachment_uploaded',
      expect.objectContaining({ formId: 'form-id' }),
    );
    expect(rabbitMqService.publishJson).not.toHaveBeenCalled();
  });

  it('resolve a fase efetiva, vincula o anexo à solicitação/fase e despacha o fluxo', async () => {
    const {
      listener,
      attachmentsRepo,
      submissionsRepo,
      solicitationsRepo,
      kanbanPhasesRepo,
      flowsService,
      rabbitMqService,
    } = makeListener();

    const attachment = makeAttachment();
    attachmentsRepo.findOne.mockResolvedValue(attachment);
    submissionsRepo.findOne.mockResolvedValue(makeSubmission());
    solicitationsRepo.findOne.mockResolvedValue(makeSolicitation());
    kanbanPhasesRepo.find.mockResolvedValue([
      { id: 'phase-1', label: 'Preenchimento inicial', order: 0, approverRoleCode: 'supervisor' },
    ]);
    const flow = makeFlow();
    flowsService.findActiveFlowEntries.mockResolvedValue(entriesOf(flow));
    rabbitMqService.publishJson.mockResolvedValue(true);

    await listener.handleAttachmentUploaded(new AttachmentUploadedEvent(null, 'attach-1', 'sub-1'));

    expect(attachmentsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ solicitationId: 'sol-1', phaseId: 'phase-1' }),
    );
    expect(rabbitMqService.publishJson).toHaveBeenCalledWith(
      DEFAULT_FLOW_SUBMISSION_QUEUE,
      expect.objectContaining({
        kind: 'flow_context',
        flowId: flow.id,
        triggerType: 'trigger_attachment_uploaded',
        eventName: 'attachments.uploaded',
        submissionId: 'sub-1',
        solicitationId: 'sol-1',
        attachmentId: 'attach-1',
        metadata: expect.objectContaining({
          phaseId: 'phase-1',
          phaseLabel: 'Preenchimento inicial',
          approverRoleCode: 'supervisor',
        }),
      }),
      expect.objectContaining({ messageId: 'attachments.uploaded:attach-1:flow-id' }),
    );
    expect(flowsService.executeFlowWithContext).not.toHaveBeenCalled();
  });

  it('executa inline quando o RabbitMQ está indisponível', async () => {
    const { listener, attachmentsRepo, submissionsRepo, solicitationsRepo, flowsService, rabbitMqService } =
      makeListener();
    attachmentsRepo.findOne.mockResolvedValue(makeAttachment());
    submissionsRepo.findOne.mockResolvedValue(makeSubmission());
    solicitationsRepo.findOne.mockResolvedValue(null); // solicitação ainda não existe (race)
    const flow = makeFlow();
    flowsService.findActiveFlowEntries.mockResolvedValue(entriesOf(flow));
    rabbitMqService.publishJson.mockResolvedValue(false);

    await listener.handleAttachmentUploaded(new AttachmentUploadedEvent(null, 'attach-1', 'sub-1'));

    expect(flowsService.executeFlowWithContext).toHaveBeenCalledWith(
      flow,
      expect.objectContaining({
        eventName: 'attachments.uploaded',
        solicitation: undefined,
        metadata: expect.objectContaining({ attachmentId: 'attach-1' }),
      }),
    );
  });

  it('não quebra quando a solicitação ainda não existe (best-effort, sem phaseId/approverRoleCode)', async () => {
    const { listener, attachmentsRepo, submissionsRepo, solicitationsRepo, flowsService, rabbitMqService } =
      makeListener();
    attachmentsRepo.findOne.mockResolvedValue(makeAttachment());
    submissionsRepo.findOne.mockResolvedValue(makeSubmission());
    solicitationsRepo.findOne.mockResolvedValue(null);
    flowsService.findActiveFlowEntries.mockResolvedValue(entriesOf(makeFlow()));
    rabbitMqService.publishJson.mockResolvedValue(true);

    await expect(
      listener.handleAttachmentUploaded(new AttachmentUploadedEvent(null, 'attach-1', 'sub-1')),
    ).resolves.not.toThrow();

    expect(attachmentsRepo.save).not.toHaveBeenCalled();
    expect(rabbitMqService.publishJson).toHaveBeenCalledWith(
      DEFAULT_FLOW_SUBMISSION_QUEUE,
      expect.objectContaining({
        metadata: { attachmentId: 'attach-1' },
      }),
      expect.anything(),
    );
  });
});
