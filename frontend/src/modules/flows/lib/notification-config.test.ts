import { describe, expect, it } from 'vitest';
import type { FlowNodeData } from '../types/flow.types';
import {
  MAX_DELAY_MINUTES,
  NOTIFICATION_BUILTIN_VARIABLES,
  NOTIFICATION_CHANNELS,
  channelInfo,
  countStaticRecipients,
  formatDelay,
  getNotificationConfigError,
  getNotificationConfigIssues,
  hasMalformedTokens,
  recipientError,
  summarizeNotification,
} from './notification-config';

const USER_ID = '3f6c1e2a-0000-4000-8000-000000000001';

function valid(overrides: Partial<FlowNodeData> = {}): FlowNodeData {
  return {
    channel: 'email',
    title: 'Assunto',
    content: 'Olá {{responder_name}}',
    recipients: [{ type: 'requester' }],
    ...overrides,
  };
}

describe('notification-config', () => {
  describe('getNotificationConfigIssues', () => {
    it('configuração mínima válida não tem problemas', () => {
      expect(getNotificationConfigIssues(valid())).toEqual([]);
      expect(getNotificationConfigError(valid())).toBeNull();
    });

    it('um nó recém-criado (sem nada) acusa canal/destinatário/mensagem — não “passa em branco”', () => {
      const fields = getNotificationConfigIssues({}).map((i) => i.field);
      expect(fields).toEqual(expect.arrayContaining(['channel', 'content', 'recipients']));
      expect(
        getNotificationConfigIssues({ channel: 'email', recipients: [], title: '', content: '' }).map((i) => i.field),
      ).toEqual(expect.arrayContaining(['content', 'title', 'recipients']));
    });

    it('e-mail exige assunto; in_app e WhatsApp não', () => {
      expect(getNotificationConfigError(valid({ title: '' }))).toMatch(/assunto/i);
      expect(getNotificationConfigIssues(valid({ channel: 'in_app', title: '', recipients: [{ type: 'responsible' }] }))).toEqual([]);
      expect(getNotificationConfigIssues(valid({ channel: 'whatsapp', title: undefined }))).toEqual([]);
    });

    it('valida a mensagem: vazia, grande demais e variável mal formada', () => {
      expect(getNotificationConfigIssues(valid({ content: '   ' }))[0]).toMatchObject({ field: 'content' });
      expect(getNotificationConfigIssues(valid({ content: 'a'.repeat(4001) }))[0].message).toMatch(/excede 4000/);
      expect(getNotificationConfigIssues(valid({ content: 'Oi {{nome' }))[0].message).toMatch(/mal formada/);
      expect(getNotificationConfigIssues(valid({ title: 'Pedido {{x' }))[0]).toMatchObject({ field: 'title' });
    });

    it('valida atraso, tentativas e intervalo', () => {
      expect(getNotificationConfigIssues(valid({ delayMinutes: -1 }))[0]).toMatchObject({ field: 'delayMinutes' });
      expect(getNotificationConfigIssues(valid({ delayMinutes: MAX_DELAY_MINUTES + 1 }))[0]).toMatchObject({ field: 'delayMinutes' });
      expect(getNotificationConfigIssues(valid({ delayMinutes: 1.5 }))[0]).toMatchObject({ field: 'delayMinutes' });
      expect(getNotificationConfigIssues(valid({ delayMinutes: 0 }))).toEqual([]);
      expect(getNotificationConfigIssues(valid({ retryPolicy: { maxAttempts: 0 } }))[0]).toMatchObject({ field: 'retryPolicy' });
      expect(getNotificationConfigIssues(valid({ retryPolicy: { maxAttempts: 6 } }))[0]).toMatchObject({ field: 'retryPolicy' });
      expect(getNotificationConfigIssues(valid({ retryPolicy: { backoffSeconds: 4 } }))[0]).toMatchObject({ field: 'retryPolicy' });
      expect(getNotificationConfigIssues(valid({ retryPolicy: { maxAttempts: 5, backoffSeconds: 3600 } }))).toEqual([]);
    });

    it('valida a chave de idempotência', () => {
      expect(getNotificationConfigIssues(valid({ idempotencyKeyTemplate: 'a'.repeat(201) }))[0]).toMatchObject({
        field: 'idempotencyKeyTemplate',
      });
      expect(getNotificationConfigIssues(valid({ idempotencyKeyTemplate: 'x-{{' }))[0]).toMatchObject({
        field: 'idempotencyKeyTemplate',
      });
      expect(getNotificationConfigIssues(valid({ idempotencyKeyTemplate: 'aviso-{{solicitation_number}}' }))).toEqual([]);
    });

    it('limita destinatários estáticos a 50', () => {
      const ids = Array.from({ length: 51 }, (_, i) => `3f6c1e2a-0000-4000-8000-${String(i).padStart(12, '0')}`);
      expect(getNotificationConfigError(valid({ recipients: [{ type: 'users', userIds: ids }] }))).toMatch(/No máximo 50/);
    });

    it('indica qual destinatário está errado', () => {
      const issues = getNotificationConfigIssues(
        valid({ recipients: [{ type: 'requester' }, { type: 'custom', value: 'sem-arroba' }] }),
      );
      expect(issues).toEqual([{ field: 'recipients', message: 'Destinatário 2: E-mail inválido.' }]);
    });
  });

  describe('recipientError', () => {
    it('users: exige seleção de UUIDs válidos', () => {
      expect(recipientError({ type: 'users', userIds: [] }, 'email')).toMatch(/ao menos um usuário/);
      expect(recipientError({ type: 'users', userIds: ['abc'] }, 'email')).toMatch(/inválidos/);
      expect(recipientError({ type: 'users', userIds: [USER_ID] }, 'email')).toBeNull();
    });

    it('requester e responsible não têm parâmetros', () => {
      expect(recipientError({ type: 'requester' }, 'email')).toBeNull();
      expect(recipientError({ type: 'responsible' }, 'whatsapp')).toBeNull();
    });

    it('custom: formato conforme o canal, e valor dinâmico só é validado na execução', () => {
      expect(recipientError({ type: 'custom', value: 'a@b.com, c@d.com' }, 'email')).toBeNull();
      expect(recipientError({ type: 'custom', value: 'a@b.com, lixo' }, 'email')).toBe('E-mail inválido.');
      expect(recipientError({ type: 'custom', value: '(85) 99999-1234' }, 'whatsapp')).toBeNull();
      expect(recipientError({ type: 'custom', value: 'abc' }, 'whatsapp')).toBe('Telefone ou grupo inválido.');
      expect(recipientError({ type: 'custom', value: '120363025246125486@g.us' }, 'whatsapp')).toBeNull();
      expect(recipientError({ type: 'custom', value: 'grupo@g.us' }, 'whatsapp')).toBe('Telefone ou grupo inválido.');
      expect(recipientError({ type: 'custom', value: '{{responder_email}}' }, 'email')).toBeNull();
      expect(recipientError({ type: 'custom', value: '{{responder_email' }, 'email')).toMatch(/mal formada/);
      expect(recipientError({ type: 'custom', value: '  ' }, 'email')).toBe('Informe o valor.');
      expect(recipientError({ type: 'custom', value: 'qualquer coisa' }, 'in_app')).toBeNull();
    });

    it('field e payload_path exigem o parâmetro', () => {
      expect(recipientError({ type: 'field', fieldCode: '' }, 'email')).toBe('Escolha o campo.');
      expect(recipientError({ type: 'field', fieldCode: 'email' }, 'email')).toBeNull();
      expect(recipientError({ type: 'payload_path', path: ' ' }, 'email')).toMatch(/caminho/i);
      expect(recipientError({ type: 'payload_path', path: 'a.b' }, 'email')).toBeNull();
    });

    it('tipo desconhecido (fluxo salvo por versão futura) é recusado', () => {
      expect(recipientError({ type: 'outro' } as never, 'email')).toBe('Tipo de destinatário inválido.');
    });
  });

  describe('countStaticRecipients', () => {
    it('conta usuários e itens de listas fixas; valor dinâmico conta como 1', () => {
      expect(
        countStaticRecipients([
          { type: 'users', userIds: ['a', 'b', 'c'] },
          { type: 'requester' },
          { type: 'custom', value: 'a@x.com, b@x.com' },
          { type: 'custom', value: '{{lista}}' },
          { type: 'field', fieldCode: 'x' },
          { type: 'payload_path', path: 'p' },
        ]),
      ).toBe(3 + 1 + 2 + 1 + 1 + 1);
    });
  });

  describe('summarizeNotification (texto do cartão)', () => {
    it('sem configuração pede configuração', () => {
      expect(summarizeNotification({})).toBe('Configurar...');
      expect(summarizeNotification({ channel: 'email', recipients: [] })).toBe('Configurar...');
    });

    it('descreve canal e quantidade, com singular/plural', () => {
      expect(summarizeNotification(valid())).toBe('E-mail · 1 destinatário');
      expect(
        summarizeNotification(valid({ channel: 'in_app', recipients: [{ type: 'users', userIds: ['a', 'b'] }] })),
      ).toBe('Notificação no sistema · 2 destinatários');
    });

    it('mostra atraso e segundo plano', () => {
      expect(summarizeNotification(valid({ delayMinutes: 90 }))).toBe('E-mail · 1 destinatário · em 90 min');
      expect(summarizeNotification(valid({ delayMinutes: 120 }))).toBe('E-mail · 1 destinatário · em 2 h');
      expect(summarizeNotification(valid({ deliveryMode: 'background' }))).toBe('E-mail · 1 destinatário · em segundo plano');
    });
  });

  it('formatDelay escolhe a melhor unidade', () => {
    expect(formatDelay(45)).toBe('45 min');
    expect(formatDelay(60)).toBe('1 h');
    expect(formatDelay(2880)).toBe('2 d');
    expect(formatDelay(1500)).toBe('25 h');
    expect(formatDelay(1501)).toBe('1501 min');
  });

  it('hasMalformedTokens detecta chaves soltas', () => {
    expect(hasMalformedTokens('Oi {{nome}} e {{a.b}}')).toBe(false);
    expect(hasMalformedTokens('sem variáveis')).toBe(false);
    for (const text of ['{{nome', '{{ a b }}', '{{1x}}', '{{}}', '{{a}} {{']) {
      expect(hasMalformedTokens(text)).toBe(true);
    }
  });

  it('channelInfo e a lista de canais batem com o backend (limites e obrigatoriedade)', () => {
    expect(NOTIFICATION_CHANNELS.map((c) => c.id)).toEqual(['in_app', 'email', 'whatsapp']);
    expect(channelInfo('email')).toMatchObject({ titleRequired: true, bodyMax: 20000, titleMax: 200 });
    expect(channelInfo('in_app')).toMatchObject({ titleRequired: false, bodyMax: 500, titleMax: 150 });
    expect(channelInfo('whatsapp')).toMatchObject({ titleRequired: false, bodyMax: 4000 });
    expect(channelInfo('sms')).toBeUndefined();
  });

  it('as variáveis embutidas são as mesmas do backend (16 nomes únicos)', () => {
    const names = NOTIFICATION_BUILTIN_VARIABLES.map((v) => v.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(
      expect.arrayContaining(['responder_name', 'solicitation_title', 'tracking_url', 'approval_link', 'approval_status', 'approval_title', 'approval_description']),
    );
    expect(names).toHaveLength(16);
  });
});
