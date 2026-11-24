import { ApprovalStatus } from '../../common/enums/approval-status.enum';
import { SolicitationPriority } from '../../common/enums/solicitation-priority.enum';
import { SolicitationStatus } from '../../common/enums/solicitation-status.enum';
import type { FlowEntity, SolicitationEntity } from '../../database/entities';
import { WebhookDeliveryStatus } from '../../database/entities/webhook-delivery.entity';
import {
  FlowExecutionEngine,
  isPausedApprovalResult,
  isPausedPhaseFieldsResult,
  isPausedSubflowResult,
} from './flow-execution.engine';
import { FLOW_NODE_TYPES } from './types/flow.types';
import type { FlowEdge, FlowExecutionContext, FlowNode } from './types/flow.types';

// ─── Axios mock ───────────────────────────────────────────────────────────────
const mockAxios = { request: jest.fn() };
jest.mock('axios', () => ({
  __esModule: true,
  default: { request: (...a: unknown[]) => mockAxios.request(...a) },
}));

function makeSolicitation(overrides: Partial<SolicitationEntity> = {}): SolicitationEntity {
  return {
    id: 'solicitation-id',
    title: 'Solicitacao',
    status: SolicitationStatus.NEW,
    priority: SolicitationPriority.MEDIUM,
    formId: 'form-id',
    submissionId: null,
    submission: null,
    assignee: null,
    createdByUser: null,
    ...overrides,
  } as SolicitationEntity;
}

function makeFlow(nodes: FlowNode[], edges: FlowEdge[]): FlowEntity {
  return {
    id: 'flow-id',
    formId: 'form-id',
    nodes,
    edges,
  } as FlowEntity;
}

function makeEngine() {
  const mailer = { send: jest.fn() };
  const notificationsRepo = {
    create: jest.fn((data: object) => data),
    save: jest.fn((data: object) => Promise.resolve(data)),
  };
  const executionsRepo = {
    create: jest.fn((data: object) => data),
    save: jest.fn((data: object) => Promise.resolve({ id: 'child-exec-id', ...data })),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const flowsRepo = {
    findOne: jest.fn(),
  };
  const approvalsRepo = {
    findOne: jest.fn().mockResolvedValue(null),
  };
  const attachmentsRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn((data: object) => Promise.resolve(data)),
  };
  const googleWorkspace = {
    isUserGoogleConnectedById: jest.fn(),
    appendRowToSpreadsheet: jest.fn(),
  };
  const metricsService = {
    recordFlowNodeExecution: jest.fn(),
    recordFlowExecution: jest.fn(),
  };
  const solicitationsService = {
    moveCard: jest.fn(),
    movePhase: jest.fn(),
    findKanbanPhase: jest.fn().mockResolvedValue(null),
    updateAssignee: jest.fn(),
  };
  const approvalsService = {
    createApproval: jest.fn(),
    pendingApproverUserIds: jest.fn().mockResolvedValue([]),
  };
  const usersService = {
    findActiveByEmail: jest.fn(),
    findAssignable: jest.fn().mockResolvedValue([]),
  };
  const outboundWebhookService = {
    send: jest.fn(),
  };
  const whatsappConnectorService = {
    sendToSolicitation: jest.fn(),
  };

  const erpConnectorService = {
    executeOperation: jest.fn(),
  };

  const configService = { get: jest.fn().mockReturnValue('http://localhost:3001') };

  const notificationExecutor = { execute: jest.fn() };

  const storageService = {
    readFile: jest.fn().mockResolvedValue(Buffer.from('fake-image-bytes')),
  };

  const engine = new FlowExecutionEngine(
    mailer as never,
    notificationsRepo as never,
    executionsRepo as never,
    flowsRepo as never,
    approvalsRepo as never,
    attachmentsRepo as never,
    googleWorkspace as never,
    metricsService as never,
    solicitationsService as never,
    approvalsService as never,
    usersService as never,
    outboundWebhookService as never,
    whatsappConnectorService as never,
    configService as never,
    erpConnectorService as never,
    storageService as never,
    notificationExecutor as never,
  );

  return {
    engine,
    mailer,
    notificationsRepo,
    googleWorkspace,
    solicitationsService,
    approvalsService,
    usersService,
    outboundWebhookService,
    whatsappConnectorService,
    flowsRepo,
    approvalsRepo,
    attachmentsRepo,
    executionsRepo,
    metricsService,
    storageService,
    configService,
    notificationExecutor,
    erpConnectorService,
  };
}

function terminalNode(id: string): FlowNode {
  return {
    id,
    type: 'condition_always_true',
    position: { x: 0, y: 0 },
    data: {},
  };
}

