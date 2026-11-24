import type { FlowExecutionContext, NotificationRecipientSpec } from '../types/flow.types';
import { NotificationRecipientResolver } from './notification-recipient.resolver';

type UserRow = { id: string; fullName: string; email: string; isActive: boolean };

function makeResolver(users: UserRow[] = []) {
  const repo = {
    find: jest.fn(async ({ where }: { where: { id: { value: string[] } } }) => {
      const ids = where.id.value;
      return users.filter((u) => ids.includes(u.id));
    }),
    findOne: jest.fn(async ({ where }: { where: { email: string; isActive: boolean } }) => {
      return users.find((u) => u.email === where.email && u.isActive === where.isActive) ?? null;
    }),
  };
  return { resolver: new NotificationRecipientResolver(repo as never), repo };
}

const ctx = (overrides: Partial<FlowExecutionContext> = {}): FlowExecutionContext =>
  ({ eventName: 'test', ...overrides }) as FlowExecutionContext;

const maria: UserRow = { id: 'u-maria', fullName: 'Maria Souza', email: 'maria@x.com', isActive: true };
const joao: UserRow = { id: 'u-joao', fullName: 'João Lima', email: 'joao@x.com', isActive: true };
const inativo: UserRow = { id: 'u-off', fullName: 'Inativo', email: 'off@x.com', isActive: false };

async function resolve(
  specs: NotificationRecipientSpec[],
  channel: 'in_app' | 'email' | 'whatsapp',
  context: FlowExecutionContext = ctx(),
  users: UserRow[] = [maria, joao, inativo],
  variables: Record<string, string> = {},
) {
  const { resolver } = makeResolver(users);
  return resolver.resolve(specs, context, channel, variables);
}

