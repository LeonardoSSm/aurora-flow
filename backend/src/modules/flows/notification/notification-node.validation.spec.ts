import { getNotificationNodeErrors } from './notification-node.validation';

const USER_ID = '3f6c1e2a-0000-4000-8000-000000000001';

function valid(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    channel: 'email',
    title: 'Pedido {{solicitation_number}}',
    content: 'Olá {{responder_name}}, recebemos seu pedido.',
    recipients: [{ type: 'requester' }],
    ...overrides,
  };
}

describe('getNotificationNodeErrors', () => {
  it('aceita uma configuração mínima válida por canal', () => {
    expect(getNotificationNodeErrors(valid())).toEqual([]);
    expect(
      getNotificationNodeErrors({
        channel: 'in_app',
        content: 'Nova aprovação',
        recipients: [{ type: 'users', userIds: [USER_ID] }],
      }),
    ).toEqual([]);
    expect(
      getNotificationNodeErrors({
        channel: 'whatsapp',
        content: 'Oi',
        recipients: [{ type: 'custom', value: '(85) 99999-1234' }],
      }),
    ).toEqual([]);
  });

  it('aceita todas as opções preenchidas corretamente', () => {
    expect(
      getNotificationNodeErrors(
        valid({
          priority: 'high',
          delayMinutes: 90,
          deliveryMode: 'background',
          continueOnFailure: true,
          retryPolicy: { maxAttempts: 4, backoffSeconds: 60 },
          idempotencyKeyTemplate: 'aviso-{{solicitation_number}}',
        }),
      ),
    ).toEqual([]);
  });

  it('rejeita dados nulos/vazios sem lançar', () => {
    expect(getNotificationNodeErrors(null).length).toBeGreaterThan(0);
    expect(getNotificationNodeErrors(undefined).length).toBeGreaterThan(0);
    expect(getNotificationNodeErrors({}).length).toBeGreaterThan(0);
  });

  describe('canal', () => {
    it.each([undefined, '', 'sms', 'push', 'telegram', 42])('rejeita channel %p', (channel) => {
      const errors = getNotificationNodeErrors(valid({ channel }));
      expect(errors.some((e) => e.includes('channel'))).toBe(true);
    });
  });

  describe('conteúdo', () => {
    it('exige content', () => {
      expect(getNotificationNodeErrors(valid({ content: '' }))).toContain('requer content.');
      expect(getNotificationNodeErrors(valid({ content: '   ' }))).toContain('requer content.');
      expect(getNotificationNodeErrors(valid({ content: undefined }))).toContain('requer content.');
    });

    it('limita o tamanho do modelo', () => {
      const errors = getNotificationNodeErrors(valid({ content: 'a'.repeat(4001) }));
      expect(errors.some((e) => e.includes('content excede'))).toBe(true);
      expect(getNotificationNodeErrors(valid({ content: 'a'.repeat(4000) }))).toEqual([]);
    });

    it.each(['Olá {{nome', 'Olá {{ a b }}', '{{1x}}', '{{}}'])('rejeita variável mal formada %p', (content) => {
      const errors = getNotificationNodeErrors(valid({ content }));
      expect(errors.some((e) => e.includes('mal formada'))).toBe(true);
    });

    it('e-mail exige assunto; os demais canais não', () => {
      expect(getNotificationNodeErrors(valid({ title: '' }))).toContain('requer title (assunto do e-mail).');
      expect(getNotificationNodeErrors(valid({ title: undefined }))).toContain(
        'requer title (assunto do e-mail).',
      );
      expect(
        getNotificationNodeErrors(valid({ channel: 'whatsapp', title: undefined, recipients: [{ type: 'requester' }] })),
      ).toEqual([]);
    });

    it('limita o assunto e valida suas variáveis', () => {
      expect(getNotificationNodeErrors(valid({ title: 'a'.repeat(301) })).some((e) => e.includes('title excede'))).toBe(
        true,
      );
      expect(
        getNotificationNodeErrors(valid({ title: 'Pedido {{x' })).some((e) => e.includes('title tem variável')),
      ).toBe(true);
      expect(getNotificationNodeErrors(valid({ title: 123 })).some((e) => e.includes('title deve ser texto'))).toBe(true);
    });
  });

  describe('destinatários', () => {
    it('exige ao menos um', () => {
      expect(getNotificationNodeErrors(valid({ recipients: [] }))).toContain(
        'requer ao menos um destinatário em recipients.',
      );
      expect(getNotificationNodeErrors(valid({ recipients: undefined }))).toContain(
        'requer ao menos um destinatário em recipients.',
      );
      expect(getNotificationNodeErrors(valid({ recipients: 'a@b.com' }))).toContain(
        'requer ao menos um destinatário em recipients.',
      );
    });

    it('rejeita tipo desconhecido ou item inválido', () => {
      expect(
        getNotificationNodeErrors(valid({ recipients: [{ type: 'everyone' }] })).some((e) => e.includes('type inválido')),
      ).toBe(true);
      expect(getNotificationNodeErrors(valid({ recipients: [null] })).some((e) => e.includes('type inválido'))).toBe(true);
      expect(getNotificationNodeErrors(valid({ recipients: ['x'] })).some((e) => e.includes('type inválido'))).toBe(true);
    });

    it('users exige UUIDs válidos', () => {
      expect(getNotificationNodeErrors(valid({ recipients: [{ type: 'users', userIds: [] }] }))).toContain(
        'recipients[0] requer userIds não vazio.',
      );
      expect(getNotificationNodeErrors(valid({ recipients: [{ type: 'users', userIds: ['abc'] }] }))).toContain(
        'recipients[0] tem userIds inválidos.',
      );
      expect(getNotificationNodeErrors(valid({ recipients: [{ type: 'users', userIds: [USER_ID] }] }))).toEqual([]);
    });

    it('custom valida o formato quando o valor é fixo (e-mail)', () => {
      expect(
        getNotificationNodeErrors(valid({ recipients: [{ type: 'custom', value: 'a@b.com, c@d.com' }] })),
      ).toEqual([]);
      expect(getNotificationNodeErrors(valid({ recipients: [{ type: 'custom', value: 'nao-e-email' }] }))).toContain(
        'recipients[0] tem e-mail inválido.',
      );
    });

    it('custom valida o formato quando o valor é fixo (telefone)', () => {
      expect(
        getNotificationNodeErrors(
          valid({ channel: 'whatsapp', title: undefined, recipients: [{ type: 'custom', value: 'abc' }] }),
        ),
      ).toContain('recipients[0] tem telefone ou grupo inválido.');
    });

    it('custom aceita grupo do WhatsApp pelo JID', () => {
      expect(
        getNotificationNodeErrors(
          valid({
            channel: 'whatsapp',
            title: undefined,
            recipients: [{ type: 'custom', value: '120363025246125486@g.us' }],
          }),
        ),
      ).toEqual([]);
    });

    it('custom com variável não é validado em formato (só em runtime)', () => {
      expect(
        getNotificationNodeErrors(valid({ recipients: [{ type: 'custom', value: '{{responder_email}}' }] })),
      ).toEqual([]);
      expect(
        getNotificationNodeErrors(valid({ recipients: [{ type: 'custom', value: '{{responder_email' }] })),
      ).toContain('recipients[0] tem variável mal formada.');
      expect(getNotificationNodeErrors(valid({ recipients: [{ type: 'custom', value: '' }] }))).toContain(
        'recipients[0] requer value.',
      );
    });

    it('field e payload_path exigem seus parâmetros', () => {
      expect(getNotificationNodeErrors(valid({ recipients: [{ type: 'field', fieldCode: '' }] }))).toContain(
        'recipients[0] requer fieldCode.',
      );
      expect(getNotificationNodeErrors(valid({ recipients: [{ type: 'payload_path', path: '' }] }))).toContain(
        'recipients[0] requer path.',
      );
      expect(
        getNotificationNodeErrors(
          valid({ recipients: [{ type: 'field', fieldCode: 'email' }, { type: 'payload_path', path: 'a.b' }] }),
        ),
      ).toEqual([]);
    });

    it('respeita o limite de destinatários estáticos', () => {
      const ids = Array.from({ length: 51 }, (_, i) => `3f6c1e2a-0000-4000-8000-${String(i).padStart(12, '0')}`);
      const errors = getNotificationNodeErrors(valid({ recipients: [{ type: 'users', userIds: ids }] }));
      expect(errors.some((e) => e.includes('excede o limite de 50'))).toBe(true);
      expect(
        getNotificationNodeErrors(valid({ recipients: [{ type: 'users', userIds: ids }] }), { maxRecipients: 100 }),
      ).toEqual([]);
    });
  });

  describe('opções', () => {
    it.each([
      [{ priority: 'urgent' }, 'priority inválida'],
      [{ delayMinutes: -1 }, 'delayMinutes'],
      [{ delayMinutes: 10081 }, 'delayMinutes'],
      [{ delayMinutes: 1.5 }, 'delayMinutes'],
      [{ delayMinutes: 'abc' }, 'delayMinutes'],
      [{ deliveryMode: 'later' }, 'deliveryMode'],
      [{ continueOnFailure: 'yes' }, 'continueOnFailure'],
      [{ retryPolicy: 'x' }, 'retryPolicy inválida'],
      [{ retryPolicy: [] }, 'retryPolicy inválida'],
      [{ retryPolicy: { maxAttempts: 0 } }, 'retryPolicy.maxAttempts'],
      [{ retryPolicy: { maxAttempts: 6 } }, 'retryPolicy.maxAttempts'],
      [{ retryPolicy: { backoffSeconds: 1 } }, 'retryPolicy.backoffSeconds'],
      [{ retryPolicy: { backoffSeconds: 4000 } }, 'retryPolicy.backoffSeconds'],
      [{ idempotencyKeyTemplate: 'a'.repeat(201) }, 'idempotencyKeyTemplate excede'],
      [{ idempotencyKeyTemplate: 'x-{{' }, 'idempotencyKeyTemplate tem variável'],
      [{ idempotencyKeyTemplate: 5 }, 'idempotencyKeyTemplate deve ser texto'],
    ])('rejeita %j', (override, expected) => {
      const errors = getNotificationNodeErrors(valid(override));
      expect(errors.some((e) => e.includes(expected))).toBe(true);
    });

    it('aceita extremos válidos e idempotencyKeyTemplate vazio', () => {
      expect(
        getNotificationNodeErrors(
          valid({
            delayMinutes: 0,
            retryPolicy: { maxAttempts: 1, backoffSeconds: 5 },
            idempotencyKeyTemplate: '',
          }),
        ),
      ).toEqual([]);
      expect(getNotificationNodeErrors(valid({ delayMinutes: 10080, retryPolicy: { maxAttempts: 5, backoffSeconds: 3600 } }))).toEqual(
        [],
      );
    });

    it('acumula vários erros de uma vez', () => {
      const errors = getNotificationNodeErrors({ channel: 'sms', content: '', recipients: [] });
      expect(errors.length).toBeGreaterThanOrEqual(3);
    });
  });
});
