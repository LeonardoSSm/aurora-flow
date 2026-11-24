import type { FlowEntity } from '../../database/entities';
import { FlowExecutionEngine } from './flow-execution.engine';
import { NodeFailureError } from './lib/node-failure.error';
import type { FlowEdge, FlowExecutionContext, FlowNode } from './types/flow.types';

/**
 * O nó `action_notification` DENTRO do motor: despacho para o executor, resultado do nó,
 * `continueOnFailure` e — igualmente importante — que nada disso muda o comportamento dos nós
 * existentes. A lógica do envio em si está em flow-notification-node.executor.spec.ts.
 */

function makeEngine() {
  const metricsService = { recordFlowNodeExecution: jest.fn(), recordFlowExecution: jest.fn() };
  const notificationsRepo = {
    create: jest.fn((data: object) => data),
    save: jest.fn((data: object) => Promise.resolve(data)),
  };
  const notificationExecutor = { execute: jest.fn() };
  const whatsappConnectorService = { sendToSolicitation: jest.fn() };
  const configService = { get: jest.fn().mockReturnValue('') };

  const engine = new FlowExecutionEngine(
    { send: jest.fn() } as never, // mailer
    notificationsRepo as never,
    {} as never, // executionsRepo
    {} as never, // flowsRepo
    {} as never, // approvalsRepo
    {} as never, // attachmentsRepo
    {} as never, // googleWorkspace
    metricsService as never,
    {} as never, // solicitationsService
    {} as never, // approvalsService
    {} as never, // usersService
    {} as never, // outboundWebhookService
    whatsappConnectorService as never,
    configService as never,
    {} as never, // erpConnectorService
    {} as never, // storageService
    notificationExecutor as never,
  );
  return { engine, metricsService, notificationsRepo, notificationExecutor };
}

const trigger: FlowNode = {
  id: 'trigger',
  type: 'trigger_form_submit',
  position: { x: 0, y: 0 },
  data: {},
};

function notificationNode(id: string, data: Record<string, unknown> = {}): FlowNode {
  return {
    id,
    type: 'action_notification',
    position: { x: 0, y: 0 },
    data: {
      channel: 'email',
      title: 'Assunto',
      content: 'Corpo',
      recipients: [{ type: 'requester' }],
      ...data,
    } as never,
  };
}

function notifyUsersNode(id: string, data: Record<string, unknown> = {}): FlowNode {
  return {
    id,
    type: 'action_notify_users',
    position: { x: 0, y: 0 },
    data: { userIds: ['u1'], message: 'oi', ...data } as never,
  };
}

const edge = (source: string, target: string, sourceHandle?: string): FlowEdge => ({
  id: `${source}->${target}`,
  source,
  target,
  ...(sourceHandle ? { sourceHandle } : {}),
});

const flow = (nodes: FlowNode[], edges: FlowEdge[]): FlowEntity =>
  ({ id: 'flow-id', formId: null, nodes, edges }) as unknown as FlowEntity;

const context = (overrides: Partial<FlowExecutionContext> = {}): FlowExecutionContext =>
  ({ eventName: 'responses.submitted', flowId: 'flow-id', flowExecutionId: 'exec-1', ...overrides }) as FlowExecutionContext;

const statusOf = (results: Array<{ nodeId: string; status: string }>, nodeId: string) =>
  results.find((r) => r.nodeId === nodeId)?.status;