describe('FlowExecutionEngine solicitation nodes', () => {
  it('condition_solicitation_status equals direciona para yes/no corretamente', async () => {
    const { engine } = makeEngine();
    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_solicitation_created', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'condition',
          type: 'condition_solicitation_status',
          position: { x: 0, y: 0 },
          data: { operator: 'equals', value: SolicitationStatus.NEW },
        },
        terminalNode('yes-node'),
        terminalNode('no-node'),
      ],
      [
        { id: 'e1', source: 'trigger', target: 'condition' },
        { id: 'e2', source: 'condition', sourceHandle: 'yes', target: 'yes-node' },
        { id: 'e3', source: 'condition', sourceHandle: 'no', target: 'no-node' },
      ],
    );

    const yesResults = await engine.execute(flow, {
      eventName: 'solicitations.created',
      solicitation: makeSolicitation({ status: SolicitationStatus.NEW }),
    });
    const noResults = await engine.execute(flow, {
      eventName: 'solicitations.created',
      solicitation: makeSolicitation({ status: SolicitationStatus.IN_PROGRESS }),
    });

    expect(yesResults.map((r) => r.nodeId)).toEqual(['trigger', 'condition', 'yes-node']);
    expect(noResults.map((r) => r.nodeId)).toEqual(['trigger', 'condition', 'no-node']);
  });

  it('condition_solicitation_priority greater_than compara ordem de prioridade', async () => {
    const { engine } = makeEngine();
    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_solicitation_created', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'condition',
          type: 'condition_solicitation_priority',
          position: { x: 0, y: 0 },
          data: { operator: 'greater_than', value: SolicitationPriority.MEDIUM },
        },
        terminalNode('yes-node'),
        terminalNode('no-node'),
      ],
      [
        { id: 'e1', source: 'trigger', target: 'condition' },
        { id: 'e2', source: 'condition', sourceHandle: 'yes', target: 'yes-node' },
        { id: 'e3', source: 'condition', sourceHandle: 'no', target: 'no-node' },
      ],
    );

    const yesResults = await engine.execute(flow, {
      eventName: 'solicitations.created',
      solicitation: makeSolicitation({ priority: SolicitationPriority.HIGH }),
    });
    const noResults = await engine.execute(flow, {
      eventName: 'solicitations.created',
      solicitation: makeSolicitation({ priority: SolicitationPriority.LOW }),
    });

    expect(yesResults.map((r) => r.nodeId)).toEqual(['trigger', 'condition', 'yes-node']);
    expect(noResults.map((r) => r.nodeId)).toEqual(['trigger', 'condition', 'no-node']);
  });

  it('action_update_solicitation_status chama moveCard com status', async () => {
    const { engine, solicitationsService } = makeEngine();
    const updated = makeSolicitation({ status: SolicitationStatus.IN_ANALYSIS });
    solicitationsService.moveCard.mockResolvedValue(updated);
    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_solicitation_created', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'action',
          type: 'action_update_solicitation_status',
          position: { x: 0, y: 0 },
          data: { status: SolicitationStatus.IN_ANALYSIS, currentStage: 'Triagem' },
        },
      ],
      [{ id: 'e1', source: 'trigger', target: 'action' }],
    );

    await engine.execute(flow, {
      eventName: 'solicitations.created',
      solicitation: makeSolicitation(),
    });

    expect(solicitationsService.moveCard).toHaveBeenCalledWith(
      'solicitation-id',
      { status: SolicitationStatus.IN_ANALYSIS, currentStage: 'Triagem' },
      null,
      { flowEventDepth: 1 },
    );
  });

  it('action_create_approval chama createApproval com dados', async () => {
    const { engine, approvalsService } = makeEngine();
    approvalsService.createApproval.mockResolvedValue({ id: 'approval-id' });
    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_solicitation_created', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'action',
          type: 'action_create_approval',
          position: { x: 0, y: 0 },
          data: {
            title: 'Aprovar {{solicitation_title}}',
            description: 'Prioridade {{solicitation_priority}}',
            assignedUserIds: ['approver-id'],
          },
        },
      ],
      [{ id: 'e1', source: 'trigger', target: 'action' }],
    );

    await engine.execute(flow, {
      eventName: 'solicitations.created',
      solicitation: makeSolicitation({ title: 'Compra', priority: SolicitationPriority.HIGH }),
    });

    expect(approvalsService.createApproval).toHaveBeenCalledWith(
      'solicitation-id',
      {
        title: 'Aprovar Compra',
        description: 'Prioridade high',
        assignedUserIds: ['approver-id'],
      },
      null,
    );
  });

  it('action_create_approval pula a criação e volta a pausar se a solicitação já tem aprovação pendente (replay/idempotência)', async () => {
    const { engine, approvalsService, approvalsRepo } = makeEngine();
    approvalsRepo.findOne.mockResolvedValue({
      id: 'existing-approval-id',
      status: ApprovalStatus.PENDING,
    });
    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_solicitation_created', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'action',
          type: 'action_create_approval',
          position: { x: 0, y: 0 },
          data: {
            title: 'Aprovar {{solicitation_title}}',
            assignedUserIds: ['approver-id'],
          },
        },
      ],
      [{ id: 'e1', source: 'trigger', target: 'action' }],
    );

    const results = await engine.execute(flow, {
      eventName: 'solicitations.created',
      solicitation: makeSolicitation({ title: 'Compra' }),
    });

    expect(approvalsService.createApproval).not.toHaveBeenCalled();
    const actionResult = results.find((r) => r.nodeId === 'action');
    expect(actionResult?.status).toBe('success');
    // Um replay não pode pular a pausa e seguir pro resto do fluxo com dado desatualizado —
    // se a aprovação existente ainda está pendente, a execução tem que parar aqui de novo.
    expect(actionResult && isPausedApprovalResult(actionResult)).toBe(true);
  });

  it('action_create_approval em modo dinâmico resolve e-mails do payload para userIds', async () => {
    const { engine, approvalsService, usersService } = makeEngine();
    approvalsService.createApproval.mockResolvedValue({ id: 'approval-id' });
    usersService.findActiveByEmail.mockImplementation((email: string) =>
      Promise.resolve(email === 'a@x.com' ? { id: 'user-a' } : { id: 'user-b' }),
    );
    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_webhook_received', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'action',
          type: 'action_create_approval',
          position: { x: 0, y: 0 },
          data: {
            title: 'Aprovar pedido',
            approverSourceMode: 'dynamic',
            approversPath: 'header.aprovadores',
          },
        },
      ],
      [{ id: 'e1', source: 'trigger', target: 'action' }],
    );

    await engine.execute(flow, {
      eventName: 'webhooks.received',
      solicitation: makeSolicitation(),
      metadata: { payload: { header: { aprovadores: ['a@x.com', 'B@x.com'] } } },
    });

    expect(approvalsService.createApproval).toHaveBeenCalledWith(
      'solicitation-id',
      expect.objectContaining({ assignedUserIds: ['user-a', 'user-b'] }),
      null,
    );
  });

  it('action_create_approval em modo dinâmico falha (fail loud) se algum e-mail não resolver', async () => {
    const { engine, approvalsService, usersService } = makeEngine();
    usersService.findActiveByEmail.mockResolvedValue(null);
    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_webhook_received', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'action',
          type: 'action_create_approval',
          position: { x: 0, y: 0 },
          data: {
            title: 'Aprovar pedido',
            approverSourceMode: 'dynamic',
            approversPath: 'header.aprovadores',
          },
        },
      ],
      [{ id: 'e1', source: 'trigger', target: 'action' }],
    );

    const results = await engine.execute(flow, {
      eventName: 'webhooks.received',
      solicitation: makeSolicitation(),
      metadata: { payload: { header: { aprovadores: ['ghost@x.com'] } } },
    });

    expect(approvalsService.createApproval).not.toHaveBeenCalled();
    const actionResult = results.find((r) => r.nodeId === 'action');
    expect(actionResult?.status).toBe('failed');
    expect(actionResult?.error).toContain('ghost@x.com');
  });

  it('action_create_approval no modo campo do formulário resolve o e-mail preenchido pelo solicitante', async () => {
    const { engine, approvalsService, usersService } = makeEngine();
    approvalsService.createApproval.mockResolvedValue({ id: 'approval-id' });
    usersService.findActiveByEmail.mockImplementation((email: string) =>
      Promise.resolve(email === 'gestor@x.com' ? { id: 'user-gestor' } : null),
    );
    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_solicitation_created', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'action',
          type: 'action_create_approval',
          position: { x: 0, y: 0 },
          data: {
            title: 'Aprovação do gestor',
            approverSourceMode: 'field',
            approverFieldCode: 'email_gestor',
          },
        },
      ],
      [{ id: 'e1', source: 'trigger', target: 'action' }],
    );

    await engine.execute(flow, {
      eventName: 'solicitations.created',
      solicitation: makeSolicitation(),
      fields: { email_gestor: ' Gestor@X.com ' },
    });

    expect(usersService.findActiveByEmail).toHaveBeenCalledWith('gestor@x.com');
    expect(approvalsService.createApproval).toHaveBeenCalledWith(
      'solicitation-id',
      expect.objectContaining({ assignedUserIds: ['user-gestor'] }),
      null,
    );
  });

  it('action_create_approval no modo campo do formulário falha se o campo veio vazio', async () => {
    const { engine, approvalsService } = makeEngine();
    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_solicitation_created', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'action',
          type: 'action_create_approval',
          position: { x: 0, y: 0 },
          data: {
            title: 'Aprovação do gestor',
            approverSourceMode: 'field',
            approverFieldCode: 'email_gestor',
          },
        },
      ],
      [{ id: 'e1', source: 'trigger', target: 'action' }],
    );

    const results = await engine.execute(flow, {
      eventName: 'solicitations.created',
      solicitation: makeSolicitation(),
      fields: { email_gestor: '' },
    });

    expect(approvalsService.createApproval).not.toHaveBeenCalled();
    const actionResult = results.find((r) => r.nodeId === 'action');
    expect(actionResult?.status).toBe('failed');
    expect(actionResult?.error).toContain('email_gestor');
  });

  describe('action_create_approval — aprovadores externos (por e-mail)', () => {
    function approvalFlow(
      data: Record<string, unknown>,
      triggerType: 'trigger_solicitation_created' | 'trigger_webhook_received' = 'trigger_solicitation_created',
    ) {
      return makeFlow(
        [
          { id: 'trigger', type: triggerType, position: { x: 0, y: 0 }, data: {} },
          { id: 'action', type: 'action_create_approval', position: { x: 0, y: 0 }, data: { title: 'Aprovação do gestor', ...data } },
        ],
        [{ id: 'e1', source: 'trigger', target: 'action' }],
      );
    }

    it('modo fixo com approverEmails: repassa os e-mails para o ApprovalsService decidir o roteamento', async () => {
      const { engine, approvalsService, usersService } = makeEngine();
      approvalsService.createApproval.mockResolvedValue({ id: 'approval-id' });

      await engine.execute(approvalFlow({ approverEmails: ['gestor@x.com'] }), {
        eventName: 'solicitations.created',
        solicitation: makeSolicitation(),
      });

      expect(approvalsService.createApproval).toHaveBeenCalledWith(
        'solicitation-id',
        expect.objectContaining({ assignedEmails: ['gestor@x.com'] }),
        null,
      );
      const dto = approvalsService.createApproval.mock.calls[0][1] as Record<string, unknown>;
      expect(dto.assignedUserIds).toBeUndefined();
      // Quem resolve e-mail → usuário é o ApprovalsService; o motor não consulta usuários aqui.
      expect(usersService.findActiveByEmail).not.toHaveBeenCalled();
    });

    it('modo fixo aceita usuários e e-mails juntos', async () => {
      const { engine, approvalsService } = makeEngine();
      approvalsService.createApproval.mockResolvedValue({ id: 'approval-id' });

      await engine.execute(approvalFlow({ assignedUserIds: ['user-1'], approverEmails: ['gestor@x.com'] }), {
        eventName: 'solicitations.created',
        solicitation: makeSolicitation(),
      });

      expect(approvalsService.createApproval).toHaveBeenCalledWith(
        'solicitation-id',
        expect.objectContaining({ assignedUserIds: ['user-1'], assignedEmails: ['gestor@x.com'] }),
        null,
      );
    });

    it('modo fixo sem usuários nem e-mails continua falhando', async () => {
      const { engine, approvalsService } = makeEngine();

      const results = await engine.execute(approvalFlow({ approverEmails: [] }), {
        eventName: 'solicitations.created',
        solicitation: makeSolicitation(),
      });

      expect(approvalsService.createApproval).not.toHaveBeenCalled();
      expect(results.find((r) => r.nodeId === 'action')?.status).toBe('failed');
    });

    it('modo campo + allowExternalApprovers: e-mail sem usuário NÃO falha — vira aprovador externo', async () => {
      const { engine, approvalsService, usersService } = makeEngine();
      approvalsService.createApproval.mockResolvedValue({ id: 'approval-id' });
      usersService.findActiveByEmail.mockResolvedValue(null);

      const results = await engine.execute(
        approvalFlow({ approverSourceMode: 'field', approverFieldCode: 'email_gestor', allowExternalApprovers: true }),
        {
          eventName: 'solicitations.created',
          solicitation: makeSolicitation(),
          fields: { email_gestor: ' Gestor@X.com ' },
        },
      );

      expect(results.find((r) => r.nodeId === 'action')?.status).toBe('success');
      expect(approvalsService.createApproval).toHaveBeenCalledWith(
        'solicitation-id',
        expect.objectContaining({ assignedEmails: ['gestor@x.com'] }),
        null,
      );
      expect(usersService.findActiveByEmail).not.toHaveBeenCalled();
    });

    it('modo campo SEM allowExternalApprovers mantém o comportamento antigo (falha se não há usuário)', async () => {
      const { engine, approvalsService, usersService } = makeEngine();
      usersService.findActiveByEmail.mockResolvedValue(null);

      const results = await engine.execute(
        approvalFlow({ approverSourceMode: 'field', approverFieldCode: 'email_gestor' }),
        { eventName: 'solicitations.created', solicitation: makeSolicitation(), fields: { email_gestor: 'gestor@x.com' } },
      );

      expect(approvalsService.createApproval).not.toHaveBeenCalled();
      expect(results.find((r) => r.nodeId === 'action')?.status).toBe('failed');
    });

    it('modo campo + allowExternalApprovers com campo vazio ainda falha', async () => {
      const { engine, approvalsService } = makeEngine();

      const results = await engine.execute(
        approvalFlow({ approverSourceMode: 'field', approverFieldCode: 'email_gestor', allowExternalApprovers: true }),
        { eventName: 'solicitations.created', solicitation: makeSolicitation(), fields: { email_gestor: '' } },
      );

      expect(approvalsService.createApproval).not.toHaveBeenCalled();
      expect(results.find((r) => r.nodeId === 'action')?.error).toContain('email_gestor');
    });

    it('modo dinâmico + allowExternalApprovers: todos os e-mails do payload vão para o ApprovalsService', async () => {
      const { engine, approvalsService, usersService } = makeEngine();
      approvalsService.createApproval.mockResolvedValue({ id: 'approval-id' });

      await engine.execute(
        approvalFlow(
          { approverSourceMode: 'dynamic', approversPath: 'header.aprovadores', allowExternalApprovers: true },
          'trigger_webhook_received',
        ),
        {
          eventName: 'webhooks.received',
          solicitation: makeSolicitation(),
          metadata: { payload: { header: { aprovadores: ['a@x.com', 'B@x.com'] } } },
        },
      );

      expect(approvalsService.createApproval).toHaveBeenCalledWith(
        'solicitation-id',
        expect.objectContaining({ assignedEmails: ['a@x.com', 'b@x.com'] }),
        null,
      );
      expect(usersService.findActiveByEmail).not.toHaveBeenCalled();
    });
  });

  it(
    'action_create_approval pausa a execução — não segue para a condição/ramo com o status ' +
      'desatualizado (regressão: condição rodava antes de qualquer decisão e o ramo "não" ' +
      'chegava a mover o card de verdade)',
    async () => {
      const { engine, approvalsService } = makeEngine();
      approvalsService.createApproval.mockResolvedValue({
        id: 'approval-id',
        status: ApprovalStatus.PENDING,
      });
      const flow = makeFlow(
        [
          { id: 'trigger', type: 'trigger_solicitation_moved', position: { x: 0, y: 0 }, data: {} },
          {
            id: 'approval',
            type: 'action_create_approval',
            position: { x: 0, y: 0 },
            data: { title: 'Aprovar pedido', assignedUserIds: ['approver-id'] },
          },
          {
            id: 'condition',
            type: 'condition_solicitation_status',
            position: { x: 0, y: 0 },
            data: { operator: 'equals', value: SolicitationStatus.APPROVED },
          },
          {
            id: 'move-approved',
            type: 'action_move_kanban_card',
            position: { x: 0, y: 0 },
            data: { status: SolicitationStatus.APPROVED },
          },
          {
            id: 'move-rejected',
            type: 'action_move_kanban_card',
            position: { x: 0, y: 0 },
            data: { status: SolicitationStatus.REJECTED },
          },
        ],
        [
          { id: 'e1', source: 'trigger', target: 'approval' },
          { id: 'e2', source: 'approval', target: 'condition' },
          { id: 'e3', source: 'condition', sourceHandle: 'yes', target: 'move-approved' },
          { id: 'e4', source: 'condition', sourceHandle: 'no', target: 'move-rejected' },
        ],
      );

      const results = await engine.execute(flow, {
        eventName: 'solicitations.moved',
        solicitation: makeSolicitation({ status: SolicitationStatus.WAITING_APPROVAL }),
      });

      expect(results.map((r) => r.nodeId)).toEqual(['trigger', 'approval']);
      const approvalResult = results.find((r) => r.nodeId === 'approval');
      expect(approvalResult && isPausedApprovalResult(approvalResult)).toBe(true);
      expect(approvalResult?.output).toEqual({ paused: true, approvalId: 'approval-id' });
    },
  );

  it(
    'action_create_approval NÃO pausa quando a aprovação já chega decidida (edge case defensivo)',
    async () => {
      const { engine, approvalsService } = makeEngine();
      approvalsService.createApproval.mockResolvedValue({
        id: 'approval-id',
        status: ApprovalStatus.APPROVED,
      });
      const flow = makeFlow(
        [
          { id: 'trigger', type: 'trigger_solicitation_created', position: { x: 0, y: 0 }, data: {} },
          {
            id: 'approval',
            type: 'action_create_approval',
            position: { x: 0, y: 0 },
            data: { title: 'Aprovar pedido', assignedUserIds: ['approver-id'] },
          },
          terminalNode('after'),
        ],
        [
          { id: 'e1', source: 'trigger', target: 'approval' },
          { id: 'e2', source: 'approval', target: 'after' },
        ],
      );

      const results = await engine.execute(flow, {
        eventName: 'solicitations.created',
        solicitation: makeSolicitation(),
      });

      expect(results.map((r) => r.nodeId)).toEqual(['trigger', 'approval', 'after']);
    },
  );

  it('resumeFrom continua do nó pausado com o status final da solicitação, sem recriar a aprovação', async () => {
    const { engine, approvalsService } = makeEngine();
    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_solicitation_moved', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'approval',
          type: 'action_create_approval',
          position: { x: 0, y: 0 },
          data: { title: 'Aprovar pedido', assignedUserIds: ['approver-id'] },
        },
        {
          id: 'condition',
          type: 'condition_solicitation_status',
          position: { x: 0, y: 0 },
          data: { operator: 'equals', value: SolicitationStatus.APPROVED },
        },
        {
          id: 'move-approved',
          type: 'action_move_kanban_card',
          position: { x: 0, y: 0 },
          data: { status: SolicitationStatus.APPROVED },
        },
        {
          id: 'move-rejected',
          type: 'action_move_kanban_card',
          position: { x: 0, y: 0 },
          data: { status: SolicitationStatus.REJECTED },
        },
      ],
      [
        { id: 'e1', source: 'trigger', target: 'approval' },
        { id: 'e2', source: 'approval', target: 'condition' },
        { id: 'e3', source: 'condition', sourceHandle: 'yes', target: 'move-approved' },
        { id: 'e4', source: 'condition', sourceHandle: 'no', target: 'move-rejected' },
      ],
    );

    // Contexto reconstruído do banco depois da decisão — como
    // FlowsService.resumePausedExecution monta via buildContextFromJob(approvalId).
    const results = await engine.resumeFrom(flow, 'approval', {
      eventName: 'approvals.resume',
      solicitation: makeSolicitation({ status: SolicitationStatus.APPROVED }),
      approval: { id: 'approval-id', status: ApprovalStatus.APPROVED } as never,
    });

    expect(results.map((r) => r.nodeId)).toEqual(['condition', 'move-approved']);
    expect(approvalsService.createApproval).not.toHaveBeenCalled();
  });

  it('action_create_solicitation_from_payload cria solicitação a partir do payload do webhook', async () => {
    const { engine, solicitationsService } = makeEngine();
    (solicitationsService as unknown as { createFromFlowPayload: jest.Mock }).createFromFlowPayload =
      jest.fn().mockResolvedValue({ solicitation: makeSolicitation({ id: 'new-solicitation-id' }), reused: false });
    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_webhook_received', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'action',
          type: 'action_create_solicitation_from_payload',
          position: { x: 0, y: 0 },
          data: {
            titlePath: 'header.numeroPedido',
            descriptionPath: 'header.observacao',
            metadataFieldMappings: [{ path: 'header.valorTotal', target: 'valorTotal' }],
            idempotencyKeyPath: 'header.numeroPedido',
          },
        },
      ],
      [{ id: 'e1', source: 'trigger', target: 'action' }],
    );

    await engine.execute(flow, {
      eventName: 'webhooks.received',
      metadata: {
        payload: {
          header: { numeroPedido: 'PC-123', observacao: 'Urgente', valorTotal: 999 },
        },
      },
    });

    const createFromFlowPayload = (
      solicitationsService as unknown as { createFromFlowPayload: jest.Mock }
    ).createFromFlowPayload;
    expect(createFromFlowPayload).toHaveBeenCalledWith({
      title: 'PC-123',
      description: 'Urgente',
      metadata: { valorTotal: 999 },
      priority: undefined,
      formId: null,
      phaseId: null,
      idempotencyKey: 'PC-123',
      dueAt: null,
      slaWarningThresholdPercent: undefined,
      flowEventDepth: 1,
    });
  });

  it('action_create_solicitation_from_payload cria tarefa recorrente com titulo fixo e prazo', async () => {
    // Cenario da renovacao anual: gatilho de movimentacao nao traz payload, entao o
    // titulo vem de template e o prazo do proprio no.
    const { engine, solicitationsService } = makeEngine();
    (solicitationsService as unknown as { createFromFlowPayload: jest.Mock }).createFromFlowPayload =
      jest.fn().mockResolvedValue({ solicitation: makeSolicitation({ id: 'proxima-renovacao' }), reused: false });
    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_solicitation_moved', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'action',
          type: 'action_create_solicitation_from_payload',
          position: { x: 0, y: 0 },
          data: {
            titleTemplate: 'Renovar certificado digital A4',
            descriptionTemplate: 'Anterior: {{solicitation_title}}',
            idempotencyKeyTemplate: 'renovacao-{{solicitation_number}}',
            dueInMonths: 12,
            slaWarningThresholdPercent: 92,
          },
        },
      ],
      [{ id: 'e1', source: 'trigger', target: 'action' }],
    );

    const antes = new Date();
    await engine.execute(flow, {
      eventName: 'solicitations.moved',
      solicitation: makeSolicitation({
        id: 'certificado-2026',
        title: 'Renovar certificado digital A4',
        status: SolicitationStatus.COMPLETED,
      }),
      metadata: { fromStatus: 'in_progress', toStatus: 'completed' },
    });

    const createFromFlowPayload = (
      solicitationsService as unknown as { createFromFlowPayload: jest.Mock }
    ).createFromFlowPayload;
    expect(createFromFlowPayload).toHaveBeenCalledTimes(1);

    const input = createFromFlowPayload.mock.calls[0][0] as {
      title: string;
      description: string | null;
      idempotencyKey: string | null;
      dueAt: Date | null;
      slaWarningThresholdPercent?: number;
    };
    expect(input.title).toBe('Renovar certificado digital A4');
    expect(input.description).toBe('Anterior: Renovar certificado digital A4');
    expect(input.idempotencyKey).toBe('renovacao-certificado-2026');
    expect(input.slaWarningThresholdPercent).toBe(92);

    const esperado = new Date(antes);
    esperado.setMonth(esperado.getMonth() + 12);
    expect(input.dueAt).toBeInstanceOf(Date);
    // Tolerancia de um minuto: o relogio anda entre montar o esperado e executar.
    expect(Math.abs((input.dueAt as Date).getTime() - esperado.getTime())).toBeLessThan(60_000);
  });

  it('action_create_solicitation_from_payload soma meses e dias no prazo', async () => {
    const { engine, solicitationsService } = makeEngine();
    (solicitationsService as unknown as { createFromFlowPayload: jest.Mock }).createFromFlowPayload =
      jest.fn().mockResolvedValue({ solicitation: makeSolicitation(), reused: false });
    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_solicitation_moved', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'action',
          type: 'action_create_solicitation_from_payload',
          position: { x: 0, y: 0 },
          data: { titleTemplate: 'Tarefa', dueInMonths: 1, dueInDays: 5 },
        },
      ],
      [{ id: 'e1', source: 'trigger', target: 'action' }],
    );

    const antes = new Date();
    await engine.execute(flow, {
      eventName: 'solicitations.moved',
      solicitation: makeSolicitation(),
      metadata: {},
    });

    const input = (
      solicitationsService as unknown as { createFromFlowPayload: jest.Mock }
    ).createFromFlowPayload.mock.calls[0][0] as { dueAt: Date };
    const esperado = new Date(antes);
    esperado.setMonth(esperado.getMonth() + 1);
    esperado.setDate(esperado.getDate() + 5);
    expect(Math.abs(input.dueAt.getTime() - esperado.getTime())).toBeLessThan(60_000);
  });

  it('action_create_solicitation_from_payload falha quando o template gera titulo vazio', async () => {
    const { engine } = makeEngine();
    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_solicitation_moved', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'action',
          type: 'action_create_solicitation_from_payload',
          position: { x: 0, y: 0 },
          data: { titleTemplate: '{{solicitation_responsible_name}}' },
        },
      ],
      [{ id: 'e1', source: 'trigger', target: 'action' }],
    );

    const results = await engine.execute(flow, {
      eventName: 'solicitations.moved',
      solicitation: makeSolicitation({ assignee: null }),
      metadata: {},
    });

    const actionResult = results.find((r) => r.nodeId === 'action');
    expect(actionResult?.status).toBe('failed');
    expect(actionResult?.error).toContain('template');
  });

  it('action_create_solicitation_from_payload falha se titlePath não resolver', async () => {
    const { engine } = makeEngine();
    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_webhook_received', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'action',
          type: 'action_create_solicitation_from_payload',
          position: { x: 0, y: 0 },
          data: { titlePath: 'header.inexistente' },
        },
      ],
      [{ id: 'e1', source: 'trigger', target: 'action' }],
    );

    const results = await engine.execute(flow, {
      eventName: 'webhooks.received',
      metadata: { payload: { header: {} } },
    });

    const actionResult = results.find((r) => r.nodeId === 'action');
    expect(actionResult?.status).toBe('failed');
  });

  it('action_assign_responsible chama updateAssignee', async () => {
    const { engine, solicitationsService } = makeEngine();
    const updated = makeSolicitation({ assigneeId: 'user-id' } as Partial<SolicitationEntity>);
    solicitationsService.updateAssignee.mockResolvedValue(updated);
    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_solicitation_created', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'action',
          type: 'action_assign_responsible',
          position: { x: 0, y: 0 },
          data: { userId: 'user-id' },
        },
      ],
      [{ id: 'e1', source: 'trigger', target: 'action' }],
    );

    await engine.execute(flow, {
      eventName: 'solicitations.created',
      solicitation: makeSolicitation(),
    });

    expect(solicitationsService.updateAssignee).toHaveBeenCalledWith(
      'solicitation-id',
      { assigneeId: 'user-id' },
      null,
    );
  });

  it('executa fluxo ponta a ponta ate action_create_approval pelo caminho yes', async () => {
    const { engine, approvalsService } = makeEngine();
    approvalsService.createApproval.mockResolvedValue({ id: 'approval-id' });
    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_solicitation_created', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'condition',
          type: 'condition_solicitation_priority',
          position: { x: 0, y: 0 },
          data: { operator: 'greater_than', value: SolicitationPriority.MEDIUM },
        },
        {
          id: 'approval',
          type: 'action_create_approval',
          position: { x: 0, y: 0 },
          data: { title: 'Aprovar solicitação', assignedUserIds: ['approver-id'] },
        },
      ],
      [
        { id: 'e1', source: 'trigger', target: 'condition' },
        { id: 'e2', source: 'condition', sourceHandle: 'yes', target: 'approval' },
      ],
    );
    const context: FlowExecutionContext = {
      eventName: 'solicitations.created',
      solicitation: makeSolicitation({ priority: SolicitationPriority.HIGH }),
    };

    const results = await engine.execute(flow, context);

    expect(results.map((r) => r.nodeId)).toEqual(['trigger', 'condition', 'approval']);
    expect(approvalsService.createApproval).toHaveBeenCalledWith(
      'solicitation-id',
      { title: 'Aprovar solicitação', description: undefined, assignedUserIds: ['approver-id'] },
      null,
    );
  });

  it('action_webhook usa OutboundWebhookService com flowExecutionId', async () => {
    const { engine, outboundWebhookService } = makeEngine();
    outboundWebhookService.send.mockResolvedValue({
      id: 'delivery-id',
      status: WebhookDeliveryStatus.SUCCESS,
      responseStatus: 200,
      attemptCount: 1,
    });
    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_form_submit', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'webhook',
          type: 'action_webhook',
          position: { x: 0, y: 0 },
          data: {
            webhookUrl: 'https://example.test/webhook',
            method: 'POST',
            headers: [{ key: 'X-Test', value: 'yes' }],
            bodyTemplate: '{"name":"{{name}}"}',
            signingSecret: 'secret',
            maxAttempts: 2,
            timeoutMs: 5000,
          },
        },
      ],
      [{ id: 'e1', source: 'trigger', target: 'webhook' }],
    );

    const results = await engine.execute(flow, {
      eventName: 'responses.submitted',
      flowExecutionId: 'execution-id',
      fields: { name: 'Ana' },
    });

    expect(outboundWebhookService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://example.test/webhook',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Test': 'yes' },
        body: '{"name":"Ana"}',
        signingSecret: 'secret',
        maxAttempts: 2,
        timeoutMs: 5000,
        flowExecutionId: 'execution-id',
      }),
    );
    expect(results[1]).toEqual(
      expect.objectContaining({
        nodeId: 'webhook',
        status: 'success',
        output: {
          deliveryId: 'delivery-id',
          status: WebhookDeliveryStatus.SUCCESS,
          responseStatus: 200,
          attemptCount: 1,
        },
      }),
    );
  });

  it('metricsService.recordFlowExecution existe no mock (compatibilidade action_run_flow)', () => {
    const { metricsService } = makeEngine();
    expect(typeof metricsService.recordFlowExecution).toBe('function');
  });

  it('action_send_whatsapp chama WhatsAppConnectorService com mensagem e aprovação', async () => {
    const { engine, whatsappConnectorService } = makeEngine();
    whatsappConnectorService.sendToSolicitation.mockResolvedValue({
      id: 'whatsapp-message-id',
      externalMessageId: 'provider-message-id',
      status: 'sent',
      to: '5585999999999',
    });
    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_approval_completed', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'whatsapp',
          type: 'action_send_whatsapp',
          position: { x: 0, y: 0 },
          data: {
            recipientType: 'custom',
            customPhone: '{{phone}}',
            message: 'Aprovação da solicitação {{solicitation_title}}',
            includeApprovalLink: true,
          },
        },
      ],
      [{ id: 'e1', source: 'trigger', target: 'whatsapp' }],
    );

    const results = await engine.execute(flow, {
      eventName: 'approvals.approved',
      flowExecutionId: 'execution-id',
      fields: { phone: '5585999999999' },
      solicitation: makeSolicitation({ title: 'Compra' }),
      approval: { id: 'approval-id' } as FlowExecutionContext['approval'],
    });

    expect(whatsappConnectorService.sendToSolicitation).toHaveBeenCalledWith(
      'solicitation-id',
      'Aprovação da solicitação Compra',
      {
        recipientType: 'custom',
        customPhone: '5585999999999',
        approvalId: 'approval-id',
        flowExecutionId: 'execution-id',
      },
    );
    expect(results[1]).toEqual(
      expect.objectContaining({
        nodeId: 'whatsapp',
        status: 'success',
        output: {
          provider: 'whatsapp',
          whatsappMessageId: 'whatsapp-message-id',
          externalMessageId: 'provider-message-id',
          status: 'sent',
          to: '5585999999999',
        },
      }),
    );
  });
});

