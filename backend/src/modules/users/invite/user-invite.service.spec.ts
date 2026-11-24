import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { Repository } from 'typeorm';
import type { UserEntity } from '../../../database/entities';
import type { FlowMailerService } from '../../flows/mailer/flow-mailer.service';
import type { SettingsService } from '../../settings/settings.service';
import { buildUserInviteEmail } from './user-invite-email';
import { UserInviteService } from './user-invite.service';
import { generateInviteToken, hashInviteToken, isPlausibleInviteToken } from './user-invite-token';

const FRONTEND = 'https://flow.exemplo.com';

function makeConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback) } as unknown as ConfigService;
}

function makeUser(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    id: 'user-1',
    fullName: 'Maria Souza',
    email: 'maria@exemplo.com',
    isActive: true,
    inviteExpiresAt: null,
    ...overrides,
  } as UserEntity;
}

describe('UserInviteService', () => {
  let repo: {
    findOne: jest.Mock;
    update: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let mailer: { isConfigured: jest.Mock; sendDetailed: jest.Mock };
  let emitter: { emit: jest.Mock };
  let settings: { getValue: jest.Mock };
  let qb: Record<string, jest.Mock>;

  function makeService(config = makeConfig({ FRONTEND_URL: `${FRONTEND}/`, NODE_ENV: 'production' })) {
    const service = new UserInviteService(
      config,
      mailer as unknown as FlowMailerService,
      settings as unknown as SettingsService,
      emitter as unknown as EventEmitter2,
      repo as unknown as Repository<UserEntity>,
    );
    jest.spyOn(service as unknown as { wait: () => Promise<void> }, 'wait').mockResolvedValue();
    return service;
  }

  beforeEach(() => {
    qb = {};
    for (const method of ['update', 'set', 'where', 'andWhere', 'returning']) {
      qb[method] = jest.fn().mockReturnValue(qb);
    }
    qb.execute = jest.fn().mockResolvedValue({ raw: [{ id: 'user-1' }] });
    qb.getOne = jest.fn();
    repo = {
      findOne: jest.fn().mockResolvedValue(makeUser()),
      update: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };
    mailer = {
      isConfigured: jest.fn().mockReturnValue(true),
      sendDetailed: jest.fn().mockResolvedValue({ messageId: 'm1', accepted: ['maria@exemplo.com'], rejected: [] }),
    };
    emitter = { emit: jest.fn() };
    settings = { getValue: jest.fn().mockResolvedValue('Aurora Flow') };
  });

  describe('issueAndSend', () => {
    it('grava só o hash do token e manda o link pessoal por e-mail', async () => {
      const result = await makeService().issueAndSend('user-1', { id: 'admin-1', fullName: 'Ana Admin' });

      expect(result.sent).toBe(true);
      const stored = repo.update.mock.calls[0][1] as { inviteTokenHash: string; inviteExpiresAt: Date };
      expect(stored.inviteTokenHash).toMatch(/^[0-9a-f]{64}$/);

      const message = mailer.sendDetailed.mock.calls[0][0] as { to: string[]; text: string; html: string };
      expect(message.to).toEqual(['maria@exemplo.com']);
      const token = /\/convite\/([A-Za-z0-9_-]{43})/.exec(message.text)?.[1];
      expect(token).toBeDefined();
      expect(message.text).toContain(`${FRONTEND}/convite/${token}`);
      // O banco nunca vê o token em si — só o hash dele.
      expect(hashInviteToken(token as string)).toBe(stored.inviteTokenHash);
      expect(JSON.stringify(repo.update.mock.calls)).not.toContain(token);
    });

    it('vale 7 dias por padrão e respeita USER_INVITE_TTL_HOURS', async () => {
      const before = Date.now();
      await makeService().issueAndSend('user-1');
      const defaultExpiry = (repo.update.mock.calls[0][1] as { inviteExpiresAt: Date }).inviteExpiresAt;
      expect(defaultExpiry.getTime() - before).toBeGreaterThanOrEqual(168 * 3_600_000 - 1000);
      expect(defaultExpiry.getTime() - before).toBeLessThanOrEqual(168 * 3_600_000 + 1000);

      repo.update.mockClear();
      await makeService(makeConfig({ USER_INVITE_TTL_HOURS: '48', NODE_ENV: 'production' })).issueAndSend('user-1');
      const custom = (repo.update.mock.calls[0][1] as { inviteExpiresAt: Date }).inviteExpiresAt;
      expect(custom.getTime() - Date.now()).toBeLessThanOrEqual(48 * 3_600_000);
      expect(custom.getTime() - Date.now()).toBeGreaterThan(47 * 3_600_000);
    });

    it('marca o envio e emite o evento de auditoria com quem convidou', async () => {
      await makeService().issueAndSend('user-1', { id: 'admin-1', fullName: 'Ana Admin' });

      expect(repo.update).toHaveBeenLastCalledWith('user-1', { inviteSentAt: expect.any(Date) });
      expect(emitter.emit).toHaveBeenCalledWith(
        'users.invite_sent',
        expect.objectContaining({ actorId: 'admin-1', userId: 'user-1', email: 'maria@exemplo.com' }),
      );
    });

    it('endereço recusado pelo SMTP não conta como enviado', async () => {
      mailer.sendDetailed.mockResolvedValue({ messageId: null, accepted: [], rejected: ['maria@exemplo.com'] });

      const result = await makeService().issueAndSend('user-1');

      expect(result).toEqual({ sent: false, error: 'O servidor de e-mail recusou o endereço do usuário.' });
      expect(emitter.emit).not.toHaveBeenCalled();
    });

    it('tenta de novo uma vez em falha temporária e devolve o erro sanitizado', async () => {
      mailer.sendDetailed.mockRejectedValue(Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' }));

      const result = await makeService().issueAndSend('user-1');

      expect(mailer.sendDetailed).toHaveBeenCalledTimes(2);
      expect(result.sent).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('sem SMTP em produção não gera token nenhum', async () => {
      mailer.isConfigured.mockReturnValue(false);

      const result = await makeService().issueAndSend('user-1');

      expect(result.sent).toBe(false);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('sem SMTP em desenvolvimento só registra o link no log', async () => {
      mailer.isConfigured.mockReturnValue(false);

      const result = await makeService(makeConfig({ NODE_ENV: 'development' })).issueAndSend('user-1');

      expect(result.sent).toBe(true);
      expect(mailer.sendDetailed).not.toHaveBeenCalled();
      expect(repo.update).toHaveBeenCalledWith('user-1', expect.objectContaining({ inviteTokenHash: expect.any(String) }));
    });

    it('recusa usuário inativo e usuário inexistente', async () => {
      repo.findOne.mockResolvedValueOnce(makeUser({ isActive: false }));
      await expect(makeService().issueAndSend('user-1')).rejects.toBeInstanceOf(BadRequestException);

      repo.findOne.mockResolvedValueOnce(null);
      await expect(makeService().issueAndSend('ghost')).rejects.toBeInstanceOf(NotFoundException);
      expect(mailer.sendDetailed).not.toHaveBeenCalled();
    });
  });

  describe('getForToken', () => {
    const { token } = generateInviteToken();

    it('devolve nome, e-mail e validade do convite', async () => {
      const expiresAt = new Date(Date.now() + 3_600_000);
      qb.getOne.mockResolvedValue(makeUser({ inviteExpiresAt: expiresAt }));

      await expect(makeService().getForToken(token)).resolves.toEqual({
        fullName: 'Maria Souza',
        email: 'maria@exemplo.com',
        expiresAt,
      });
      expect(qb.where).toHaveBeenCalledWith(expect.any(String), { hash: hashInviteToken(token) });
    });

    it.each([
      ['inexistente', null],
      ['expirado', makeUser({ inviteExpiresAt: new Date(Date.now() - 1000) })],
      ['de usuário inativo', makeUser({ isActive: false, inviteExpiresAt: new Date(Date.now() + 3_600_000) })],
    ])('convite %s vira 404', async (_label, found) => {
      qb.getOne.mockResolvedValue(found);
      await expect(makeService().getForToken(token)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('token com formato inválido nem vai ao banco', async () => {
      await expect(makeService().getForToken("x' OR 1=1 --")).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('consume', () => {
    const { token } = generateInviteToken();

    it('apaga o hash numa única operação condicionada a validade e usuário ativo', async () => {
      await expect(makeService().consume(token)).resolves.toBe('user-1');

      expect(qb.set).toHaveBeenCalledWith({ inviteTokenHash: null, inviteExpiresAt: null });
      expect(qb.where).toHaveBeenCalledWith('invite_token_hash = :hash', { hash: hashInviteToken(token) });
      expect(qb.andWhere).toHaveBeenCalledWith('invite_expires_at > now()');
      expect(qb.andWhere).toHaveBeenCalledWith('is_active = true');
    });

    it('nenhuma linha atualizada (usado, expirado ou inexistente) vira 404', async () => {
      qb.execute.mockResolvedValue({ raw: [] });
      await expect(makeService().consume(token)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

describe('user-invite-token', () => {
  it('gera tokens de 43 caracteres base64url, diferentes a cada chamada', () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(isPlausibleInviteToken(a.token)).toBe(true);
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toBe(hashInviteToken(a.token));
  });

  it.each([undefined, '', 'curto', 'a'.repeat(44), `${'a'.repeat(42)}!`])('rejeita %p', (value) => {
    expect(isPlausibleInviteToken(value)).toBe(false);
  });
});

describe('buildUserInviteEmail', () => {
  const base = {
    orgName: 'Aurora Flow',
    fullName: 'Maria Souza',
    email: 'maria@exemplo.com',
    invitedByName: 'Ana Admin',
    link: `${FRONTEND}/convite/abc`,
    loginUrl: `${FRONTEND}/login`,
    expiresAt: new Date('2026-11-13T15:00:00Z'),
  };

  it('resume o convite na primeira linha do texto (prévia do Gmail) e traz o link', () => {
    const email = buildUserInviteEmail(base);
    expect(email.subject).toBe('[Aurora Flow] Seu acesso foi criado — defina sua senha');
    expect(email.text.split('\n')[0]).toBe('Ana Admin criou seu acesso ao Aurora Flow. Defina sua senha para entrar.');
    expect(email.text).toContain(base.link);
    expect(email.text).toContain('13/11/2026');
    expect(email.html).toContain(`href="${base.link}"`);
    expect(email.html).toContain('Olá, Maria!');
  });

  it('sem quem convidou, usa uma frase neutra', () => {
    const email = buildUserInviteEmail({ ...base, invitedByName: null });
    expect(email.text.split('\n')[0]).toBe('Seu acesso ao Aurora Flow foi criado. Defina sua senha para entrar.');
  });

  it('escapa nomes vindos de dados', () => {
    const email = buildUserInviteEmail({ ...base, fullName: '<script>x</script> Silva', invitedByName: 'A & B' });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).toContain('A &amp; B');
  });
});