describe('FlowExecutionEngine — nó action_notification', () => {
  it('despacha para o executor com os dados do nó, o contexto e o id do nó', async () => {
    const { engine, notificationExecutor } = makeEngine();
    notificationExecutor.execute.mockResolvedValue({ notificationId: 'n-1', status: 'sent' });
    const ctx = context({ fields: { nome: 'Maria' } });

    const results = await engine.execute(flow([trigger, notificationNode('n1')], [edge('trigger', 'n1')]), ctx);

    expect(notificationExecutor.execute).toHaveBeenCalledTimes(1);
    const [data, passedCtx, nodeId] = notificationExecutor.execute.mock.calls[0];
    expect(data).toMatchObject({ channel: 'email', title: 'Assunto' });
    expect(passedCtx).toMatchObject({ flowId: 'flow-id', flowExecutionId: 'exec-1', fields: { nome: 'Maria' } });
    expect(nodeId).toBe('n1');
    expect(results.find((r) => r.nodeId === 'n1')).toMatchObject({
      status: 'success',
      output: { notificationId: 'n-1', status: 'sent' },
    });
  });

  it('em caso de sucesso segue para os nós seguintes', async () => {
    const { engine, notificationExecutor, notificationsRepo } = makeEngine();
    notificationExecutor.execute.mockResolvedValue({ notificationId: 'n-1' });

    const results = await engine.execute(
      flow(
        [trigger, notificationNode('n1'), notifyUsersNode('after')],
        [edge('trigger', 'n1'), edge('n1', 'after')],
      ),
      context(),
    );

    expect(statusOf(results, 'n1')).toBe('success');
    expect(statusOf(results, 'after')).toBe('success');
    expect(notificationsRepo.save).toHaveBeenCalledTimes(1);
  });

  describe('falha do nó', () => {
    it('por padrão encerra aquele ramo, mas ramos irmãos continuam', async () => {
      const { engine, notificationExecutor, notificationsRepo } = makeEngine();
      notificationExecutor.execute.mockRejectedValue(new Error('canal fora do ar'));

      const results = await engine.execute(
        flow(
          [trigger, notificationNode('n1'), notifyUsersNode('after-notification'), notifyUsersNode('sibling')],
          [edge('trigger', 'n1'), edge('n1', 'after-notification'), edge('trigger', 'sibling')],
        ),
        context(),
      );

      expect(results.find((r) => r.nodeId === 'n1')).toMatchObject({ status: 'failed', error: 'canal fora do ar' });
      expect(statusOf(results, 'after-notification')).toBeUndefined();
      expect(statusOf(results, 'sibling')).toBe('success');
      expect(notificationsRepo.save).toHaveBeenCalledTimes(1);
    });

    it('NodeFailureError grava o output (id da notificação, contagens) no resultado `failed`', async () => {
      const { engine, notificationExecutor } = makeEngine();
      notificationExecutor.execute.mockRejectedValue(
        new NodeFailureError('1 de 3 destinatário(s) falharam', {
          notificationId: 'n-9',
          recipients: { total: 3, failed: 1 },
        }),
      );

      const results = await engine.execute(flow([trigger, notificationNode('n1')], [edge('trigger', 'n1')]), context());

      expect(results.find((r) => r.nodeId === 'n1')).toEqual({
        nodeId: 'n1',
        status: 'failed',
        error: '1 de 3 destinatário(s) falharam',
        output: { notificationId: 'n-9', recipients: { total: 3, failed: 1 } },
        durationMs: expect.any(Number),
      });
    });

    it('um Error comum não grava output', async () => {
      const { engine, notificationExecutor } = makeEngine();
      notificationExecutor.execute.mockRejectedValue(new Error('boom'));
      const results = await engine.execute(flow([trigger, notificationNode('n1')], [edge('trigger', 'n1')]), context());
      expect(results.find((r) => r.nodeId === 'n1')).not.toHaveProperty('output');
    });

    it('registra a métrica do nó como failed', async () => {
      const { engine, notificationExecutor, metricsService } = makeEngine();
      notificationExecutor.execute.mockRejectedValue(new Error('boom'));
      await engine.execute(flow([trigger, notificationNode('n1')], [edge('trigger', 'n1')]), context());
      expect(metricsService.recordFlowNodeExecution).toHaveBeenCalledWith('action_notification', 'failed');
    });
  });

  describe('continueOnFailure', () => {
    it('true: o nó fica `failed` (a falha continua registrada), mas os filhos executam', async () => {
      const { engine, notificationExecutor } = makeEngine();
      notificationExecutor.execute.mockRejectedValue(
        new NodeFailureError('falhou', { notificationId: 'n-1', recipients: { failed: 1 } }),
      );

      const results = await engine.execute(
        flow(
          [trigger, notificationNode('n1', { continueOnFailure: true }), notifyUsersNode('after')],
          [edge('trigger', 'n1'), edge('n1', 'after')],
        ),
        context(),
      );

      expect(results.map((r) => [r.nodeId, r.status])).toEqual([
        ['trigger', 'success'],
        ['n1', 'failed'],
        ['after', 'success'],
      ]);
      expect(results.find((r) => r.nodeId === 'n1')).toMatchObject({
        error: 'falhou',
        output: { notificationId: 'n-1' },
      });
    });

    it('true: continua também até o fim de uma cadeia e passa o contexto adiante', async () => {
      const { engine, notificationExecutor, notificationsRepo } = makeEngine();
      notificationExecutor.execute.mockRejectedValue(new Error('x'));

      const results = await engine.execute(
        flow(
          [trigger, notificationNode('n1', { continueOnFailure: true }), notifyUsersNode('a'), notifyUsersNode('b')],
          [edge('trigger', 'n1'), edge('n1', 'a'), edge('a', 'b')],
        ),
        context(),
      );
      expect(statusOf(results, 'a')).toBe('success');
      expect(statusOf(results, 'b')).toBe('success');
      expect(notificationsRepo.save).toHaveBeenCalledTimes(2);
    });

    it('false ou ausente: não continua', async () => {
      const { engine, notificationExecutor } = makeEngine();
      notificationExecutor.execute.mockRejectedValue(new Error('x'));
      for (const data of [{ continueOnFailure: false }, {}, { continueOnFailure: 'true' }]) {
        const results = await engine.execute(
          flow([trigger, notificationNode('n1', data), notifyUsersNode('after')], [edge('trigger', 'n1'), edge('n1', 'after')]),
          context(),
        );
        expect(statusOf(results, 'n1')).toBe('failed');
        expect(statusOf(results, 'after')).toBeUndefined();
      }
    });

    it('com sucesso, continueOnFailure não muda nada', async () => {
      const { engine, notificationExecutor } = makeEngine();
      notificationExecutor.execute.mockResolvedValue({ notificationId: 'n-1' });
      const results = await engine.execute(
        flow(
          [trigger, notificationNode('n1', { continueOnFailure: true }), notifyUsersNode('after')],
          [edge('trigger', 'n1'), edge('n1', 'after')],
        ),
        context(),
      );
      expect(results.map((r) => r.status)).toEqual(['success', 'success', 'success']);
    });

    it('NÃO vale para nós antigos: action_notify_users com continueOnFailure continua parando o ramo', async () => {
      const { engine, notificationsRepo } = makeEngine();
      notificationsRepo.save.mockRejectedValueOnce(new Error('banco indisponível'));

      const results = await engine.execute(
        flow(
          [trigger, notifyUsersNode('legacy', { continueOnFailure: true }), notifyUsersNode('after')],
          [edge('trigger', 'legacy'), edge('legacy', 'after')],
        ),
        context(),
      );

      expect(statusOf(results, 'legacy')).toBe('failed');
      expect(statusOf(results, 'after')).toBeUndefined();
    });

    it('depois de uma condição: segue só o ramo escolhido', async () => {
      const { engine, notificationExecutor } = makeEngine();
      notificationExecutor.execute.mockRejectedValue(new Error('x'));
      const condition: FlowNode = {
        id: 'cond',
        type: 'condition_always_true',
        position: { x: 0, y: 0 },
        data: {} as never,
      };
      const results = await engine.execute(
        flow(
          [trigger, condition, notificationNode('n1', { continueOnFailure: true }), notifyUsersNode('after'), notifyUsersNode('never')],
          [edge('trigger', 'cond'), edge('cond', 'n1', 'yes'), edge('n1', 'after'), edge('cond', 'never', 'no')],
        ),
        context(),
      );
      expect(statusOf(results, 'after')).toBe('success');
      expect(statusOf(results, 'never')).toBeUndefined();
    });
  });

  it('o contexto de teste manual chega ao executor (para o dry-run)', async () => {
    const { engine, notificationExecutor } = makeEngine();
    notificationExecutor.execute.mockResolvedValue({ dryRun: true });
    await engine.execute(
      flow([trigger, notificationNode('n1')], [edge('trigger', 'n1')]),
      context({ metadata: { testRun: true } }),
    );
    expect(notificationExecutor.execute.mock.calls[0][1].metadata).toEqual({ testRun: true });
  });
});