// ─── action_run_flow ────────────────────────────────────────────────────────────

function makeChildFlow(id = 'child-flow-id'): FlowEntity {
  return {
    id,
    formId: null,
    nodes: [
      { id: 'trigger', type: 'trigger_solicitation_created', position: { x: 0, y: 0 }, data: {} },
    ],
    edges: [],
  } as unknown as FlowEntity;
}

describe('FlowExecutionEngine — action_run_flow', () => {
  it('sync: executa fluxo filho e retorna childExecutionId no output', async () => {
    const { engine, flowsRepo } = makeEngine();
    const childFlow = makeChildFlow();
    flowsRepo.findOne.mockResolvedValue(childFlow);

    const parentFlow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_solicitation_created', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'run',
          type: 'action_run_flow',
          position: { x: 0, y: 0 },
          data: { flowId: 'child-flow-id', mode: 'sync', passContext: false },
        },
      ],
      [{ id: 'e1', source: 'trigger', target: 'run' }],
    );

    const results = await engine.execute(parentFlow, {
      eventName: 'solicitations.created',
      flowId: 'parent-flow-id',
      flowExecutionId: 'parent-exec-id',
    });

    expect(results).toHaveLength(2);
    expect(results[1].nodeId).toBe('run');
    expect(results[1].status).toBe('success');
    expect(results[1].output).toMatchObject({
      childExecutionId: 'child-exec-id',
      mode: 'sync',
    });
  });

  it('async: dispara filho e retorna imediatamente com mode=async', async () => {
    const { engine, flowsRepo } = makeEngine();
    flowsRepo.findOne.mockResolvedValue(makeChildFlow());

    const parentFlow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_solicitation_created', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'run',
          type: 'action_run_flow',
          position: { x: 0, y: 0 },
          data: { flowId: 'child-flow-id', mode: 'async', passContext: false },
        },
      ],
      [{ id: 'e1', source: 'trigger', target: 'run' }],
    );

    const results = await engine.execute(parentFlow, { eventName: 'test' });

    expect(results[1].status).toBe('success');
    expect(results[1].output).toMatchObject({ mode: 'async' });
  });

  it('recursão direta: fluxo A chama A → nó falha com erro de recursão', async () => {
    const { engine, flowsRepo } = makeEngine();
    flowsRepo.findOne.mockResolvedValue(makeChildFlow('flow-a'));

    const flowA = makeFlow(
      [
        { id: 'trigger', type: 'trigger_solicitation_created', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'run',
          type: 'action_run_flow',
          position: { x: 0, y: 0 },
          data: { flowId: 'flow-a', mode: 'sync', passContext: false },
        },
      ],
      [{ id: 'e1', source: 'trigger', target: 'run' }],
    );
    // flow-a está no callStack — simula que já foi chamado pelo pai
    const results = await engine.execute(flowA, {
      eventName: 'test',
      flowId: 'some-parent',
      callStack: ['flow-a'],
    });

    expect(results[1].status).toBe('failed');
    expect(results[1].error).toMatch(/Recursão detectada/);
  });

  it('profundidade > 5 niveis: nó falha com erro de profundidade máxima', async () => {
    const { engine, flowsRepo } = makeEngine();
    flowsRepo.findOne.mockResolvedValue(makeChildFlow());

    const deepFlow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_solicitation_created', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'run',
          type: 'action_run_flow',
          position: { x: 0, y: 0 },
          data: { flowId: 'child-flow-id', mode: 'sync', passContext: false },
        },
      ],
      [{ id: 'e1', source: 'trigger', target: 'run' }],
    );

    // callStack já com 5 entradas → próximo nível seria o 6º (acima do limite)
    const results = await engine.execute(deepFlow, {
      eventName: 'test',
      callStack: ['f1', 'f2', 'f3', 'f4', 'f5'],
    });

    expect(results[1].status).toBe('failed');
    expect(results[1].error).toMatch(/Profundidade máxima/);
  });

  it('fluxo filho inativo/inexistente: nó falha com mensagem adequada', async () => {
    const { engine, flowsRepo } = makeEngine();
    flowsRepo.findOne.mockResolvedValue(null); // não encontrado

    const parentFlow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_solicitation_created', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'run',
          type: 'action_run_flow',
          position: { x: 0, y: 0 },
          data: { flowId: 'nonexistent-flow-id', mode: 'sync', passContext: false },
        },
      ],
      [{ id: 'e1', source: 'trigger', target: 'run' }],
    );

    const results = await engine.execute(parentFlow, { eventName: 'test' });

    expect(results[1].status).toBe('failed');
    expect(results[1].error).toMatch(/não encontrado ou inativo/);
  });

  it('passContext=true: contexto pai é repassado ao filho', async () => {
    const { engine, flowsRepo, executionsRepo } = makeEngine();
    const childFlow = makeChildFlow();
    flowsRepo.findOne.mockResolvedValue(childFlow);

    const parentFlow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_solicitation_created', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'run',
          type: 'action_run_flow',
          position: { x: 0, y: 0 },
          data: { flowId: 'child-flow-id', mode: 'sync', passContext: true },
        },
      ],
      [{ id: 'e1', source: 'trigger', target: 'run' }],
    );

    await engine.execute(parentFlow, {
      eventName: 'solicitations.created',
      flowId: 'parent-flow-id',
      flowExecutionId: 'parent-exec-id',
      solicitation: makeSolicitation({ title: 'Compra Pai' }),
    });

    // createChildExecution deve receber o parentFlowId e parentExecutionId
    expect(executionsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        parentFlowId: 'parent-flow-id',
        parentExecutionId: 'parent-exec-id',
      }),
    );
  });

  it('flowId ausente: nó falha com erro de configuração', async () => {
    const { engine } = makeEngine();

    const parentFlow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_solicitation_created', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'run',
          type: 'action_run_flow',
          position: { x: 0, y: 0 },
          data: { flowId: '', mode: 'sync', passContext: false },
        },
      ],
      [{ id: 'e1', source: 'trigger', target: 'run' }],
    );

    const results = await engine.execute(parentFlow, { eventName: 'test' });

    expect(results[1].status).toBe('failed');
    expect(results[1].error).toMatch(/flowId não configurado/);
  });
});

describe('FlowExecutionEngine — action_http_check + condition_response_value', () => {
  beforeEach(() => {
    mockAxios.request.mockReset();
  });

  it('action_http_check captura a resposta JSON em ctx.metadata.lastCheckResponse', async () => {
    const { engine } = makeEngine();
    mockAxios.request.mockResolvedValue({ status: 200, data: JSON.stringify({ ok: true, count: 3 }) });

    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_scheduled', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'check',
          type: 'action_http_check',
          position: { x: 0, y: 0 },
          data: { url: 'https://api.example.com/status', method: 'GET' },
        },
      ],
      [{ id: 'e1', source: 'trigger', target: 'check' }],
    );

    const results = await engine.execute(flow, { eventName: 'flows.scheduled.tick' });

    expect(results[1].status).toBe('success');
    expect(mockAxios.request).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://api.example.com/status', method: 'GET' }),
    );
  });

  it('action_http_check falha o nó quando a resposta é >= 400', async () => {
    const { engine } = makeEngine();
    mockAxios.request.mockResolvedValue({ status: 500, data: 'erro interno' });

    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_scheduled', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'check',
          type: 'action_http_check',
          position: { x: 0, y: 0 },
          data: { url: 'https://api.example.com/status', method: 'GET' },
        },
      ],
      [{ id: 'e1', source: 'trigger', target: 'check' }],
    );

    const results = await engine.execute(flow, { eventName: 'flows.scheduled.tick' });

    expect(results[1].status).toBe('failed');
    expect(results[1].error).toMatch(/resposta 500/);
  });

  it('condition_response_value ramifica "yes" quando o valor resolvido bate com o esperado', async () => {
    const { engine } = makeEngine();
    mockAxios.request.mockResolvedValue({
      status: 200,
      data: JSON.stringify({ data: { status: 'aprovado' } }),
    });

    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_scheduled', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'check',
          type: 'action_http_check',
          position: { x: 0, y: 0 },
          data: { url: 'https://api.example.com/status', method: 'GET' },
        },
        {
          id: 'cond',
          type: 'condition_response_value',
          position: { x: 0, y: 0 },
          data: { path: 'data.status', operator: 'equals', value: 'aprovado' },
        },
        { ...terminalNode('yes-node') },
        { ...terminalNode('no-node') },
      ],
      [
        { id: 'e1', source: 'trigger', target: 'check' },
        { id: 'e2', source: 'check', target: 'cond' },
        { id: 'e3', source: 'cond', target: 'yes-node', sourceHandle: 'yes' },
        { id: 'e4', source: 'cond', target: 'no-node', sourceHandle: 'no' },
      ],
    );

    const results = await engine.execute(flow, { eventName: 'flows.scheduled.tick' });

    expect(results.find((r) => r.nodeId === 'cond')?.status).toBe('success');
    expect(results.some((r) => r.nodeId === 'yes-node')).toBe(true);
    expect(results.some((r) => r.nodeId === 'no-node')).toBe(false);
  });

  it('condition_response_value ramifica "no" e não quebra quando o path não existe', async () => {
    const { engine } = makeEngine();
    mockAxios.request.mockResolvedValue({ status: 200, data: JSON.stringify({ data: {} }) });

    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_scheduled', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'check',
          type: 'action_http_check',
          position: { x: 0, y: 0 },
          data: { url: 'https://api.example.com/status', method: 'GET' },
        },
        {
          id: 'cond',
          type: 'condition_response_value',
          position: { x: 0, y: 0 },
          data: { path: 'data.status', operator: 'equals', value: 'aprovado' },
        },
        { ...terminalNode('yes-node') },
        { ...terminalNode('no-node') },
      ],
      [
        { id: 'e1', source: 'trigger', target: 'check' },
        { id: 'e2', source: 'check', target: 'cond' },
        { id: 'e3', source: 'cond', target: 'yes-node', sourceHandle: 'yes' },
        { id: 'e4', source: 'cond', target: 'no-node', sourceHandle: 'no' },
      ],
    );

    const results = await engine.execute(flow, { eventName: 'flows.scheduled.tick' });

    expect(results.find((r) => r.nodeId === 'cond')?.status).toBe('success');
    expect(results.some((r) => r.nodeId === 'no-node')).toBe(true);
    expect(results.some((r) => r.nodeId === 'yes-node')).toBe(false);
  });
});

