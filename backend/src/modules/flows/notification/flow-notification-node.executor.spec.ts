import { CHANNEL_LIMITS } from '../../notifications/domain/notification.limits';
import {
  NotificationRateLimitError,
  NotificationValidationError,
  type NotificationSummary,
} from '../../notifications/notifications.service';
import { NodeFailureError } from '../lib/node-failure.error';
import type { ActionNotificationData, FlowExecutionContext } from '../types/flow.types';
import { FlowNotificationNodeExecutor } from './flow-notification-node.executor';

const NOTIFICATION_ID = 'notif-1';

function summary(overrides: Partial<NotificationSummary> = {}): NotificationSummary {
  return {
    notificationId: NOTIFICATION_ID,
    channel: 'email',
    status: 'sent',
    counts: { total: 1, scheduled: 0, pending: 0, processing: 0, sent: 1, delivered: 0, failed: 0, cancelled: 0 },
    retryScheduled: 0,
    errors: [],
    ...overrides,
  };
}

function makeExecutor(options: { resolved?: unknown[] } = {}) {
  const notifications = {
    enqueue: jest.fn().mockResolvedValue({ message: { id: NOTIFICATION_ID }, recipients: [], created: true }),
    dispatch: jest.fn().mockResolvedValue(summary()),
    summarize: jest.fn().mockResolvedValue(summary()),
  };
  const registry = {
    get: jest.fn((id: 'email' | 'in_app' | 'whatsapp') => ({ id, limits: CHANNEL_LIMITS[id] })),
  };
  const resolver = {
    resolve: jest.fn().mockResolvedValue(options.resolved ?? [{ source: 'requester', address: 'maria@x.com' }]),
  };
  const config = { get: jest.fn().mockReturnValue('https://flow.exemplo.com') };
  const executor = new FlowNotificationNodeExecutor(
    notifications as never,
    registry as never,
    resolver as never,
    config as never,
  );
  return { executor, notifications, registry, resolver };
}

function node(overrides: Partial<ActionNotificationData> = {}): ActionNotificationData {
  return {
    channel: 'email',
    title: 'Pedido {{solicitation_title}}',
    content: 'Olá {{responder_name}}, seu pedido {{solicitation_title}} foi recebido.',
    recipients: [{ type: 'requester' }],
    ...overrides,
  };
}

const ctx = (overrides: Partial<FlowExecutionContext> = {}): FlowExecutionContext =>
  ({
    eventName: 'solicitations.created',
    flowId: 'flow-1',
    flowExecutionId: 'exec-1',
    submission: { responderName: 'Maria' },
    solicitation: { id: 'sol-1', title: 'Cadeiras' },
    ...overrides,
  }) as FlowExecutionContext;