describe('NotificationRecipientResolver', () => {
  describe('users', () => {
    it('e-mail: devolve usuário + e-mail; in_app: só o usuário; whatsapp: sem telefone', async () => {
      const spec: NotificationRecipientSpec[] = [{ type: 'users', userIds: ['u-maria'] }];
      expect(await resolve(spec, 'email')).toEqual([
        { source: 'user', userId: 'u-maria', displayName: 'Maria Souza', address: 'maria@x.com' },
      ]);
      expect(await resolve(spec, 'in_app')).toEqual([
        { source: 'user', userId: 'u-maria', displayName: 'Maria Souza', address: null },
      ]);
      expect(await resolve(spec, 'whatsapp')).toEqual([
        { source: 'user', userId: 'u-maria', displayName: 'Maria Souza', address: null },
      ]);
    });

    it('usuário inexistente ou inativo vira destinatário não resolvido (não some)', async () => {
      const out = await resolve([{ type: 'users', userIds: ['u-off', 'u-fantasma', 'u-joao'] }], 'email');
      expect(out).toHaveLength(3);
      expect(out[0]).toMatchObject({ source: 'user', userId: 'u-off', unresolvedReason: expect.any(String) });
      expect(out[1]).toMatchObject({ userId: 'u-fantasma', unresolvedReason: expect.any(String) });
      expect(out[2]).toMatchObject({ userId: 'u-joao', address: 'joao@x.com' });
    });

    it('ids repetidos são consultados uma vez só', async () => {
      const { resolver, repo } = makeResolver([maria]);
      const out = await resolver.resolve([{ type: 'users', userIds: ['u-maria', 'u-maria'] }], ctx(), 'email', {});
      expect(out).toHaveLength(1);
      expect(repo.find).toHaveBeenCalledTimes(1);
    });
  });

  describe('requester', () => {
    it('usa o e-mail da submissão para e-mail e o telefone da solicitação para WhatsApp', async () => {
      const context = ctx({
        solicitation: {
          requesterPhone: '85999991234',
          createdByUser: { id: 'u-criador', fullName: 'Criador', email: 'criador@x.com' },
          submission: { responderName: 'Maria', responderEmail: 'maria@cliente.com' },
        } as never,
      });
      expect(await resolve([{ type: 'requester' }], 'email', context)).toEqual([
        { source: 'requester', userId: 'u-criador', displayName: 'Maria', address: 'maria@cliente.com' },
      ]);
      expect(await resolve([{ type: 'requester' }], 'whatsapp', context)).toEqual([
        { source: 'requester', userId: 'u-criador', displayName: 'Maria', address: '85999991234' },
      ]);
      expect(await resolve([{ type: 'requester' }], 'in_app', context)).toEqual([
        { source: 'requester', userId: 'u-criador', displayName: 'Maria', address: null },
      ]);
    });

    it('sem solicitação, usa a submissão do contexto (gatilho de formulário)', async () => {
      const context = ctx({ submission: { responderName: 'Ana', responderEmail: 'ana@x.com' } as never });
      const [recipient] = await resolve([{ type: 'requester' }], 'email', context);
      expect(recipient).toMatchObject({ source: 'requester', address: 'ana@x.com', displayName: 'Ana', userId: null });
    });

    it('sem nenhum contato → não resolvido', async () => {
      const [recipient] = await resolve([{ type: 'requester' }], 'email', ctx());
      expect(recipient).toMatchObject({ source: 'requester', unresolvedReason: expect.stringContaining('sem contato') });
    });
  });

  describe('responsible', () => {
    it('usa o assignee (e-mail) e responsiblePhone (WhatsApp)', async () => {
      const context = ctx({
        solicitation: {
          assignee: { id: 'u-joao', fullName: 'João Lima', email: 'joao@x.com' },
          responsiblePhone: '85988887777',
        } as never,
      });
      expect(await resolve([{ type: 'responsible' }], 'email', context)).toEqual([
        { source: 'responsible', userId: 'u-joao', displayName: 'João Lima', address: 'joao@x.com' },
      ]);
      expect(await resolve([{ type: 'responsible' }], 'whatsapp', context)).toEqual([
        { source: 'responsible', userId: 'u-joao', displayName: 'João Lima', address: '85988887777' },
      ]);
    });

    it('sem responsável → não resolvido', async () => {
      const [recipient] = await resolve([{ type: 'responsible' }], 'email', ctx({ solicitation: {} as never }));
      expect(recipient).toMatchObject({ unresolvedReason: expect.stringContaining('responsável') });
    });
  });

  describe('custom', () => {
    it('divide por vírgula/ponto e vírgula/quebra de linha e interpola variáveis', async () => {
      const out = await resolve(
        [{ type: 'custom', value: 'a@x.com; {{responder_email}}\nc@x.com' }],
        'email',
        ctx(),
        [],
        { responder_email: 'resp@x.com' },
      );
      expect(out.map((r) => r.address)).toEqual(['a@x.com', 'resp@x.com', 'c@x.com']);
      expect(out.every((r) => r.source === 'custom')).toBe(true);
    });

    it('valor que renderiza vazio → não resolvido', async () => {
      const [recipient] = await resolve([{ type: 'custom', value: '{{inexistente}}' }], 'email');
      expect(recipient).toMatchObject({ source: 'custom', unresolvedReason: expect.any(String) });
    });

    it('in_app: cada e-mail vira um usuário ativo; desconhecido/inativo é não resolvido', async () => {
      const out = await resolve([{ type: 'custom', value: 'maria@x.com, off@x.com, ninguem@x.com' }], 'in_app');
      expect(out[0]).toMatchObject({ userId: 'u-maria', displayName: 'Maria Souza' });
      expect(out[1]).toMatchObject({ unresolvedReason: expect.stringContaining('Nenhum usuário ativo') });
      expect(out[2]).toMatchObject({ unresolvedReason: expect.stringContaining('Nenhum usuário ativo') });
    });

    it('in_app: e-mail em maiúsculas é normalizado antes da busca', async () => {
      const [recipient] = await resolve([{ type: 'custom', value: 'MARIA@X.COM' }], 'in_app');
      expect(recipient).toMatchObject({ userId: 'u-maria' });
    });
  });

  describe('field', () => {
    it('lê o valor do campo do formulário (string, CSV ou lista)', async () => {
      const context = ctx({ fields: { email: 'a@x.com', copia: 'b@x.com, c@x.com', lista: ['d@x.com', 'e@x.com'] } });
      expect((await resolve([{ type: 'field', fieldCode: 'email' }], 'email', context)).map((r) => r.address)).toEqual([
        'a@x.com',
      ]);
      expect((await resolve([{ type: 'field', fieldCode: 'copia' }], 'email', context)).map((r) => r.address)).toEqual([
        'b@x.com',
        'c@x.com',
      ]);
      expect((await resolve([{ type: 'field', fieldCode: 'lista' }], 'email', context)).map((r) => r.address)).toEqual([
        'd@x.com',
        'e@x.com',
      ]);
    });

    it('aceita número (telefone digitado como número)', async () => {
      const [r] = await resolve([{ type: 'field', fieldCode: 'tel' }], 'whatsapp', ctx({ fields: { tel: 85999991234 } }));
      expect(r.address).toBe('85999991234');
    });

    it('campo vazio ou ausente → não resolvido, sem vazar dado', async () => {
      const [empty] = await resolve([{ type: 'field', fieldCode: 'email' }], 'email', ctx({ fields: { email: '' } }));
      const [missing] = await resolve([{ type: 'field', fieldCode: 'email' }], 'email', ctx());
      expect(empty.unresolvedReason).toContain('email');
      expect(missing.unresolvedReason).toContain('email');
    });
  });

  describe('payload_path', () => {
    const context = ctx({
      metadata: {
        payload: {
          aprovadores: [{ email: 'a@x.com' }, { email: 'b@x.com' }, { nome: 'sem email' }],
          csv: 'c@x.com;d@x.com',
          tels: [{ phone: '85999991234' }],
        },
      },
    });

    it('aceita lista de objetos com email, CSV e telefones', async () => {
      expect((await resolve([{ type: 'payload_path', path: 'aprovadores' }], 'email', context)).map((r) => r.address)).toEqual([
        'a@x.com',
        'b@x.com',
      ]);
      expect((await resolve([{ type: 'payload_path', path: 'csv' }], 'email', context)).map((r) => r.address)).toEqual([
        'c@x.com',
        'd@x.com',
      ]);
      expect((await resolve([{ type: 'payload_path', path: 'tels' }], 'whatsapp', context)).map((r) => r.address)).toEqual([
        '85999991234',
      ]);
    });

    it('caminho inexistente → não resolvido com o caminho no motivo', async () => {
      const [r] = await resolve([{ type: 'payload_path', path: 'nao.existe' }], 'email', context);
      expect(r.unresolvedReason).toContain('nao.existe');
    });
  });

  it('preserva a ordem das especificações e junta tudo', async () => {
    const out = await resolve(
      [
        { type: 'users', userIds: ['u-maria'] },
        { type: 'custom', value: 'x@x.com' },
        { type: 'responsible' },
      ],
      'email',
      ctx(),
    );
    expect(out.map((r) => r.source)).toEqual(['user', 'custom', 'responsible']);
  });

  it('nunca inclui e-mail/telefone no motivo de não resolvido', async () => {
    const out = await resolve(
      [
        { type: 'users', userIds: ['u-off'] },
        { type: 'custom', value: 'ninguem@x.com' },
      ],
      'in_app',
    );
    for (const r of out) {
      expect(r.unresolvedReason).toBeDefined();
      expect(r.unresolvedReason).not.toMatch(/@/);
    }
  });
});