describe('FlowExecutionEngine — action_ai_agent', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function makeAttachment(overrides: Record<string, unknown> = {}) {
    return {
      id: 'attach-1',
      originalName: 'etiqueta.jpg',
      mimeType: 'image/jpeg',
      storagePath: 'solicitations/sol-1/etiqueta.jpg',
      validationResult: null,
      validatedAt: null,
      ...overrides,
    };
  }

  function makeResponse(status: number, body: unknown): Response {
    return {
      ok: status < 400,
      status,
      text: () => Promise.resolve(JSON.stringify(body)),
    } as unknown as Response;
  }

  it('falha imediatamente quando não há anexo no contexto', async () => {
    const { engine } = makeEngine();
    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_attachment_uploaded', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'agent',
          type: 'action_ai_agent',
          position: { x: 0, y: 0 },
          data: { baseUrl: 'https://api.example.com', agentSlug: 'validador', apiKey: 'key' },
        },
      ],
      [{ id: 'e1', source: 'trigger', target: 'agent' }],
    );

    const results = await engine.execute(flow, { eventName: 'attachments.uploaded' });

    expect(results[1].status).toBe('failed');
    expect(results[1].error).toMatch(/requer um anexo/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('envia o anexo como multipart, captura a resposta e persiste o veredito no anexo', async () => {
    const { engine, attachmentsRepo, storageService } = makeEngine();
    const verdict = { aprovada: true, lote: { valor: '26/268/01', status: 'OK' } };
    fetchSpy.mockResolvedValue(makeResponse(200, { sessionId: 's1', data: verdict }));

    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_attachment_uploaded', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'agent',
          type: 'action_ai_agent',
          position: { x: 0, y: 0 },
          data: {
            baseUrl: 'https://api.example.com/',
            agentSlug: 'validador-de-etiquetas',
            apiKey: 'secret-key',
            message: 'Analise essa imagem. lote {{lote}}.',
          },
        },
      ],
      [{ id: 'e1', source: 'trigger', target: 'agent' }],
    );

    const attachment = makeAttachment();
    const results = await engine.execute(flow, {
      eventName: 'attachments.uploaded',
      attachment: attachment as never,
      fields: { lote: '26/268/01' },
    });

    expect(storageService.readFile).toHaveBeenCalledWith('solicitations/sol-1/etiqueta.jpg');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.example.com/agents/validador-de-etiquetas/chat',
      expect.objectContaining({
        method: 'POST',
        headers: { 'X-API-Key': 'secret-key' },
      }),
    );
    expect(results[1].status).toBe('success');
    expect(attachmentsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ validationResult: verdict, validatedAt: expect.any(Date) }),
    );
  });

  it('grava a resposta em ctx.metadata.lastCheckResponse (mesmo formato de action_http_check)', async () => {
    const { engine } = makeEngine();
    fetchSpy.mockResolvedValue(makeResponse(200, { data: { aprovada: false } }));

    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_attachment_uploaded', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'agent',
          type: 'action_ai_agent',
          position: { x: 0, y: 0 },
          data: { baseUrl: 'https://api.example.com', agentSlug: 'validador', apiKey: 'key' },
        },
        {
          id: 'cond',
          type: 'condition_response_value',
          position: { x: 0, y: 0 },
          data: { path: 'aprovada', operator: 'equals', value: 'false' },
        },
        { ...terminalNode('yes-node') },
        { ...terminalNode('no-node') },
      ],
      [
        { id: 'e1', source: 'trigger', target: 'agent' },
        { id: 'e2', source: 'agent', target: 'cond' },
        { id: 'e3', source: 'cond', target: 'yes-node', sourceHandle: 'yes' },
        { id: 'e4', source: 'cond', target: 'no-node', sourceHandle: 'no' },
      ],
    );

    const results = await engine.execute(flow, {
      eventName: 'attachments.uploaded',
      attachment: makeAttachment() as never,
    });

    expect(results.some((r) => r.nodeId === 'yes-node')).toBe(true);
  });

  it('falha o nó quando o agente responde com erro', async () => {
    const { engine } = makeEngine();
    fetchSpy.mockResolvedValue(makeResponse(500, { message: 'erro interno' }));

    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_attachment_uploaded', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'agent',
          type: 'action_ai_agent',
          position: { x: 0, y: 0 },
          data: { baseUrl: 'https://api.example.com', agentSlug: 'validador', apiKey: 'key' },
        },
      ],
      [{ id: 'e1', source: 'trigger', target: 'agent' }],
    );

    const results = await engine.execute(flow, {
      eventName: 'attachments.uploaded',
      attachment: makeAttachment() as never,
    });

    expect(results[1].status).toBe('failed');
    expect(results[1].error).toMatch(/resposta 500/);
  });

  describe('URL do servidor (LOPS_AI_BASE_URL) e chave do nó', () => {
    function serverEnv(values: Record<string, string>) {
      return (key: string) => values[key];
    }

    function agentFlow(data: Record<string, unknown>) {
      return makeFlow(
        [
          { id: 'trigger', type: 'trigger_attachment_uploaded', position: { x: 0, y: 0 }, data: {} },
          { id: 'agent', type: 'action_ai_agent', position: { x: 0, y: 0 }, data },
        ],
        [{ id: 'e1', source: 'trigger', target: 'agent' }],
      );
    }

    it('nó novo (agente escolhido na lista + chave do nó) usa a URL do servidor e a chave do nó', async () => {
      const { engine, configService } = makeEngine();
      configService.get.mockImplementation(
        serverEnv({ LOPS_AI_BASE_URL: 'https://lops.example.com/api/v1/', LOPS_AI_API_KEY: 'chave-do-servidor' }),
      );
      fetchSpy.mockResolvedValue(makeResponse(200, { data: { aprovada: true } }));

      const results = await engine.execute(
        agentFlow({ agentSlug: 'validador-de-etiquetas', apiKey: 'chave-do-no' }),
        { eventName: 'attachments.uploaded', attachment: makeAttachment() as never },
      );

      expect(results[1].status).toBe('success');
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://lops.example.com/api/v1/agents/validador-de-etiquetas/chat',
        expect.objectContaining({ method: 'POST', headers: { 'X-API-Key': 'chave-do-no' } }),
      );
    });

    it('NUNCA usa a chave do servidor para executar: sem chave no nó, falha sem chamar o agente', async () => {
      const { engine, configService } = makeEngine();
      configService.get.mockImplementation(
        serverEnv({ LOPS_AI_BASE_URL: 'https://lops.example.com/api/v1', LOPS_AI_API_KEY: 'chave-do-servidor' }),
      );

      const results = await engine.execute(agentFlow({ agentSlug: 'validador-de-etiquetas' }), {
        eventName: 'attachments.uploaded',
        attachment: makeAttachment() as never,
      });

      expect(results[1].status).toBe('failed');
      expect(results[1].error).toMatch(/chave de API/);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('chave do nó só com espaços conta como ausente (não cai na chave do servidor)', async () => {
      const { engine, configService } = makeEngine();
      configService.get.mockImplementation(
        serverEnv({ LOPS_AI_BASE_URL: 'https://lops.example.com/api/v1', LOPS_AI_API_KEY: 'chave-do-servidor' }),
      );

      const results = await engine.execute(agentFlow({ agentSlug: 'validador', apiKey: '   ' }), {
        eventName: 'attachments.uploaded',
        attachment: makeAttachment() as never,
      });

      expect(results[1].status).toBe('failed');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('nó antigo com baseUrl próprio continua usando a URL dele em vez da do servidor', async () => {
      const { engine, configService } = makeEngine();
      configService.get.mockImplementation(serverEnv({ LOPS_AI_BASE_URL: 'https://lops.example.com/api/v1' }));
      fetchSpy.mockResolvedValue(makeResponse(200, { data: { aprovada: true } }));

      await engine.execute(
        agentFlow({ baseUrl: 'https://legado.example.com', agentSlug: 'validador', apiKey: 'legacy-key' }),
        { eventName: 'attachments.uploaded', attachment: makeAttachment() as never },
      );

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://legado.example.com/agents/validador/chat',
        expect.objectContaining({ headers: { 'X-API-Key': 'legacy-key' } }),
      );
    });

    it('falha com mensagem clara quando não há URL (nem no nó nem no servidor)', async () => {
      const { engine, configService } = makeEngine();
      configService.get.mockImplementation(serverEnv({}));

      const results = await engine.execute(agentFlow({ agentSlug: 'validador', apiKey: 'chave-do-no' }), {
        eventName: 'attachments.uploaded',
        attachment: makeAttachment() as never,
      });

      expect(results[1].status).toBe('failed');
      expect(results[1].error).toMatch(/LOPS_AI_BASE_URL/);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('falha quando nenhum agente foi escolhido no nó', async () => {
      const { engine } = makeEngine();

      const results = await engine.execute(agentFlow({ apiKey: 'chave-do-no' }), {
        eventName: 'attachments.uploaded',
        attachment: makeAttachment() as never,
      });

      expect(results[1].status).toBe('failed');
      expect(results[1].error).toMatch(/requer agentSlug/);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('codifica o slug na URL, para um slug estranho não alterar o caminho chamado', async () => {
      const { engine, configService } = makeEngine();
      configService.get.mockImplementation(serverEnv({ LOPS_AI_BASE_URL: 'https://lops.example.com/api/v1' }));
      fetchSpy.mockResolvedValue(makeResponse(200, { data: { aprovada: true } }));

      await engine.execute(agentFlow({ agentSlug: '../admin?x=1', apiKey: 'k' }), {
        eventName: 'attachments.uploaded',
        attachment: makeAttachment() as never,
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://lops.example.com/api/v1/agents/..%2Fadmin%3Fx%3D1/chat',
        expect.anything(),
      );
    });
  });
});

describe('FlowExecutionEngine — action_create_approval com scope: phase', () => {
  it('cria a aprovação escopada à fase (ctx.metadata.phaseId) e roteia pelo perfil da fase', async () => {
    const { engine, approvalsService } = makeEngine();
    approvalsService.createApproval.mockResolvedValue({ id: 'approval-id', phaseId: 'phase-1' });

    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_attachment_uploaded', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'action',
          type: 'action_create_approval',
          position: { x: 0, y: 0 },
          data: {
            title: 'Aprovação de fase: {{phase_label}}',
            scope: 'phase',
            approverSourceMode: 'phase_role',
          },
        },
      ],
      [{ id: 'e1', source: 'trigger', target: 'action' }],
    );

    await engine.execute(flow, {
      eventName: 'attachments.uploaded',
      solicitation: makeSolicitation(),
      metadata: { phaseId: 'phase-1', approverRoleCode: 'supervisor' },
    });

    expect(approvalsService.createApproval).toHaveBeenCalledWith(
      'solicitation-id',
      expect.objectContaining({
        assignedRoleCodes: ['supervisor'],
        phaseId: 'phase-1',
      }),
      null,
    );
  });

  it('modo aprovador da fase manda perfis E usuários da fase para a aprovação', async () => {
    const { engine, approvalsService, approvalsRepo } = makeEngine();
    approvalsRepo.findOne.mockResolvedValue(null);
    approvalsService.createApproval.mockResolvedValue({ id: 'approval-id' });
    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_phase_field_saved', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'action',
          type: 'action_create_approval',
          position: { x: 0, y: 0 },
          data: { title: 'Aprovação', scope: 'phase', approverSourceMode: 'phase_role' },
        },
      ],
      [{ id: 'e1', source: 'trigger', target: 'action' }],
    );

    await engine.execute(flow, {
      eventName: 'solicitations.phase_fields_saved',
      solicitation: makeSolicitation(),
      metadata: {
        phaseId: 'phase-fin',
        approverRoleCode: 'financeiro',
        approverRoleCodes: ['financeiro', 'diretoria'],
        approverUserIds: ['user-ana'],
      },
    });

    expect(approvalsService.createApproval).toHaveBeenCalledWith(
      'solicitation-id',
      expect.objectContaining({
        assignedRoleCodes: ['financeiro', 'diretoria'],
        assignedUserIds: ['user-ana'],
        phaseId: 'phase-fin',
      }),
      null,
    );
  });

  it('regra de aprovação: no modo da fase vale a regra da fase; nos outros, a do nó', async () => {
    const { engine, approvalsService, approvalsRepo } = makeEngine();
    approvalsRepo.findOne.mockResolvedValue(null);
    approvalsService.createApproval.mockResolvedValue({ id: 'approval-id' });
    const run = (data: Record<string, unknown>, metadata: Record<string, unknown>) =>
      engine.execute(
        makeFlow(
          [
            { id: 'trigger', type: 'trigger_phase_field_saved', position: { x: 0, y: 0 }, data: {} },
            { id: 'action', type: 'action_create_approval', position: { x: 0, y: 0 }, data: { title: 'A', ...data } },
          ],
          [{ id: 'e1', source: 'trigger', target: 'action' }],
        ),
        { eventName: 'solicitations.phase_fields_saved', solicitation: makeSolicitation(), metadata },
      );

    await run(
      { scope: 'phase', approverSourceMode: 'phase_role', approvalRule: 'any' },
      {
        phaseId: 'phase-fin',
        approverRoleCodes: ['gerente'],
        approverUserIds: ['user-ana'],
        approvalMode: 'sequential',
        approverOrder: ['user:user-ana', 'role:gerente'],
      },
    );
    expect(approvalsService.createApproval).toHaveBeenLastCalledWith(
      'solicitation-id',
      expect.objectContaining({ mode: 'sequential', requireAll: true, assigneeOrder: ['user:user-ana', 'role:gerente'] }),
      null,
    );

    await run({ approverSourceMode: 'fixed', assignedUserIds: ['u-1', 'u-2'], approvalRule: 'all' }, {});
    expect(approvalsService.createApproval).toHaveBeenLastCalledWith(
      'solicitation-id',
      expect.objectContaining({ mode: 'parallel', requireAll: true }),
      null,
    );

    // Nó antigo: o "Modo sequencial" do editor passa a valer.
    await run({ approverSourceMode: 'fixed', assignedUserIds: ['u-1', 'u-2'], approvalMode: 'sequential' }, {});
    expect(approvalsService.createApproval).toHaveBeenLastCalledWith(
      'solicitation-id',
      expect.objectContaining({ mode: 'sequential', requireAll: true }),
      null,
    );

    await run({ approverSourceMode: 'fixed', assignedUserIds: ['u-1', 'u-2'] }, {});
    expect(approvalsService.createApproval).toHaveBeenLastCalledWith(
      'solicitation-id',
      expect.not.objectContaining({ requireAll: true }),
      null,
    );
  });

  it('não considera uma aprovação de OUTRA fase como duplicata (dedupe escopado por fase)', async () => {
    const { engine, approvalsService, approvalsRepo } = makeEngine();
    approvalsRepo.findOne.mockResolvedValue(null); // nenhuma aprovação PARA ESTA fase
    approvalsService.createApproval.mockResolvedValue({ id: 'approval-id' });

    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_attachment_uploaded', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'action',
          type: 'action_create_approval',
          position: { x: 0, y: 0 },
          data: { title: 'Aprovação', scope: 'phase', approverSourceMode: 'phase_role' },
        },
      ],
      [{ id: 'e1', source: 'trigger', target: 'action' }],
    );

    await engine.execute(flow, {
      eventName: 'attachments.uploaded',
      solicitation: makeSolicitation(),
      metadata: { phaseId: 'phase-3', approverRoleCode: 'supervisor' },
    });

    expect(approvalsRepo.findOne).toHaveBeenCalledWith({
      where: { solicitationId: 'solicitation-id', phaseId: 'phase-3', title: 'Aprovação' },
    });
    expect(approvalsService.createApproval).toHaveBeenCalled();
  });

  it('falha com mensagem clara quando scope é phase mas não há phaseId no contexto', async () => {
    const { engine } = makeEngine();
    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_attachment_uploaded', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'action',
          type: 'action_create_approval',
          position: { x: 0, y: 0 },
          data: { title: 'X', scope: 'phase', approverSourceMode: 'phase_role' },
        },
      ],
      [{ id: 'e1', source: 'trigger', target: 'action' }],
    );

    const results = await engine.execute(flow, {
      eventName: 'attachments.uploaded',
      solicitation: makeSolicitation(),
    });

    expect(results[1].status).toBe('failed');
    expect(results[1].error).toMatch(/fase no contexto/);
  });

  describe('"Avisar quem aprova por e-mail"', () => {
    function approvalFlow(emailApprovers?: Record<string, unknown>) {
      return makeFlow(
        [
          { id: 'trigger', type: 'trigger_solicitation_created', position: { x: 0, y: 0 }, data: {} },
          {
            id: 'aprovar',
            type: 'action_create_approval',
            position: { x: 0, y: 0 },
            data: { title: 'Retirar de rota', assignedUserIds: ['user-1'], ...(emailApprovers ? { emailApprovers } : {}) },
          },
        ],
        [{ id: 'e1', source: 'trigger', target: 'aprovar' }],
      );
    }

    it('ligado: e-mail em segundo plano para quem decide agora, com o texto do nó e chave pela aprovação', async () => {
      const { engine, approvalsService, approvalsRepo, notificationExecutor } = makeEngine();
      approvalsRepo.findOne.mockResolvedValue(null);
      approvalsService.createApproval.mockResolvedValue({ id: 'approval-1', status: 'pending', title: 'Retirar de rota' });
      approvalsService.pendingApproverUserIds.mockResolvedValue(['user-1', 'user-2']);
      notificationExecutor.execute.mockResolvedValue({ status: 'queued' });

      const results = await engine.execute(
        approvalFlow({ enabled: true, subject: 'Aprovar: {{approval_title}}', body: 'Decida em {{approval_link}}' }),
        { eventName: 'solicitations.created', solicitation: makeSolicitation() },
      );

      expect(approvalsService.pendingApproverUserIds).toHaveBeenCalledWith('approval-1');
      expect(notificationExecutor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'email',
          recipients: [{ type: 'users', userIds: ['user-1', 'user-2'] }],
          title: 'Aprovar: {{approval_title}}',
          content: 'Decida em {{approval_link}}',
          deliveryMode: 'background',
          idempotencyKeyTemplate: 'aprovacao-email-approval-1',
        }),
        expect.objectContaining({ approval: expect.objectContaining({ id: 'approval-1' }) }),
        'aprovar:email',
      );
      expect(results.find((r) => r.nodeId === 'aprovar')?.output).toMatchObject({
        paused: true,
        approvalId: 'approval-1',
        approverEmailsQueued: 2,
      });
    });

    it('sem assunto/texto usa o padrão; desligado não envia', async () => {
      const { engine, approvalsService, approvalsRepo, notificationExecutor } = makeEngine();
      approvalsRepo.findOne.mockResolvedValue(null);
      approvalsService.createApproval.mockResolvedValue({ id: 'approval-2', status: 'pending', title: 'X' });
      approvalsService.pendingApproverUserIds.mockResolvedValue(['user-1']);

      await engine.execute(approvalFlow({ enabled: true }), { eventName: 'solicitations.created', solicitation: makeSolicitation() });
      expect(notificationExecutor.execute.mock.calls[0][0]).toMatchObject({
        title: 'Aprovação pendente: {{approval_title}}',
        content: expect.stringContaining('{{approval_link}}'),
      });

      notificationExecutor.execute.mockClear();
      approvalsRepo.findOne.mockResolvedValue(null);
      await engine.execute(approvalFlow({ enabled: false }), { eventName: 'solicitations.created', solicitation: makeSolicitation() });
      expect(notificationExecutor.execute).not.toHaveBeenCalled();
    });

    it('falha no aviso não derruba o nó: a aprovação existe e o fluxo pausa nela', async () => {
      const { engine, approvalsService, approvalsRepo, notificationExecutor } = makeEngine();
      approvalsRepo.findOne.mockResolvedValue(null);
      approvalsService.createApproval.mockResolvedValue({ id: 'approval-3', status: 'pending', title: 'X' });
      approvalsService.pendingApproverUserIds.mockResolvedValue(['user-1']);
      notificationExecutor.execute.mockRejectedValue(new Error('SMTP fora'));

      const results = await engine.execute(approvalFlow({ enabled: true }), {
        eventName: 'solicitations.created',
        solicitation: makeSolicitation(),
      });
      expect(results.find((r) => r.nodeId === 'aprovar')).toMatchObject({
        status: 'success',
        output: { paused: true, approvalId: 'approval-3' },
      });
    });
  });

  it('"Mover para fase" leva o fluxo para a fase de destino: a aprovação de fase seguinte vai para quem aprova ELA', async () => {
    const { engine, approvalsService, approvalsRepo, solicitationsService } = makeEngine();
    approvalsRepo.findOne.mockResolvedValue(null);
    approvalsService.createApproval.mockResolvedValue({ id: 'approval-id' });
    solicitationsService.movePhase.mockResolvedValue(makeSolicitation({ currentPhaseId: 'phase-log' }));
    solicitationsService.findKanbanPhase.mockResolvedValue({
      id: 'phase-log',
      label: 'Logística',
      approvers: { roleCodes: ['logistica'], userIds: ['user-chefe'] },
      approverRoleCode: 'logistica',
    });

    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_solicitation_created', position: { x: 0, y: 0 }, data: {} },
        { id: 'mover', type: 'action_move_phase', position: { x: 0, y: 0 }, data: { phaseId: 'phase-log' } },
        {
          id: 'aprovar',
          type: 'action_create_approval',
          position: { x: 0, y: 0 },
          data: { title: 'Retirar de rota', scope: 'phase', approverSourceMode: 'phase_role' },
        },
      ],
      [
        { id: 'e1', source: 'trigger', target: 'mover' },
        { id: 'e2', source: 'mover', target: 'aprovar' },
      ],
    );

    const results = await engine.execute(flow, {
      eventName: 'solicitations.created',
      solicitation: makeSolicitation(),
      metadata: {},
    });

    expect(solicitationsService.findKanbanPhase).toHaveBeenCalledWith('phase-log');
    expect(results.find((r) => r.nodeId === 'mover')).toMatchObject({
      status: 'success',
      output: { phaseId: 'phase-log', phaseLabel: 'Logística' },
    });
    expect(approvalsService.createApproval).toHaveBeenCalledWith(
      'solicitation-id',
      expect.objectContaining({
        phaseId: 'phase-log',
        assignedRoleCodes: ['logistica'],
        assignedUserIds: ['user-chefe'],
      }),
      null,
    );
  });
});