describe('FlowNotificationNodeExecutor', () => {
  describe('execução imediata', () => {
    it('renderiza, persiste com a correlação do fluxo e envia na hora', async () => {
      const { executor, notifications } = makeExecutor();
      const output = await executor.execute(node(), ctx(), 'node-7');

      expect(notifications.enqueue).toHaveBeenCalledTimes(1);
      const input = notifications.enqueue.mock.calls[0][0];
      expect(input).toMatchObject({
        channel: 'email',
        title: 'Pedido Cadeiras',
        body: 'Olá Maria, seu pedido Cadeiras foi recebido.',
        priority: 'normal',
        scheduledFor: null,
        origin: { flowId: 'flow-1', flowExecutionId: 'exec-1', nodeId: 'node-7', solicitationId: 'sol-1' },
        metadata: { deliveryMode: 'immediate', delayMinutes: 0 },
      });
      expect(input.idempotencyKey).toMatch(/^v1:[0-9a-f]{64}$/);
      expect(notifications.dispatch).toHaveBeenCalledWith(NOTIFICATION_ID);
      expect(notifications.summarize).not.toHaveBeenCalled();
      expect(output).toMatchObject({
        notificationId: NOTIFICATION_ID,
        channel: 'email',
        status: 'sent',
        deduplicated: false,
        recipients: { total: 1, sent: 1, failed: 0 },
      });
    });

    it('o output nunca contém conteúdo nem endereços', async () => {
      const { executor } = makeExecutor();
      const output = JSON.stringify(await executor.execute(node(), ctx(), 'n'));
      expect(output).not.toContain('maria@x.com');
      expect(output).not.toContain('Cadeiras');
    });

    it('repassa prioridade e política de retentativa', async () => {
      const { executor, notifications } = makeExecutor();
      await executor.execute(node({ priority: 'high', retryPolicy: { maxAttempts: 4, backoffSeconds: 60 } }), ctx(), 'n');
      expect(notifications.enqueue.mock.calls[0][0]).toMatchObject({
        priority: 'high',
        retryPolicy: { maxAttempts: 4, backoffSeconds: 60 },
      });
    });

    it('trunca ao limite do canal e marca no metadata', async () => {
      const { executor, notifications } = makeExecutor();
      await executor.execute(
        node({ channel: 'in_app', title: undefined, content: 'x'.repeat(900), recipients: [{ type: 'users', userIds: ['3f6c1e2a-0000-4000-8000-000000000001'] }] }),
        ctx(),
        'n',
      );
      const input = notifications.enqueue.mock.calls[0][0];
      expect(input.body).toHaveLength(CHANNEL_LIMITS.in_app.bodyMax);
      expect(input.metadata.truncated).toBe(true);
    });

    it('variável ausente vira vazio, é reportada e não falha o nó', async () => {
      const { executor, notifications } = makeExecutor();
      const output = await executor.execute(node({ content: 'Oi {{nao_existe}}.' }), ctx(), 'n');
      expect(notifications.enqueue.mock.calls[0][0].body).toBe('Oi .');
      expect(output.missingVariables).toEqual(['nao_existe']);
    });

    it('falha quando o conteúdo fica vazio depois das variáveis', async () => {
      const { executor, notifications } = makeExecutor();
      await expect(executor.execute(node({ content: '{{nao_existe}}' }), ctx(), 'n')).rejects.toThrow(
        /conteúdo ficou vazio/,
      );
      expect(notifications.enqueue).not.toHaveBeenCalled();
    });

    it('revalida a configuração em runtime e não envia nada se for inválida', async () => {
      const { executor, notifications } = makeExecutor();
      await expect(executor.execute(node({ recipients: [] }), ctx(), 'n')).rejects.toThrow(/action_notification:/);
      await expect(executor.execute(node({ channel: 'sms' as never }), ctx(), 'n')).rejects.toThrow(
        /action_notification:/,
      );
      expect(notifications.enqueue).not.toHaveBeenCalled();
    });

    it('variáveis são resolvidas em passada única (valor com {{x}} não é reexpandido)', async () => {
      const { executor, notifications } = makeExecutor();
      await executor.execute(
        node({ content: '{{responder_name}}' }),
        ctx({ submission: { responderName: '{{solicitation_title}}' } as never }),
        'n',
      );
      expect(notifications.enqueue.mock.calls[0][0].body).toBe('{{solicitation_title}}');
    });
  });

  describe('resultado do nó (política de falha)', () => {
    it('falha permanente de destinatário → NodeFailureError com output rastreável', async () => {
      const { executor, notifications } = makeExecutor();
      notifications.dispatch.mockResolvedValue(
        summary({
          status: 'partially_sent',
          counts: { total: 3, scheduled: 0, pending: 0, processing: 0, sent: 2, delivered: 0, failed: 1, cancelled: 0 },
          errors: [{ category: 'invalid_recipient', count: 1 }],
        }),
      );
      const promise = executor.execute(node(), ctx(), 'n');
      await expect(promise).rejects.toBeInstanceOf(NodeFailureError);
      await expect(promise).rejects.toThrow('1 de 3 destinatário(s) falharam (invalid_recipient: 1)');
      const error = (await promise.catch((e: NodeFailureError) => e)) as NodeFailureError;
      expect(error.output).toMatchObject({
        notificationId: NOTIFICATION_ID,
        status: 'partially_sent',
        recipients: { total: 3, sent: 2, failed: 1 },
        errors: [{ category: 'invalid_recipient', count: 1 }],
      });
    });

    it('todos falharam → falha o nó', async () => {
      const { executor, notifications } = makeExecutor();
      notifications.dispatch.mockResolvedValue(
        summary({
          status: 'failed',
          counts: { total: 1, scheduled: 0, pending: 0, processing: 0, sent: 0, delivered: 0, failed: 1, cancelled: 0 },
          errors: [{ category: 'not_configured', count: 1 }],
        }),
      );
      await expect(executor.execute(node(), ctx(), 'n')).rejects.toThrow(/not_configured: 1/);
    });

    it('falha transitória com retentativa agendada NÃO falha o nó (o fluxo segue)', async () => {
      const { executor, notifications } = makeExecutor();
      notifications.dispatch.mockResolvedValue(
        summary({
          status: 'pending',
          counts: { total: 2, scheduled: 0, pending: 1, processing: 0, sent: 1, delivered: 0, failed: 0, cancelled: 0 },
          retryScheduled: 1,
        }),
      );
      const output = await executor.execute(node(), ctx(), 'n');
      expect(output).toMatchObject({ status: 'pending', recipients: { pending: 1, retryScheduled: 1, failed: 0 } });
    });

    it('destinatário não resolvido (já `failed` na criação) falha o nó mesmo em background', async () => {
      const { executor, notifications } = makeExecutor();
      notifications.summarize.mockResolvedValue(
        summary({
          status: 'partially_sent',
          counts: { total: 2, scheduled: 0, pending: 1, processing: 0, sent: 0, delivered: 0, failed: 1, cancelled: 0 },
          errors: [{ category: 'invalid_recipient', count: 1 }],
        }),
      );
      await expect(executor.execute(node({ deliveryMode: 'background' }), ctx(), 'n')).rejects.toBeInstanceOf(
        NodeFailureError,
      );
    });

    it('erros de validação do serviço viram erro do nó com prefixo', async () => {
      const { executor, notifications } = makeExecutor();
      notifications.enqueue.mockRejectedValue(new NotificationValidationError('Destinatários demais (60).', 'too_many_recipients'));
      await expect(executor.execute(node(), ctx(), 'n')).rejects.toThrow('action_notification: Destinatários demais (60).');

      notifications.enqueue.mockRejectedValue(new NotificationRateLimitError('Limite de 1000 notificações por hora para este fluxo atingido.'));
      await expect(executor.execute(node(), ctx(), 'n')).rejects.toThrow(/Limite de 1000 notificações por hora/);
    });

    it('erros inesperados do serviço propagam como estão', async () => {
      const { executor, notifications } = makeExecutor();
      notifications.enqueue.mockRejectedValue(new Error('conexão com o banco perdida'));
      await expect(executor.execute(node(), ctx(), 'n')).rejects.toThrow('conexão com o banco perdida');
    });
  });

  describe('background e agendamento', () => {
    it('background só enfileira e resume (não envia na hora)', async () => {
      const { executor, notifications } = makeExecutor();
      const output = await executor.execute(node({ deliveryMode: 'background' }), ctx(), 'n');
      expect(notifications.dispatch).not.toHaveBeenCalled();
      expect(notifications.summarize).toHaveBeenCalledWith(NOTIFICATION_ID);
      expect(notifications.enqueue.mock.calls[0][0].metadata.deliveryMode).toBe('background');
      expect(output.notificationId).toBe(NOTIFICATION_ID);
    });

    it('delayMinutes > 0 agenda para o futuro e implica background', async () => {
      const { executor, notifications } = makeExecutor();
      const before = Date.now();
      await executor.execute(node({ delayMinutes: 30, deliveryMode: 'immediate' }), ctx(), 'n');
      const scheduledFor = notifications.enqueue.mock.calls[0][0].scheduledFor as Date;
      expect(scheduledFor.getTime()).toBeGreaterThanOrEqual(before + 30 * 60_000);
      expect(scheduledFor.getTime()).toBeLessThan(before + 30 * 60_000 + 5_000);
      expect(notifications.dispatch).not.toHaveBeenCalled();
      expect(notifications.summarize).toHaveBeenCalled();
    });

    it('limita o atraso a 7 dias', async () => {
      const { executor, notifications } = makeExecutor();
      const before = Date.now();
      await executor.execute({ ...node(), delayMinutes: 10080 }, ctx(), 'n');
      const scheduledFor = notifications.enqueue.mock.calls[0][0].scheduledFor as Date;
      expect(scheduledFor.getTime() - before).toBeLessThanOrEqual(10080 * 60_000 + 5_000);
    });
  });

  describe('idempotência', () => {
    const keyOf = async (data: ActionNotificationData, context: FlowExecutionContext, nodeId = 'n') => {
      const { executor, notifications } = makeExecutor();
      await executor.execute(data, context, nodeId);
      return notifications.enqueue.mock.calls[0][0].idempotencyKey as string | null;
    };

    it('mesma execução + mesmo nó → mesma chave (reprocessamento não duplica)', async () => {
      expect(await keyOf(node(), ctx(), 'n1')).toBe(await keyOf(node(), ctx(), 'n1'));
    });

    it('execução diferente ou nó diferente → chave diferente', async () => {
      const base = await keyOf(node(), ctx(), 'n1');
      expect(await keyOf(node(), ctx({ flowExecutionId: 'exec-2' }), 'n1')).not.toBe(base);
      expect(await keyOf(node(), ctx(), 'n2')).not.toBe(base);
    });

    it('a chave não depende do conteúdo (editar o texto não gera outro envio na mesma execução)', async () => {
      expect(await keyOf(node({ content: 'um' }), ctx())).toBe(await keyOf(node({ content: 'outro' }), ctx()));
    });

    it('idempotencyKeyTemplate vale entre execuções diferentes (evento reentregue)', async () => {
      const data = node({ idempotencyKeyTemplate: 'aviso-{{solicitation_number}}' });
      const a = await keyOf(data, ctx({ flowExecutionId: 'exec-A' }));
      const b = await keyOf(data, ctx({ flowExecutionId: 'exec-B' }));
      expect(a).toBe(b);
      const other = await keyOf(data, ctx({ solicitation: { id: 'sol-2' } as never }));
      expect(other).not.toBe(a);
    });

    it('template que renderiza vazio cai na chave por execução', async () => {
      const withEmptyTemplate = await keyOf(node({ idempotencyKeyTemplate: '{{nada}}' }), ctx());
      expect(withEmptyTemplate).toBe(await keyOf(node(), ctx()));
    });

    it('sem execução e sem template → sem chave', async () => {
      expect(await keyOf(node(), ctx({ flowExecutionId: undefined }))).toBeNull();
    });
  });

  describe('teste manual do fluxo (dry-run)', () => {
    it('renderiza e resolve, mas não persiste nem envia', async () => {
      const { executor, notifications } = makeExecutor({
        resolved: [
          { source: 'requester', address: 'maria.souza@exemplo.com' },
          { source: 'responsible', unresolvedReason: 'A solicitação não tem responsável atribuído.' },
        ],
      });
      const output = await executor.execute(node(), ctx({ metadata: { testRun: true } }), 'n');

      expect(notifications.enqueue).not.toHaveBeenCalled();
      expect(notifications.dispatch).not.toHaveBeenCalled();
      expect(output).toMatchObject({
        dryRun: true,
        channel: 'email',
        title: 'Pedido Cadeiras',
        preview: 'Olá Maria, seu pedido Cadeiras foi recebido.',
        recipients: [
          { source: 'requester', resolved: true, address: 'ma***@exemplo.com' },
          { source: 'responsible', resolved: false, reason: expect.stringContaining('responsável') },
        ],
      });
      expect(JSON.stringify(output)).not.toContain('maria.souza@exemplo.com');
    });
  });

  describe('prévia do editor', () => {
    it('usa valores de exemplo e reconhece campos do formulário', () => {
      const { executor } = makeExecutor();
      const out = executor.preview({
        channel: 'email',
        title: 'Pedido {{solicitation_title}}',
        content: 'Olá {{responder_name}}! Valor: {{valor}}. Item: {{payload.itens.0.codigo}}. {{desconhecida}}',
        fieldCodes: ['valor'],
      });
      expect(out.title).toBe('Pedido Compra de 10 cadeiras');
      expect(out.body).toBe('Olá Maria Souza! Valor: «valor». Item: «payload.itens.0.codigo».');
      expect(out.missingVariables).toEqual(['desconhecida']);
      expect(out.malformed).toBe(false);
      expect(out.limits).toEqual(CHANNEL_LIMITS.email);
    });

    it('sinaliza variável mal formada e truncamento', () => {
      const { executor } = makeExecutor();
      const out = executor.preview({ channel: 'in_app', content: `{{ x ${'a'.repeat(600)}` });
      expect(out.malformed).toBe(true);
      expect(out.truncated).toBe(true);
    });

    it('ignora códigos de campo que não são identificadores', () => {
      const { executor } = makeExecutor();
      const out = executor.preview({ channel: 'email', content: '{{ok}}', fieldCodes: ['ok', 'com-hifen', '1x'] });
      expect(out.body).toBe('«ok»');
    });
  });

  describe('"Ignorar destinatários sem contato" (skipUnresolvedRecipients)', () => {
    const semContato = { source: 'requester', unresolvedReason: 'Solicitante sem contato (e-mail, telefone ou usuário).' };

    it('ninguém com contato: pula o aviso com sucesso, sem gravar nem enviar', async () => {
      const { executor, notifications } = makeExecutor({ resolved: [semContato] });

      const output = await executor.execute(node({ skipUnresolvedRecipients: true }), ctx(), 'n');

      expect(output).toMatchObject({
        skipped: true,
        channel: 'email',
        ignoredRecipients: 1,
        summary: expect.stringContaining('Pulou o aviso: nenhum destinatário com contato'),
      });
      expect(notifications.enqueue).not.toHaveBeenCalled();
      expect(notifications.dispatch).not.toHaveBeenCalled();
    });

    it('envia só para quem tem contato e conta os ignorados', async () => {
      const { executor, notifications } = makeExecutor({
        resolved: [semContato, { source: 'custom', address: 'comercial@x.com' }],
      });

      const output = await executor.execute(node({ skipUnresolvedRecipients: true }), ctx(), 'n');

      expect(notifications.enqueue.mock.calls[0][0].recipients).toEqual([
        { source: 'custom', address: 'comercial@x.com' },
      ]);
      expect(output).toMatchObject({ status: 'sent', ignoredRecipients: 1 });
    });

    it('no teste manual diz que pularia', async () => {
      const { executor } = makeExecutor({ resolved: [semContato] });

      const output = await executor.execute(
        node({ skipUnresolvedRecipients: true }),
        ctx({ metadata: { testRun: true } }),
        'n',
      );

      expect(output).toMatchObject({ dryRun: true, skipped: true, summary: expect.stringContaining('Pularia o aviso') });
    });

    it('sem a opção, quem não tem contato segue para o envio (e falha lá, como sempre)', async () => {
      const { executor, notifications } = makeExecutor({ resolved: [semContato] });

      await executor.execute(node(), ctx(), 'n');

      expect(notifications.enqueue.mock.calls[0][0].recipients).toEqual([semContato]);
    });
  });
});