describe('FlowExecutionEngine — condition_approval_result', () => {
  function makeConditionFlow(): FlowEntity {
    return makeFlow(
      [
        { id: 'trigger', type: 'trigger_attachment_uploaded', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'cond',
          type: 'condition_approval_result',
          position: { x: 0, y: 0 },
          data: { operator: 'equals', value: 'approved' },
        },
        { ...terminalNode('yes-node') },
        { ...terminalNode('no-node') },
      ],
      [
        { id: 'e1', source: 'trigger', target: 'cond' },
        { id: 'e2', source: 'cond', target: 'yes-node', sourceHandle: 'yes' },
        { id: 'e3', source: 'cond', target: 'no-node', sourceHandle: 'no' },
      ],
    );
  }

  it('ramifica "yes" quando ctx.approval.status é approved', async () => {
    const { engine } = makeEngine();

    const results = await engine.execute(makeConditionFlow(), {
      eventName: 'attachments.uploaded',
      approval: { status: ApprovalStatus.APPROVED } as never,
    });

    expect(results.find((r) => r.nodeId === 'cond')?.status).toBe('success');
    expect(results.some((r) => r.nodeId === 'yes-node')).toBe(true);
    expect(results.some((r) => r.nodeId === 'no-node')).toBe(false);
  });

  it('ramifica "no" quando ctx.approval.status é rejected', async () => {
    const { engine } = makeEngine();

    const results = await engine.execute(makeConditionFlow(), {
      eventName: 'attachments.uploaded',
      approval: { status: ApprovalStatus.REJECTED } as never,
    });

    expect(results.some((r) => r.nodeId === 'no-node')).toBe(true);
    expect(results.some((r) => r.nodeId === 'yes-node')).toBe(false);
  });

  it('ramifica "no" quando não há aprovação alguma no contexto', async () => {
    const { engine } = makeEngine();

    const results = await engine.execute(makeConditionFlow(), {
      eventName: 'attachments.uploaded',
    });

    expect(results.some((r) => r.nodeId === 'no-node')).toBe(true);
    expect(results.some((r) => r.nodeId === 'yes-node')).toBe(false);
  });

  it('operador not_equals inverte a ramificação', async () => {
    const { engine } = makeEngine();
    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_attachment_uploaded', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'cond',
          type: 'condition_approval_result',
          position: { x: 0, y: 0 },
          data: { operator: 'not_equals', value: 'approved' },
        },
        { ...terminalNode('yes-node') },
        { ...terminalNode('no-node') },
      ],
      [
        { id: 'e1', source: 'trigger', target: 'cond' },
        { id: 'e2', source: 'cond', target: 'yes-node', sourceHandle: 'yes' },
        { id: 'e3', source: 'cond', target: 'no-node', sourceHandle: 'no' },
      ],
    );

    const results = await engine.execute(flow, {
      eventName: 'attachments.uploaded',
      approval: { status: ApprovalStatus.REJECTED } as never,
    });

    expect(results.some((r) => r.nodeId === 'yes-node')).toBe(true);
    expect(results.some((r) => r.nodeId === 'no-node')).toBe(false);
  });
});

describe('FlowExecutionEngine — action_wait_for_phase_fields', () => {
  it('pausa a execução com waitingPhaseId e não segue para os filhos', async () => {
    const { engine } = makeEngine();
    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_attachment_uploaded', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'wait',
          type: 'action_wait_for_phase_fields',
          position: { x: 0, y: 0 },
          data: { phaseId: 'phase-quantidade' },
        },
        { ...terminalNode('after-wait') },
      ],
      [
        { id: 'e1', source: 'trigger', target: 'wait' },
        { id: 'e2', source: 'wait', target: 'after-wait' },
      ],
    );

    const results = await engine.execute(flow, {
      eventName: 'attachments.uploaded',
      solicitation: makeSolicitation(),
    });

    const waitResult = results.find((r) => r.nodeId === 'wait');
    expect(waitResult?.status).toBe('success');
    expect(waitResult && isPausedPhaseFieldsResult(waitResult)).toBe(true);
    expect(results.some((r) => r.nodeId === 'after-wait')).toBe(false);
  });

  it('falha com mensagem clara quando o nó não tem phaseId configurado', async () => {
    const { engine } = makeEngine();
    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_attachment_uploaded', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'wait',
          type: 'action_wait_for_phase_fields',
          position: { x: 0, y: 0 },
          data: {},
        },
      ],
      [{ id: 'e1', source: 'trigger', target: 'wait' }],
    );

    const results = await engine.execute(flow, { eventName: 'attachments.uploaded' });

    expect(results[1].status).toBe('failed');
    expect(results[1].error).toMatch(/phaseId/);
  });

  it('resumeFrom continua para os filhos do nó de espera sem re-executá-lo', async () => {
    const { engine } = makeEngine();
    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_attachment_uploaded', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'wait',
          type: 'action_wait_for_phase_fields',
          position: { x: 0, y: 0 },
          data: { phaseId: 'phase-quantidade' },
        },
        { ...terminalNode('after-wait') },
      ],
      [
        { id: 'e1', source: 'trigger', target: 'wait' },
        { id: 'e2', source: 'wait', target: 'after-wait' },
      ],
    );

    const results = await engine.resumeFrom(flow, 'wait', {
      eventName: 'solicitations.phase_fields_saved',
      solicitation: makeSolicitation(),
    });

    expect(results.some((r) => r.nodeId === 'wait')).toBe(false);
    expect(results.some((r) => r.nodeId === 'after-wait')).toBe(true);
  });
});

describe('FlowExecutionEngine — action_move_phase', () => {
  it('chama movePhase com o phaseId do nó', async () => {
    const { engine, solicitationsService } = makeEngine();
    const updated = makeSolicitation({ currentPhaseId: 'phase-concluido' } as never);
    solicitationsService.movePhase.mockResolvedValue(updated);
    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_attachment_uploaded', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'move',
          type: 'action_move_phase',
          position: { x: 0, y: 0 },
          data: { phaseId: 'phase-concluido', phaseLabel: 'Concluído' },
        },
      ],
      [{ id: 'e1', source: 'trigger', target: 'move' }],
    );

    const results = await engine.execute(flow, {
      eventName: 'attachments.uploaded',
      solicitation: makeSolicitation(),
    });

    // A profundidade vai junto: o "Entrou na fase" que este movimento dispara conta como encadeado.
    // E o movimento é do processo: aprovação de fase reprovada não segura o ramo "Não" do fluxo.
    expect(solicitationsService.movePhase).toHaveBeenCalledWith(
      'solicitation-id',
      { phaseId: 'phase-concluido' },
      null,
      { flowEventDepth: 1, byAutomation: true },
    );
    expect(results.find((r) => r.nodeId === 'move')?.status).toBe('success');
  });

  it('falha com mensagem clara quando o nó não tem phaseId configurado', async () => {
    const { engine, solicitationsService } = makeEngine();
    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_attachment_uploaded', position: { x: 0, y: 0 }, data: {} },
        { id: 'move', type: 'action_move_phase', position: { x: 0, y: 0 }, data: {} },
      ],
      [{ id: 'e1', source: 'trigger', target: 'move' }],
    );

    const results = await engine.execute(flow, {
      eventName: 'attachments.uploaded',
      solicitation: makeSolicitation(),
    });

    expect(results[1].status).toBe('failed');
    expect(results[1].error).toMatch(/phaseId/);
    expect(solicitationsService.movePhase).not.toHaveBeenCalled();
  });

  it('propaga o erro do gate de aprovação quando a fase atual exige aprovação pendente', async () => {
    const { engine, solicitationsService } = makeEngine();
    solicitationsService.movePhase.mockRejectedValue(
      new Error('A fase atual ("Quantidade produzida") exige aprovação antes de avançar.'),
    );
    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_attachment_uploaded', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'move',
          type: 'action_move_phase',
          position: { x: 0, y: 0 },
          data: { phaseId: 'phase-concluido' },
        },
      ],
      [{ id: 'e1', source: 'trigger', target: 'move' }],
    );

    const results = await engine.execute(flow, {
      eventName: 'attachments.uploaded',
      solicitation: makeSolicitation(),
    });

    expect(results[1].status).toBe('failed');
    expect(results[1].error).toMatch(/exige aprovação/);
  });
});

// ─── Defeitos conhecidos do módulo Fluxo ────────────────────────────────────────────────────
// Diagnóstico da suíte (ver documento "Diagnóstico da suíte de testes do módulo Fluxo"): os testes
// marcados com [P-xx] descrevem o comportamento CORRETO e falham hoje — cada um reproduz o
// defeito de mesmo número e fica verde quando a correção entra. Os casos sem marcação são
// contraprovas que já passam e protegem o que a correção não pode quebrar.

describe('FlowExecutionEngine — condition_field_value (operadores)', () => {
  async function ramosExecutados(fields: Record<string, unknown>, data: Record<string, unknown>) {
    const { engine } = makeEngine();
    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_form_submit', position: { x: 0, y: 0 }, data: {} },
        { id: 'cond', type: 'condition_field_value', position: { x: 0, y: 0 }, data: data as never },
        terminalNode('yes-node'),
        terminalNode('no-node'),
      ],
      [
        { id: 'e1', source: 'trigger', target: 'cond' },
        { id: 'e2', source: 'cond', sourceHandle: 'yes', target: 'yes-node' },
        { id: 'e3', source: 'cond', sourceHandle: 'no', target: 'no-node' },
      ],
    );

    const results = await engine.execute(flow, { eventName: 'responses.submitted', fields });

    return results.map((r) => r.nodeId).filter((id) => id === 'yes-node' || id === 'no-node');
  }

  type Caso = [
    descricao: string,
    valorDoCampo: unknown,
    operador: string,
    valorConfigurado: string | undefined,
    ramoEsperado: 'yes-node' | 'no-node',
  ];

  const casos: Caso[] = [
    // Texto
    ['equals: valores iguais seguem por "sim"', 'aprovado', 'equals', 'aprovado', 'yes-node'],
    ['equals: valores diferentes seguem por "não"', 'rejeitado', 'equals', 'aprovado', 'no-node'],
    ['not_equals: valores diferentes seguem por "sim"', 'rejeitado', 'not_equals', 'aprovado', 'yes-node'],
    ['contains: trecho presente segue por "sim"', 'pedido urgente', 'contains', 'urgente', 'yes-node'],
    ['contains: trecho ausente segue por "não"', 'pedido normal', 'contains', 'urgente', 'no-node'],
    ['is_empty: campo nulo segue por "sim"', null, 'is_empty', undefined, 'yes-node'],
    ['is_empty: texto vazio segue por "sim"', '', 'is_empty', undefined, 'yes-node'],
    ['is_empty: campo preenchido segue por "não"', 'x', 'is_empty', undefined, 'no-node'],
    ['is_not_empty: campo preenchido segue por "sim"', 'x', 'is_not_empty', undefined, 'yes-node'],
    ['is_not_empty: campo nulo segue por "não"', null, 'is_not_empty', undefined, 'no-node'],
    // Números que já funcionam
    ['greater_than: inteiro maior', '18500', 'greater_than', '10000', 'yes-node'],
    ['greater_than: compara como número, não como texto ("9" não é maior que "10")', '9', 'greater_than', '10', 'no-node'],
    ['greater_than: formato pt-BR com milhar e vírgula', '18.500,00', 'greater_than', '10000', 'yes-node'],
    ['less_than: formato pt-BR com milhar e vírgula', '1.234,56', 'less_than', '2000', 'yes-node'],
    ['less_than: decimal pt-BR só com vírgula', '0,5', 'less_than', '1', 'yes-node'],
    ['greater_than: texto não numérico nunca é maior', 'abc', 'greater_than', '10', 'no-node'],
    // [P-03] Ponto decimal lido como separador de milhar: "18500.00" vira 1.850.000
    ['[P-03] greater_than: "18500.00" é igual a "18500", não maior', '18500.00', 'greater_than', '18500', 'no-node'],
    ['[P-03] less_than: "18500.00" é menor que "20000"', '18500.00', 'less_than', '20000', 'yes-node'],
    ['[P-03] less_than: "0.5" é menor que "1"', '0.5', 'less_than', '1', 'yes-node'],
    ['[P-03] greater_than: "1.5" não é maior que "2"', '1.5', 'greater_than', '2', 'no-node'],
    // Campo numérico com fração (coluna value_number é double precision): chega como 18500.5
    ['[P-03] less_than: número 18500.5 é menor que "20000"', 18500.5, 'less_than', '20000', 'yes-node'],
  ];

  it.each(casos)('%s', async (_descricao, valorDoCampo, operator, value, ramoEsperado) => {
    const ramos = await ramosExecutados(
      { valor: valorDoCampo },
      { fieldCode: 'valor', operator, value },
    );

    expect(ramos).toEqual([ramoEsperado]);
  });
});

describe('FlowExecutionEngine — action_create_approval em sequência', () => {
  function fluxoComDuasAlcadas(): FlowEntity {
    return makeFlow(
      [
        { id: 'trigger', type: 'trigger_solicitation_moved', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'alcada-1',
          type: 'action_create_approval',
          position: { x: 0, y: 0 },
          data: { title: 'Alçada gerente', assignedUserIds: ['gerente'] },
        },
        {
          id: 'alcada-2',
          type: 'action_create_approval',
          position: { x: 0, y: 0 },
          data: { title: 'Alçada diretor', assignedUserIds: ['diretor'] },
        },
        terminalNode('liberar'),
      ],
      [
        { id: 'e1', source: 'trigger', target: 'alcada-1' },
        { id: 'e2', source: 'alcada-1', target: 'alcada-2' },
        { id: 'e3', source: 'alcada-2', target: 'liberar' },
      ],
    );
  }

  it('[P-06] a 2ª alçada do mesmo fluxo é criada e pausa, mesmo com a 1ª já decidida na solicitação', async () => {
    const { engine, approvalsService, approvalsRepo } = makeEngine();
    const primeira = { id: 'approval-1', status: ApprovalStatus.APPROVED };
    // A busca por solicitação devolve a 1ª aprovação, que este mesmo fluxo acabou de consumir.
    approvalsRepo.findOne.mockResolvedValue(primeira);
    approvalsService.createApproval.mockResolvedValue({
      id: 'approval-2',
      status: ApprovalStatus.PENDING,
    });

    // Retomada logo depois da decisão da 1ª: ctx.approval é a aprovação já consumida.
    const results = await engine.resumeFrom(fluxoComDuasAlcadas(), 'alcada-1', {
      eventName: 'approvals.resume',
      solicitation: makeSolicitation({ status: SolicitationStatus.APPROVED }),
      approval: primeira as never,
    });

    expect(approvalsService.createApproval).toHaveBeenCalledTimes(1);
    expect(approvalsService.createApproval).toHaveBeenCalledWith(
      'solicitation-id',
      expect.objectContaining({ title: 'Alçada diretor' }),
      null,
    );
    const alcada2 = results.find((r) => r.nodeId === 'alcada-2');
    expect(alcada2 && isPausedApprovalResult(alcada2)).toBe(true);
    expect(results.map((r) => r.nodeId)).not.toContain('liberar');
  });

  it('procura a aprovação já existente pelo título da própria alçada (3ª alçada não confunde com a 1ª)', async () => {
    const { engine, approvalsService, approvalsRepo } = makeEngine();
    // Banco com a 1ª e a 2ª alçadas já decididas: só devolve a aprovação cujo título bate.
    const salvas = [
      { id: 'approval-1', title: 'Alçada gerente', status: ApprovalStatus.APPROVED },
      { id: 'approval-2', title: 'Alçada diretor', status: ApprovalStatus.APPROVED },
    ];
    approvalsRepo.findOne.mockImplementation(({ where }: { where: { title?: string } }) =>
      Promise.resolve(salvas.find((a) => a.title === where.title) ?? null),
    );
    approvalsService.createApproval.mockResolvedValue({ id: 'approval-3', status: ApprovalStatus.PENDING });
    const flow = makeFlow(
      [
        ...fluxoComDuasAlcadas().nodes.filter((n) => n.id !== 'liberar'),
        {
          id: 'alcada-3',
          type: 'action_create_approval',
          position: { x: 0, y: 0 },
          data: { title: 'Alçada presidente', assignedUserIds: ['presidente'] },
        },
      ],
      [...fluxoComDuasAlcadas().edges.filter((e) => e.target !== 'liberar'), { id: 'e3', source: 'alcada-2', target: 'alcada-3' }],
    );

    await engine.resumeFrom(flow, 'alcada-2', {
      eventName: 'approvals.resume',
      solicitation: makeSolicitation({ status: SolicitationStatus.APPROVED }),
      approval: salvas[1] as never,
    });

    expect(approvalsRepo.findOne).toHaveBeenCalledWith({
      where: { solicitationId: 'solicitation-id', title: 'Alçada presidente' },
    });
    expect(approvalsService.createApproval).toHaveBeenCalledWith(
      'solicitation-id',
      expect.objectContaining({ title: 'Alçada presidente' }),
      null,
    );
  });

  it('um replay (sem aprovação consumida no contexto) continua sem criar aprovação duplicada', async () => {
    const { engine, approvalsService, approvalsRepo } = makeEngine();
    approvalsRepo.findOne.mockResolvedValue({ id: 'approval-1', status: ApprovalStatus.APPROVED });

    await engine.execute(fluxoComDuasAlcadas(), {
      eventName: 'solicitations.moved',
      solicitation: makeSolicitation(),
    });

    expect(approvalsService.createApproval).not.toHaveBeenCalled();
  });
});

describe('FlowExecutionEngine — action_run_flow com sub-fluxo que pausa', () => {
  it('[P-04] registra a execução do filho como waiting_approval, com approvalId e pausedNodeId, e não como success', async () => {
    const { engine, flowsRepo, executionsRepo, approvalsService } = makeEngine();
    approvalsService.createApproval.mockResolvedValue({
      id: 'child-approval',
      status: ApprovalStatus.PENDING,
    });
    const filho = {
      id: 'child-flow-id',
      formId: null,
      nodes: [
        { id: 'child-trigger', type: 'trigger_solicitation_created', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'child-approval-node',
          type: 'action_create_approval',
          position: { x: 0, y: 0 },
          data: { title: 'Aprovar no filho', assignedUserIds: ['approver-id'] },
        },
        terminalNode('child-after'),
      ],
      edges: [
        { id: 'c1', source: 'child-trigger', target: 'child-approval-node' },
        { id: 'c2', source: 'child-approval-node', target: 'child-after' },
      ],
    } as unknown as FlowEntity;
    flowsRepo.findOne.mockResolvedValue(filho);
    const pai = makeFlow(
      [
        { id: 'trigger', type: 'trigger_solicitation_created', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'run',
          type: 'action_run_flow',
          position: { x: 0, y: 0 },
          data: { flowId: 'child-flow-id', mode: 'sync', passContext: true },
        },
      ],
      [{ id: 'e1', source: 'trigger', target: 'run' }],
    );

    await engine.execute(pai, {
      eventName: 'solicitations.created',
      flowId: 'parent-flow-id',
      flowExecutionId: 'parent-exec-id',
      solicitation: makeSolicitation(),
    });

    // É esse registro que FlowsApprovalListener procura (approvalId + waiting_approval) para retomar.
    expect(executionsRepo.update).toHaveBeenCalledWith(
      'child-exec-id',
      expect.objectContaining({
        status: 'waiting_approval',
        approvalId: 'child-approval',
        pausedNodeId: 'child-approval-node',
      }),
    );
    expect(executionsRepo.update).not.toHaveBeenCalledWith(
      'child-exec-id',
      expect.objectContaining({ status: 'success' }),
    );
  });

  it('em modo sync, o pai não falha quando o filho pausa: para no nó do sub-fluxo esperando o filho', async () => {
    const { engine, flowsRepo, approvalsService } = makeEngine();
    approvalsService.createApproval.mockResolvedValue({ id: 'child-approval', status: ApprovalStatus.PENDING });
    flowsRepo.findOne.mockResolvedValue({
      id: 'child-flow-id',
      formId: null,
      nodes: [
        { id: 'child-trigger', type: 'trigger_solicitation_created', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'child-approval-node',
          type: 'action_create_approval',
          position: { x: 0, y: 0 },
          data: { title: 'Aprovar no filho', assignedUserIds: ['approver-id'] },
        },
      ],
      edges: [{ id: 'c1', source: 'child-trigger', target: 'child-approval-node' }],
    });
    const pai = makeFlow(
      [
        { id: 'trigger', type: 'trigger_solicitation_created', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'run',
          type: 'action_run_flow',
          position: { x: 0, y: 0 },
          data: { flowId: 'child-flow-id', mode: 'sync', passContext: true },
        },
        terminalNode('depois-do-filho'),
      ],
      [
        { id: 'e1', source: 'trigger', target: 'run' },
        { id: 'e2', source: 'run', target: 'depois-do-filho' },
      ],
    );

    const results = await engine.execute(pai, {
      eventName: 'solicitations.created',
      flowId: 'parent-flow-id',
      solicitation: makeSolicitation(),
    });

    const run = results.find((r) => r.nodeId === 'run');
    expect(run).toMatchObject({
      status: 'success',
      output: { paused: true, waitingSubflowExecutionId: 'child-exec-id', childStatus: 'waiting_approval' },
    });
    expect(run && isPausedSubflowResult(run)).toBe(true);
    // Não é confundido com a pausa de aprovação do próprio pai.
    expect(run && isPausedApprovalResult(run)).toBe(false);
    expect(results.map((r) => r.nodeId)).not.toContain('depois-do-filho');
  });
});

describe('FlowExecutionEngine — execução de teste (metadata.testRun)', () => {
  function montar() {
    const partes = makeEngine();
    partes.outboundWebhookService.send.mockResolvedValue({
      id: 'delivery-1',
      status: WebhookDeliveryStatus.SUCCESS,
      responseStatus: 200,
      attemptCount: 1,
    });
    partes.googleWorkspace.isUserGoogleConnectedById.mockResolvedValue(true);
    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_form_submit', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'email',
          type: 'action_send_email',
          position: { x: 0, y: 0 },
          data: { toEmail: 'cliente@empresa.com', subject: 'Olá', body: 'Corpo' },
        },
        {
          id: 'webhook',
          type: 'action_webhook',
          position: { x: 0, y: 0 },
          data: { webhookUrl: 'https://erp.exemplo.com/hook', method: 'POST' },
        },
        {
          id: 'notify',
          type: 'action_notify_users',
          position: { x: 0, y: 0 },
          data: { userIds: ['user-1'], message: 'Aviso' },
        },
        {
          id: 'sheets',
          type: 'action_google_sheets',
          position: { x: 0, y: 0 },
          data: { spreadsheetId: 'planilha-1' },
        },
      ],
      ['email', 'webhook', 'notify', 'sheets'].map((alvo) => ({
        id: `e-${alvo}`,
        source: 'trigger',
        target: alvo,
      })),
    );
    return { ...partes, flow };
  }

  const contexto = (metadata: Record<string, unknown>): FlowExecutionContext => ({
    eventName: 'flows.test_run',
    form: { id: 'form-id', name: 'Formulário', createdBy: 'user-1' } as never,
    fields: {},
    actorId: 'user-1',
    metadata,
  });

  it('contraprova: sem testRun, os mesmos nós disparam e-mail, webhook, notificação e planilha', async () => {
    const { engine, flow, mailer, outboundWebhookService, notificationsRepo, googleWorkspace } =
      montar();

    const results = await engine.execute(flow, contexto({}));

    expect(results.every((r) => r.status === 'success')).toBe(true);
    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(outboundWebhookService.send).toHaveBeenCalledTimes(1);
    expect(notificationsRepo.save).toHaveBeenCalledTimes(1);
    expect(googleWorkspace.appendRowToSpreadsheet).toHaveBeenCalledTimes(1);
  });

  it('[P-02] com testRun, não dispara e-mail, webhook, notificação nem planilha de verdade', async () => {
    const { engine, flow, mailer, outboundWebhookService, notificationsRepo, googleWorkspace } =
      montar();

    await engine.execute(flow, contexto({ testRun: true }));

    expect(mailer.send).not.toHaveBeenCalled();
    expect(outboundWebhookService.send).not.toHaveBeenCalled();
    expect(notificationsRepo.save).not.toHaveBeenCalled();
    expect(googleWorkspace.appendRowToSpreadsheet).not.toHaveBeenCalled();
  });
});

describe('FlowExecutionEngine — teste manual simula as ações (metadata.testRun)', () => {
  const P = { x: 0, y: 0 };
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
    mockAxios.request.mockReset();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  /** Uma configuração válida de cada tipo de ação. */
  const ACOES: Record<string, Record<string, unknown>> = {
    action_send_email: { toEmail: 'cliente@empresa.com', subject: 'Lote {{lote}}', body: 'Corpo' },
    action_webhook: { webhookUrl: 'https://erp.exemplo.com/hook', method: 'POST', signingSecret: 's3gr3do' },
    action_http_check: { url: 'https://api.exemplo.com/status', method: 'GET' },
    action_notify_users: { userIds: ['user-1'], message: 'Aviso' },
    action_google_sheets: { spreadsheetId: 'planilha-1' },
    action_update_solicitation_status: { status: SolicitationStatus.IN_PROGRESS },
    action_move_kanban_card: { status: SolicitationStatus.IN_PROGRESS, currentStage: 'Análise' },
    action_create_approval: { title: 'Aprovar lote {{lote}}', assignedUserIds: ['aprovador-1'] },
    action_create_solicitation_from_payload: { titleTemplate: 'Pedido {{lote}}' },
    action_forward_to_process: { formId: 'form-destino', titleTemplate: 'Atendimento {{lote}}' },
    action_assign_responsible: { userId: 'user-2' },
    action_send_whatsapp: { recipientType: 'requester', message: 'Oi' },
    action_erp_operation: { connectorId: 'erp-1', templateId: 'tpl-1' },
    action_ai_agent: { agentSlug: 'validador-de-etiquetas', apiKey: 'chave' },
    action_wait_for_phase_fields: { phaseId: 'fase-2', phaseLabel: 'Produção' },
    action_move_phase: { phaseId: 'fase-3', phaseLabel: 'Concluído' },
    action_run_flow: { flowId: 'child-flow-id', mode: 'sync', passContext: false },
  };

  function montar() {
    const partes = makeEngine();
    const createFromFlowPayload = jest.fn().mockResolvedValue({ solicitation: makeSolicitation({ id: 'nova' }), reused: false });
    (partes.solicitationsService as unknown as { createFromFlowPayload: jest.Mock }).createFromFlowPayload =
      createFromFlowPayload;
    const createFromHandoff = jest.fn().mockResolvedValue({
      solicitation: makeSolicitation({ id: 'no-destino' }),
      reused: false,
      copiedFields: [],
      skipped: [],
      missingRequired: [],
      attachmentsCopied: 0,
      attachmentsFailed: [],
    });
    (partes.solicitationsService as unknown as { createFromHandoff: jest.Mock }).createFromHandoff = createFromHandoff;
    partes.googleWorkspace.isUserGoogleConnectedById.mockResolvedValue(true);
    partes.flowsRepo.findOne.mockResolvedValue({
      id: 'child-flow-id',
      name: 'Fluxo filho',
      isActive: true,
      nodes: [],
      edges: [],
    });
    // Respostas de sucesso para a contraprova (sem testRun) chegar até o efeito.
    partes.outboundWebhookService.send.mockResolvedValue({
      id: 'delivery-1',
      status: WebhookDeliveryStatus.SUCCESS,
      responseStatus: 200,
      attemptCount: 1,
    });
    mockAxios.request.mockResolvedValue({ status: 200, data: '{"ok":true}' });
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{"data":{"ok":true}}'),
    } as unknown as Response);
    partes.solicitationsService.moveCard.mockResolvedValue(makeSolicitation());
    partes.solicitationsService.movePhase.mockResolvedValue(makeSolicitation());
    partes.solicitationsService.updateAssignee.mockResolvedValue(makeSolicitation());
    partes.approvalsService.createApproval.mockResolvedValue({ id: 'ap-1', status: ApprovalStatus.PENDING });
    partes.whatsappConnectorService.sendToSolicitation.mockResolvedValue({ id: 'w1', status: 'sent' });
    partes.erpConnectorService.executeOperation.mockResolvedValue({ id: 'log-1', status: 'success' });

    const efeitos: Record<string, jest.Mock | jest.SpyInstance> = {
      'mailer.send': partes.mailer.send,
      'notificationsRepo.save': partes.notificationsRepo.save,
      'executionsRepo.save': partes.executionsRepo.save,
      'executionsRepo.update': partes.executionsRepo.update,
      'attachmentsRepo.save': partes.attachmentsRepo.save,
      'googleWorkspace.appendRowToSpreadsheet': partes.googleWorkspace.appendRowToSpreadsheet,
      'solicitationsService.moveCard': partes.solicitationsService.moveCard,
      'solicitationsService.movePhase': partes.solicitationsService.movePhase,
      'solicitationsService.updateAssignee': partes.solicitationsService.updateAssignee,
      'solicitationsService.createFromFlowPayload': createFromFlowPayload,
      'solicitationsService.createFromHandoff': createFromHandoff,
      'approvalsService.createApproval': partes.approvalsService.createApproval,
      'outboundWebhookService.send': partes.outboundWebhookService.send,
      'whatsapp.sendToSolicitation': partes.whatsappConnectorService.sendToSolicitation,
      'erp.executeOperation': partes.erpConnectorService.executeOperation,
      'axios.request': mockAxios.request,
      fetch: fetchSpy,
    };
    const efeitosChamados = () =>
      Object.entries(efeitos)
        .filter(([, mock]) => mock.mock.calls.length > 0)
        .map(([nome]) => nome);

    return { ...partes, efeitosChamados };
  }

  /** O que o teste manual tem: só os valores digitados. */
  function contextoDoTeste(extra: Partial<FlowExecutionContext> = {}): FlowExecutionContext {
    return {
      eventName: 'flows.test_run',
      flowId: 'flow-id',
      form: { id: 'form-id', name: 'Formulário', createdBy: 'user-1' } as never,
      fields: { lote: 'L1' },
      actorId: 'user-1',
      ...extra,
      metadata: { testRun: true, ...extra.metadata },
    };
  }

  /** Teste a partir de dados reais: solicitação, foto, fase e payload presentes. */
  function contextoCompleto(metadata: Record<string, unknown>): FlowExecutionContext {
    return contextoDoTeste({
      solicitation: makeSolicitation(),
      attachment: {
        id: 'foto-1',
        originalName: 'etiqueta.jpg',
        mimeType: 'image/jpeg',
        storagePath: 'x/etiqueta.jpg',
      } as never,
      metadata: { phaseId: 'fase-1', approverRoleCode: 'supervisor', payload: {}, ...metadata },
    });
  }

  function fluxoComUmaAcao(tipo: string, data: Record<string, unknown>, gatilho = 'trigger_form_submit') {
    return makeFlow(
      [
        { id: 'gatilho', type: gatilho, position: P, data: {} },
        { id: 'acao', type: tipo, position: P, data },
      ] as unknown as FlowNode[],
      [{ id: 'e1', source: 'gatilho', target: 'acao' }],
    );
  }

  it('tem um caso para cada tipo de ação: um nó novo precisa decidir o que faz no teste', () => {
    // action_notification faz o próprio dry-run (flow-notification-node.executor.spec.ts).
    const tipos = FLOW_NODE_TYPES.filter((t) => t.startsWith('action_') && t !== 'action_notification');
    expect(Object.keys(ACOES).sort()).toEqual([...tipos].sort());
  });

  it.each(Object.entries(ACOES))('%s: no teste só descreve o que faria', async (tipo, data) => {
    const { engine, efeitosChamados } = montar();

    const results = await engine.execute(fluxoComUmaAcao(tipo, data), contextoCompleto({ testRun: true }));

    const acao = results.find((r) => r.nodeId === 'acao');
    expect(acao).toMatchObject({ status: 'success', output: { dryRun: true } });
    expect((acao?.output as { summary?: unknown }).summary).toEqual(expect.any(String));
    expect(efeitosChamados()).toEqual([]);
  });

  it.each(Object.entries(ACOES).filter(([tipo]) => tipo !== 'action_wait_for_phase_fields'))(
    'contraprova — %s: sem testRun, a mesma configuração age de verdade',
    async (tipo, data) => {
      const { engine, efeitosChamados } = montar();
      const contexto = contextoCompleto({});
      delete contexto.metadata?.testRun;

      const results = await engine.execute(fluxoComUmaAcao(tipo, data), contexto);

      expect(results.find((r) => r.nodeId === 'acao')?.status).toBe('success');
      expect(efeitosChamados().length).toBeGreaterThan(0);
    },
  );

  it('webhook simulado não expõe cabeçalhos nem o segredo de assinatura', async () => {
    const { engine } = montar();
    const flow = fluxoComUmaAcao('action_webhook', {
      ...ACOES.action_webhook,
      headers: [{ key: 'Authorization', value: 'Bearer abc' }],
    });

    const results = await engine.execute(flow, contextoDoTeste());

    const texto = JSON.stringify(results);
    expect(texto).not.toContain('s3gr3do');
    expect(texto).not.toContain('Bearer abc');
  });

  it('fluxo de foto (Datar Embalagens): sem foto nem solicitação, simula LOPS IA e a aprovação e para na aprovação', async () => {
    const { engine, efeitosChamados } = montar();
    const flow = makeFlow(
      [
        { id: 'gatilho', type: 'trigger_attachment_uploaded', position: P, data: { fieldCode: 'foto_da_etiqueta' } },
        { id: 'lops', type: 'action_ai_agent', position: P, data: ACOES.action_ai_agent },
        {
          id: 'aprovacao',
          type: 'action_create_approval',
          position: P,
          data: { title: 'Conferir etiqueta', scope: 'phase', approverSourceMode: 'phase_role' },
        },
        { id: 'resultado', type: 'condition_approval_result', position: P, data: { operator: 'equals', value: 'approved' } },
        { id: 'concluir', type: 'action_move_phase', position: P, data: ACOES.action_move_phase },
        { id: 'rejeitar', type: 'action_update_solicitation_status', position: P, data: { status: 'rejected' } },
      ] as unknown as FlowNode[],
      [
        { id: 'e1', source: 'gatilho', target: 'lops' },
        { id: 'e2', source: 'gatilho', target: 'aprovacao' },
        { id: 'e3', source: 'aprovacao', target: 'resultado' },
        { id: 'e4', source: 'resultado', target: 'concluir', sourceHandle: 'yes' },
        { id: 'e5', source: 'resultado', target: 'rejeitar', sourceHandle: 'no' },
      ],
    );

    const results = await engine.execute(flow, contextoDoTeste());

    expect(results.map((r) => [r.nodeId, r.status])).toEqual([
      ['gatilho', 'success'],
      ['lops', 'success'],
      ['aprovacao', 'success'],
    ]);
    expect(results[1].output).toMatchObject({
      dryRun: true,
      summary: expect.stringContaining('validador-de-etiquetas'),
    });
    expect(results[2].output).toMatchObject({
      dryRun: true,
      paused: true,
      summary: expect.stringContaining('perfil aprovador da fase'),
    });
    expect(efeitosChamados()).toEqual([]);
  });

  it('sem solicitação num gatilho que não traz solicitação, falha como na execução real', async () => {
    const { engine } = montar();

    const results = await engine.execute(
      fluxoComUmaAcao('action_move_phase', ACOES.action_move_phase, 'trigger_form_submit'),
      contextoDoTeste(),
    );

    expect(results[1]).toMatchObject({
      status: 'failed',
      error: 'Ação requer solicitação no contexto do fluxo.',
    });
  });

  it('sem solicitação num gatilho que traz solicitação, simula em vez de falhar', async () => {
    const { engine, efeitosChamados } = montar();

    const results = await engine.execute(
      fluxoComUmaAcao('action_move_phase', ACOES.action_move_phase, 'trigger_solicitation_created'),
      contextoDoTeste(),
    );

    expect(results[1]).toMatchObject({
      status: 'success',
      output: { dryRun: true, summary: 'Moveria a solicitação para a fase "Concluído".' },
    });
    expect(efeitosChamados()).toEqual([]);
  });

  it.each([
    ['action_move_phase', {}, 'trigger_solicitation_created', 'action_move_phase requer phaseId.'],
    ['action_ai_agent', { apiKey: 'chave' }, 'trigger_attachment_uploaded', 'action_ai_agent requer agentSlug'],
    ['action_send_email', { subject: 'x', body: 'y' }, 'trigger_form_submit', 'requer ao menos um destinatário'],
    ['action_webhook', { method: 'POST' }, 'trigger_form_submit', 'action_webhook requer uma URL.'],
    ['action_create_approval', { title: 'x' }, 'trigger_solicitation_created', 'requer assignedUserIds'],
  ])('%s com configuração incompleta falha no teste', async (tipo, data, gatilho, erro) => {
    const { engine } = montar();

    const results = await engine.execute(fluxoComUmaAcao(tipo, data, gatilho), contextoDoTeste());

    expect(results[1].status).toBe('failed');
    expect(results[1].error).toContain(erro);
  });

  it('solicitação criada no teste: os nós seguintes agem sobre ela, também simulados', async () => {
    const { engine, efeitosChamados } = montar();
    const flow = makeFlow(
      [
        { id: 'gatilho', type: 'trigger_form_submit', position: P, data: {} },
        { id: 'criar', type: 'action_create_solicitation_from_payload', position: P, data: ACOES.action_create_solicitation_from_payload },
        { id: 'mover', type: 'action_move_phase', position: P, data: ACOES.action_move_phase },
      ] as unknown as FlowNode[],
      [
        { id: 'e1', source: 'gatilho', target: 'criar' },
        { id: 'e2', source: 'criar', target: 'mover' },
      ],
    );

    const results = await engine.execute(flow, contextoDoTeste());

    expect(results.map((r) => r.status)).toEqual(['success', 'success', 'success']);
    expect(results[1].output).toMatchObject({ summary: 'Criaria a solicitação "Pedido L1".' });
    expect(results[2].output).toMatchObject({ dryRun: true });
    expect(efeitosChamados()).toEqual([]);
  });

  it('gatilho de webhook sem payload no teste: título que viria do payload é simulado', async () => {
    const { engine } = montar();

    const results = await engine.execute(
      fluxoComUmaAcao(
        'action_create_solicitation_from_payload',
        { titlePath: 'pedido.numero' },
        'trigger_webhook_received',
      ),
      contextoDoTeste(),
    );

    expect(results[1]).toMatchObject({
      status: 'success',
      output: { summary: expect.stringContaining('título do payload em "pedido.numero"') },
    });
  });

  it('condição de status sem a solicitação do evento avisa que o caminho pode ser outro', async () => {
    const { engine, efeitosChamados } = montar();
    const flow = makeFlow(
      [
        { id: 'gatilho', type: 'trigger_solicitation_created', position: P, data: {} },
        { id: 'status', type: 'condition_solicitation_status', position: P, data: { operator: 'equals', value: 'new' } },
        { id: 'sim', type: 'action_notify_users', position: P, data: ACOES.action_notify_users },
        { id: 'nao', type: 'action_send_email', position: P, data: ACOES.action_send_email },
      ] as unknown as FlowNode[],
      [
        { id: 'e1', source: 'gatilho', target: 'status' },
        { id: 'e2', source: 'status', target: 'sim', sourceHandle: 'yes' },
        { id: 'e3', source: 'status', target: 'nao', sourceHandle: 'no' },
      ],
    );

    const results = await engine.execute(flow, contextoDoTeste());

    expect(results[1].output).toMatchObject({
      summary: expect.stringContaining('"Não" sem a solicitação'),
      warning: expect.any(String),
    });
    expect(results.map((r) => r.nodeId)).toEqual(['gatilho', 'status', 'nao']);
    expect(efeitosChamados()).toEqual([]);
  });

  it('condição sobre a resposta de uma chamada simulada avisa que o caminho pode ser outro', async () => {
    const { engine } = montar();
    const flow = makeFlow(
      [
        { id: 'gatilho', type: 'trigger_form_submit', position: P, data: {} },
        { id: 'checar', type: 'action_http_check', position: P, data: ACOES.action_http_check },
        { id: 'resposta', type: 'condition_response_value', position: P, data: { path: 'ok', operator: 'equals', value: 'true' } },
      ] as unknown as FlowNode[],
      [
        { id: 'e1', source: 'gatilho', target: 'checar' },
        { id: 'e2', source: 'checar', target: 'resposta' },
      ],
    );

    const results = await engine.execute(flow, contextoDoTeste());

    expect(results[2].output).toMatchObject({
      summary: expect.stringContaining('resposta da chamada'),
      warning: expect.any(String),
    });
  });

  it('condição com o dado presente não recebe aviso', async () => {
    const { engine } = montar();
    const flow = makeFlow(
      [
        { id: 'gatilho', type: 'trigger_form_submit', position: P, data: {} },
        { id: 'campo', type: 'condition_field_value', position: P, data: { fieldCode: 'lote', operator: 'equals', value: 'L1' } },
      ] as unknown as FlowNode[],
      [{ id: 'e1', source: 'gatilho', target: 'campo' }],
    );

    const results = await engine.execute(flow, contextoDoTeste());

    expect(results[1].output).toBeUndefined();
  });

  it('aprovador dinâmico não encontrado no teste falha sem notificar os gestores', async () => {
    const { engine, usersService, notificationsRepo } = montar();
    usersService.findActiveByEmail.mockResolvedValue(null);
    usersService.findAssignable.mockResolvedValue([{ id: 'gestor-1' }]);

    const results = await engine.execute(
      fluxoComUmaAcao(
        'action_create_approval',
        { title: 'Aprovar', approverSourceMode: 'dynamic', approversPath: 'aprovadores' },
        'trigger_webhook_received',
      ),
      contextoCompleto({ testRun: true, payload: { aprovadores: 'ninguem@empresa.com' } }),
    );

    expect(results[1]).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('ninguem@empresa.com'),
    });
    expect(usersService.findAssignable).not.toHaveBeenCalled();
    expect(notificationsRepo.save).not.toHaveBeenCalled();
  });
});

describe('FlowExecutionEngine — aprovador dinâmico não resolvido', () => {
  it('avisa quem tem flows.manage, citando a solicitação e o e-mail que falhou', async () => {
    const { engine, usersService, notificationsRepo, approvalsService } = makeEngine();
    usersService.findActiveByEmail.mockResolvedValue(null);
    usersService.findAssignable.mockResolvedValue([{ id: 'gestor-1' }, { id: 'gestor-2' }]);
    const flow = makeFlow(
      [
        { id: 'trigger', type: 'trigger_webhook_received', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'action',
          type: 'action_create_approval',
          position: { x: 0, y: 0 },
          data: {
            title: 'Aprovar pedido',
            approverSourceMode: 'dynamic',
            approversPath: 'header.aprovadores',
          },
        },
      ],
      [{ id: 'e1', source: 'trigger', target: 'action' }],
    );

    const results = await engine.execute(flow, {
      eventName: 'webhooks.received',
      solicitation: makeSolicitation({ title: 'Compra' }),
      metadata: { payload: { header: { aprovadores: ['ghost@x.com'] } } },
    });

    expect(results.find((r) => r.nodeId === 'action')?.status).toBe('failed');
    expect(approvalsService.createApproval).not.toHaveBeenCalled();
    expect(usersService.findAssignable).toHaveBeenCalledWith('flows.manage');
    for (const userId of ['gestor-1', 'gestor-2']) {
      expect(notificationsRepo.create).toHaveBeenCalledWith({
        userId,
        message: expect.stringContaining('Compra (solicitation-id)'),
      });
    }
    expect(notificationsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('ghost@x.com') }),
    );
    expect(notificationsRepo.save).toHaveBeenCalledTimes(2);
  });
});

describe('FlowExecutionEngine — teste manual: "Mover para fase" passa a fase adiante', () => {
  it('a aprovação de fase logo depois é simulada, sem acusar falta de fase', async () => {
    const { engine, solicitationsService } = makeEngine();
    solicitationsService.findKanbanPhase.mockResolvedValue({
      id: 'fase-financeiro',
      label: 'Financeiro: conferência',
      approverRoleCode: 'financeiro',
    });
    const flow = makeFlow(
      [
        { id: 'lote', type: 'trigger_solicitation_created', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'mover',
          type: 'action_move_phase',
          position: { x: 0, y: 0 },
          data: { phaseId: 'fase-financeiro', phaseLabel: 'Financeiro: conferência' },
        },
        {
          id: 'aprovacao',
          type: 'action_create_approval',
          position: { x: 0, y: 0 },
          data: { title: 'Cancelar no ERP', scope: 'phase', approverSourceMode: 'phase_role' },
        },
      ],
      [
        { id: 'e1', source: 'lote', target: 'mover' },
        { id: 'e2', source: 'mover', target: 'aprovacao' },
      ],
    );

    const results = await engine.execute(flow, {
      eventName: 'flows.test_run',
      metadata: { testRun: true },
    });

    expect(results.find((r) => r.nodeId === 'aprovacao')).toMatchObject({
      status: 'success',
      output: { dryRun: true, phaseId: 'fase-financeiro' },
    });
    expect(solicitationsService.movePhase).not.toHaveBeenCalled();
  });
});

describe('FlowExecutionEngine — várias entradas no mesmo fluxo', () => {
  // Envio do formulário → Logística → Financeiro; o lote do webhook entra direto no Financeiro.
  function fluxoComDuasEntradas(): FlowEntity {
    return makeFlow(
      [
        { id: 'envio', type: 'trigger_solicitation_created', position: { x: 0, y: 0 }, data: {} },
        terminalNode('logistica'),
        { id: 'lote', type: 'trigger_webhook_received', position: { x: 0, y: 0 }, data: {} },
        terminalNode('financeiro'),
      ],
      [
        { id: 'e1', source: 'envio', target: 'logistica' },
        { id: 'e2', source: 'logistica', sourceHandle: 'yes', target: 'financeiro' },
        { id: 'e3', source: 'lote', target: 'financeiro' },
      ],
    );
  }

  it('sem entrada indicada, começa pelo primeiro gatilho (comportamento de um gatilho só)', async () => {
    const { engine } = makeEngine();

    const results = await engine.execute(fluxoComDuasEntradas(), { eventName: 'solicitations.created' });

    expect(results.map((r) => r.nodeId)).toEqual(['envio', 'logistica', 'financeiro']);
  });

  it('começa pelo gatilho indicado e segue só o caminho dele', async () => {
    const { engine } = makeEngine();

    const results = await engine.execute(fluxoComDuasEntradas(), {
      eventName: 'webhooks.received',
      entryNodeId: 'lote',
    });

    expect(results.map((r) => r.nodeId)).toEqual(['lote', 'financeiro']);
  });

  it('entrada que não é gatilho do fluxo não executa nada', async () => {
    const { engine } = makeEngine();

    const sumiu = await engine.execute(fluxoComDuasEntradas(), {
      eventName: 'webhooks.received',
      entryNodeId: 'removido',
    });
    const naoEGatilho = await engine.execute(fluxoComDuasEntradas(), {
      eventName: 'webhooks.received',
      entryNodeId: 'financeiro',
    });

    expect(sumiu).toEqual([]);
    expect(naoEGatilho).toEqual([]);
  });

  it('o sub-fluxo começa pelo próprio gatilho, não herda a entrada do pai', async () => {
    const { engine, flowsRepo, executionsRepo } = makeEngine();
    flowsRepo.findOne.mockResolvedValue(makeChildFlow());
    const pai = makeFlow(
      [
        { id: 'envio', type: 'trigger_solicitation_created', position: { x: 0, y: 0 }, data: {} },
        { id: 'lote', type: 'trigger_webhook_received', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'run',
          type: 'action_run_flow',
          position: { x: 0, y: 0 },
          data: { flowId: 'child-flow-id', mode: 'sync', passContext: true },
        },
      ],
      [{ id: 'e1', source: 'lote', target: 'run' }],
    );

    const results = await engine.execute(pai, {
      eventName: 'webhooks.received',
      flowId: 'flow-id',
      entryNodeId: 'lote',
    });

    expect(results.find((r) => r.nodeId === 'run')).toMatchObject({
      status: 'success',
      output: { childStatus: 'success' },
    });
    // Herdando 'lote' (que não existe no filho), o filho não rodaria nó nenhum.
    expect(executionsRepo.update).toHaveBeenCalledWith(
      'child-exec-id',
      expect.objectContaining({ nodeResults: [expect.objectContaining({ nodeId: 'trigger' })] }),
    );
  });

  describe('action_create_solicitation_from_payload respondendo o formulário', () => {
    function fluxoDoLote(fieldValues: unknown): FlowEntity {
      return makeFlow(
        [
          { id: 'lote', type: 'trigger_webhook_received', position: { x: 0, y: 0 }, data: {} },
          {
            id: 'criar',
            type: 'action_create_solicitation_from_payload',
            position: { x: 0, y: 0 },
            data: {
              titleTemplate: 'Cancelamento do pedido {{item}}',
              idempotencyKeyTemplate: 'cancelamento-{{item}}',
              formId: 'form-cancelamento',
              fieldValues,
            } as never,
          },
          {
            id: 'condicao',
            type: 'condition_field_value',
            position: { x: 0, y: 0 },
            data: { fieldCode: 'pedido', operator: 'equals', value: '123' },
          },
          terminalNode('financeiro'),
        ],
        [
          { id: 'e1', source: 'lote', target: 'criar' },
          { id: 'e2', source: 'criar', target: 'condicao' },
          { id: 'e3', source: 'condicao', sourceHandle: 'yes', target: 'financeiro' },
        ],
      );
    }

    it('grava as respostas na solicitação e os nós seguintes as enxergam', async () => {
      const { engine, solicitationsService } = makeEngine();
      const createFromFlowPayload = jest.fn((input: { metadata: Record<string, unknown> }) =>
        Promise.resolve({ solicitation: makeSolicitation({ id: 'nova', metadata: input.metadata }), reused: false }),
      );
      (solicitationsService as unknown as { createFromFlowPayload: jest.Mock }).createFromFlowPayload =
        createFromFlowPayload;

      const results = await engine.execute(
        fluxoDoLote([
          { fieldCode: 'pedido', value: '{{item}}' },
          { fieldCode: 'motivo', value: '   ' },
        ]),
        { eventName: 'webhooks.received', entryNodeId: 'lote', metadata: { payload: '123', item: '123' } },
      );

      expect(createFromFlowPayload).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Cancelamento do pedido 123',
          idempotencyKey: 'cancelamento-123',
          formId: 'form-cancelamento',
          // Resposta em branco depois de resolver não é gravada.
          metadata: { formFieldValues: { pedido: '123' } },
        }),
      );
      expect(results.map((r) => r.nodeId)).toEqual(['lote', 'criar', 'condicao', 'financeiro']);
    });

    it('reenvio do mesmo pedido: valem as respostas já gravadas na solicitação existente', async () => {
      const { engine, solicitationsService } = makeEngine();
      (solicitationsService as unknown as { createFromFlowPayload: jest.Mock }).createFromFlowPayload =
        jest.fn().mockResolvedValue({
          solicitation: makeSolicitation({ id: 'existente', metadata: { formFieldValues: { pedido: '999' } } }),
          reused: true,
        });

      const results = await engine.execute(fluxoDoLote([{ fieldCode: 'pedido', value: '{{item}}' }]), {
        eventName: 'webhooks.received',
        entryNodeId: 'lote',
        metadata: { payload: '123', item: '123' },
      });

      // A condição pede 123; a solicitação devolvida pela idempotência tem 999.
      expect(results.map((r) => r.nodeId)).toEqual(['lote', 'criar', 'condicao']);
    });

    describe('"Parar se a solicitação já existia" (stopIfExisting)', () => {
      function fluxoQuePara(stopIfExisting: boolean | undefined): FlowEntity {
        const flow = fluxoDoLote([{ fieldCode: 'pedido', value: '{{item}}' }]);
        const criar = flow.nodes.find((n) => n.id === 'criar') as FlowNode;
        criar.data = { ...criar.data, stopIfExisting } as never;
        return flow;
      }

      function criarDevolvendo(reused: boolean) {
        const { engine, solicitationsService } = makeEngine();
        (solicitationsService as unknown as { createFromFlowPayload: jest.Mock }).createFromFlowPayload =
          jest.fn().mockResolvedValue({
            solicitation: makeSolicitation({
              id: 'sol-123',
              title: 'Cancelamento do pedido 123',
              metadata: { formFieldValues: { pedido: '123' } },
            }),
            reused,
          });
        return engine;
      }

      const evento = {
        eventName: 'webhooks.received',
        entryNodeId: 'lote',
        metadata: { payload: '123', item: '123' },
      };

      it('reenvio de um pedido que já existia encerra o caminho no nó, com sucesso', async () => {
        const results = await criarDevolvendo(true).execute(fluxoQuePara(true), evento);

        expect(results.map((r) => r.nodeId)).toEqual(['lote', 'criar']);
        expect(results[1]).toMatchObject({
          status: 'success',
          output: { stopped: true, solicitationId: 'sol-123' },
        });
      });

      it('solicitação nova segue normalmente mesmo com a opção ligada', async () => {
        const results = await criarDevolvendo(false).execute(fluxoQuePara(true), evento);

        expect(results.map((r) => r.nodeId)).toEqual(['lote', 'criar', 'condicao', 'financeiro']);
      });

      it('sem a opção (nós antigos), o reenvio segue com a solicitação existente', async () => {
        const results = await criarDevolvendo(true).execute(fluxoQuePara(undefined), evento);

        expect(results.map((r) => r.nodeId)).toEqual(['lote', 'criar', 'condicao', 'financeiro']);
        expect(results[1].output).toMatchObject({ solicitationId: 'sol-123', reused: true });
      });
    });

    it('no teste manual mostra as respostas e as entrega aos nós seguintes', async () => {
      const { engine, solicitationsService } = makeEngine();
      const createFromFlowPayload = jest.fn();
      (solicitationsService as unknown as { createFromFlowPayload: jest.Mock }).createFromFlowPayload =
        createFromFlowPayload;

      const results = await engine.execute(fluxoDoLote([{ fieldCode: 'pedido', value: '{{item}}' }]), {
        eventName: 'flows.test_run',
        entryNodeId: 'lote',
        metadata: { testRun: true, item: '123' },
      });

      expect(createFromFlowPayload).not.toHaveBeenCalled();
      expect(results.find((r) => r.nodeId === 'criar')?.output).toMatchObject({
        dryRun: true,
        fieldValues: { pedido: '123' },
      });
      expect(results.map((r) => r.nodeId)).toContain('financeiro');
    });
  });
});

describe('FlowExecutionEngine — action_forward_to_process', () => {
  function fluxoQueEncaminha(data: Record<string, unknown>): FlowEntity {
    return makeFlow(
      [
        { id: 'concluiu', type: 'trigger_phase_entered', position: { x: 0, y: 0 }, data: {} },
        { id: 'encaminhar', type: 'action_forward_to_process', position: { x: 0, y: 0 }, data: data as never },
        terminalNode('depois'),
      ],
      [
        { id: 'e1', source: 'concluiu', target: 'encaminhar' },
        { id: 'e2', source: 'encaminhar', target: 'depois' },
      ],
    );
  }

  function engineDevolvendo(result: Record<string, unknown>) {
    const { engine, solicitationsService } = makeEngine();
    const createFromHandoff = jest.fn().mockResolvedValue({
      copiedFields: [],
      skipped: [],
      missingRequired: [],
      attachmentsCopied: 0,
      attachmentsFailed: [],
      reused: false,
      ...result,
    });
    (solicitationsService as unknown as { createFromHandoff: jest.Mock }).createFromHandoff = createFromHandoff;
    return { engine, createFromHandoff };
  }

  it('encaminha o card atual com o mapeamento resolvido e segue no card de origem', async () => {
    const { engine, createFromHandoff } = engineDevolvendo({
      solicitation: makeSolicitation({ id: 'no-destino' }),
      copiedFields: ['nome', 'obs'],
      missingRequired: [{ fieldCode: 'cpf', label: 'CPF' }],
    });

    const results = await engine.execute(
      fluxoQueEncaminha({
        formId: 'form-destino',
        phaseId: 'fase-triagem',
        titleTemplate: 'Atendimento: {{solicitation_title}}',
        autoMatchByCode: false,
        copyAttachments: false,
        fieldMappings: [
          { targetFieldCode: 'nome', sourceFieldCode: 'nome_paciente' },
          { targetFieldCode: 'obs', value: 'Veio do card {{solicitation_title}}' },
          { targetFieldCode: '  ', value: 'ignorado' },
        ],
      }),
      { eventName: 'solicitations.phase_changed', solicitation: makeSolicitation() },
    );

    expect(createFromHandoff).toHaveBeenCalledWith({
      sourceSolicitationId: 'solicitation-id',
      targetFormId: 'form-destino',
      targetPhaseId: 'fase-triagem',
      title: `Atendimento: ${makeSolicitation().title}`,
      mappings: [
        { targetFieldCode: 'nome', sourceFieldCode: 'nome_paciente' },
        { targetFieldCode: 'obs', text: `Veio do card ${makeSolicitation().title}` },
      ],
      autoMatchByCode: false,
      copyAttachments: false,
      flowEventDepth: 1,
    });
    expect(results.map((r) => r.nodeId)).toEqual(['concluiu', 'encaminhar', 'depois']);
    expect(results[1].output).toMatchObject({
      forwardedSolicitationId: 'no-destino',
      copiedFields: ['nome', 'obs'],
      missingRequiredFields: ['CPF'],
    });
  });

  it('padrões: mesmo código e anexos ligados', async () => {
    const { engine, createFromHandoff } = engineDevolvendo({ solicitation: makeSolicitation({ id: 'x' }) });

    await engine.execute(fluxoQueEncaminha({ formId: 'form-destino' }), {
      eventName: 'solicitations.phase_changed',
      solicitation: makeSolicitation(),
    });

    expect(createFromHandoff).toHaveBeenCalledWith(
      expect.objectContaining({ autoMatchByCode: true, copyAttachments: true, targetPhaseId: null, title: '' }),
    );
  });

  it('card que já foi para o processo encerra o caminho (padrão) ou segue se desligado', async () => {
    const evento = { eventName: 'solicitations.phase_changed', solicitation: makeSolicitation() };
    const ja = { solicitation: makeSolicitation({ id: 'antigo', title: 'Antigo' }), reused: true };

    const parou = await engineDevolvendo(ja).engine.execute(fluxoQueEncaminha({ formId: 'f' }), evento);
    expect(parou.map((r) => r.nodeId)).toEqual(['concluiu', 'encaminhar']);
    expect(parou[1].output).toMatchObject({ stopped: true, forwardedSolicitationId: 'antigo' });

    const seguiu = await engineDevolvendo(ja).engine.execute(
      fluxoQueEncaminha({ formId: 'f', stopIfExisting: false }),
      evento,
    );
    expect(seguiu.map((r) => r.nodeId)).toEqual(['concluiu', 'encaminhar', 'depois']);
  });

  it('sem processo de destino falha com mensagem clara', async () => {
    const { engine, createFromHandoff } = engineDevolvendo({ solicitation: makeSolicitation() });

    const results = await engine.execute(fluxoQueEncaminha({}), {
      eventName: 'solicitations.phase_changed',
      solicitation: makeSolicitation(),
    });

    expect(results[1].status).toBe('failed');
    expect(results[1].error).toMatch(/processo de destino/);
    expect(createFromHandoff).not.toHaveBeenCalled();
  });

  it('no teste manual só descreve o encaminhamento', async () => {
    const { engine, createFromHandoff } = engineDevolvendo({ solicitation: makeSolicitation() });

    const results = await engine.execute(fluxoQueEncaminha({ formId: 'form-destino' }), {
      eventName: 'flows.test_run',
      solicitation: makeSolicitation(),
      metadata: { testRun: true },
    });

    expect(createFromHandoff).not.toHaveBeenCalled();
    expect(results[1]).toMatchObject({ status: 'success', output: expect.objectContaining({ formId: 'form-destino' }) });
  });
});
