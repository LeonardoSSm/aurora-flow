import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { RefreshTokenService } from './refresh-token.service';
import type { JwtPayload } from './types/jwt-payload.type';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const PAYLOAD: JwtPayload = {
  sub: 'user-id',
  email: 'user@formhub.local',
  fullName: 'Test User',
  role: 'editor',
  tokenVersion: 0,
};

function makeRecord(
  overrides: Partial<{
    id: string;
    userId: string;
    tokenHash: string;
    revokedAt: Date | null;
    replacedByTokenId: string | null;
  }> = {},
) {
  return {
    id: 'record-id',
    userId: 'user-id',
    tokenHash: sha256('old-raw-token'),
    revokedAt: null,
    replacedByTokenId: null,
    ...overrides,
  };
}

function makeService(managerOverrides: Partial<Record<string, jest.Mock>> = {}) {
  // manager is used both inside transactions (rotate) and via repo.manager (issue)
  const manager = {
    findOne: jest.fn(),
    save: jest.fn().mockResolvedValue({}),
    create: jest
      .fn()
      .mockImplementation((_Entity: unknown, data: unknown) => ({ ...(data as object) })),
    ...managerOverrides,
  };

  const repo = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    manager,
  };

  const dataSource = {
    transaction: jest
      .fn()
      .mockImplementation((fn: (m: typeof manager) => Promise<unknown>) => fn(manager)),
  };

  const jwtService: jest.Mocked<Pick<JwtService, 'signAsync' | 'decode'>> = {
    signAsync: jest.fn().mockResolvedValue('new-raw-token'),
    decode: jest.fn().mockReturnValue(PAYLOAD),
  };

  const configService: jest.Mocked<Pick<ConfigService, 'getOrThrow'>> = {
    getOrThrow: jest.fn().mockReturnValue('7d'),
  };

  const service = new RefreshTokenService(
    repo as never,
    dataSource as never,
    jwtService as unknown as JwtService,
    configService as unknown as ConfigService,
  );

  return { service, repo, manager, dataSource, jwtService };
}

// ─── issue ────────────────────────────────────────────────────────────────────

describe('RefreshTokenService.issue', () => {
  it('persiste o hash SHA-256 do token, não o token em texto puro', async () => {
    const { service, manager, jwtService } = makeService();
    jwtService.signAsync.mockResolvedValue('raw-token-abc');

    await service.issue(PAYLOAD, '127.0.0.1', 'jest-agent');

    expect(manager.save).toHaveBeenCalledTimes(1);
    const saved = manager.save.mock.calls[0][0] as { tokenHash: string };
    expect(saved.tokenHash).toBe(sha256('raw-token-abc'));
    expect(saved.tokenHash).not.toBe('raw-token-abc');
  });

  it('retorna o token em texto puro (não o hash)', async () => {
    const { service, jwtService } = makeService();
    jwtService.signAsync.mockResolvedValue('raw-token-xyz');

    const result = await service.issue(PAYLOAD, null, null);

    expect(result).toBe('raw-token-xyz');
  });

  it('salva o ip e user-agent fornecidos', async () => {
    const { service, manager } = makeService();

    await service.issue(PAYLOAD, '10.0.0.1', 'Mozilla/5.0');

    const saved = manager.save.mock.calls[0][0] as { ipAddress: string; userAgent: string };
    expect(saved.ipAddress).toBe('10.0.0.1');
    expect(saved.userAgent).toBe('Mozilla/5.0');
  });

  it('lança UnauthorizedException ao receber erro de duplicate key (23505)', async () => {
    const { service, manager } = makeService();
    const dupError = Object.assign(new Error('duplicate key'), { code: '23505' });
    manager.save.mockRejectedValueOnce(dupError);

    await expect(service.issue(PAYLOAD, null, null)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

// ─── rotate — caminho feliz ───────────────────────────────────────────────────

describe('RefreshTokenService.rotate — caminho feliz', () => {
  it('revoga o registro antigo e cria um novo token', async () => {
    const oldRecord = makeRecord({ tokenHash: sha256('old-raw-token') });
    const newRecord = makeRecord({ id: 'new-record-id', tokenHash: sha256('new-raw-token') });

    const { service, manager, jwtService } = makeService();
    jwtService.signAsync.mockResolvedValue('new-raw-token');

    // 1st findOne: old record (locked); 2nd findOne: new record after _issue
    manager.findOne.mockResolvedValueOnce(oldRecord).mockResolvedValueOnce(newRecord);

    const result = await service.rotate('old-raw-token', '127.0.0.1', 'jest');

    expect(result).toBe('new-raw-token');

    // Old record must be revoked and linked to new
    const lastSave = manager.save.mock.calls[manager.save.mock.calls.length - 1][0] as {
      revokedAt: Date | null;
      replacedByTokenId: string | null;
    };
    expect(lastSave.revokedAt).toBeInstanceOf(Date);
    expect(lastSave.replacedByTokenId).toBe('new-record-id');
  });
});

// ─── rotate — token desconhecido ──────────────────────────────────────────────

describe('RefreshTokenService.rotate — token desconhecido', () => {
  it('lança UnauthorizedException quando o hash não é encontrado', async () => {
    const { service, manager } = makeService();
    manager.findOne.mockResolvedValue(null);

    await expect(service.rotate('unknown-token', null, null)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

// ─── rotate — detecção de reutilização ───────────────────────────────────────

describe('RefreshTokenService.rotate — detecção de reutilização', () => {
  it('revoga todas as sessões do usuário e lança UnauthorizedException', async () => {
    const revokedRecord = makeRecord({ revokedAt: new Date('2024-01-01') });

    const { service, manager, repo } = makeService();
    manager.findOne.mockResolvedValue(revokedRecord);

    await expect(service.rotate('old-raw-token', null, null)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    // revokeAllForUser uses repo.update (outside the transaction manager)
    expect(repo.update).toHaveBeenCalledWith(
      { userId: 'user-id', revokedAt: expect.anything() },
      { revokedAt: expect.any(Date) },
    );
  });
});

// ─── rotate — duas renovações quase juntas (tolerância) ──────────────────────

describe('RefreshTokenService.rotate — tolerância a renovações concorrentes', () => {
  const justNow = () => new Date(Date.now() - 2_000);

  it('emite outro token sem derrubar as sessões quando o token acabou de girar', async () => {
    const rotated = makeRecord({ revokedAt: justNow(), replacedByTokenId: 'repl-id' });
    const replacement = makeRecord({ id: 'repl-id', tokenHash: 'x', revokedAt: null });

    const { service, manager, repo, jwtService } = makeService();
    jwtService.signAsync.mockResolvedValue('grace-raw-token');
    manager.findOne.mockResolvedValueOnce(rotated).mockResolvedValueOnce(replacement);

    await expect(service.rotate('old-raw-token', null, null)).resolves.toBe('grace-raw-token');
    expect(repo.update).not.toHaveBeenCalled();
    const saved = manager.save.mock.calls[0][0] as { tokenHash: string; revokedAt: Date | null };
    expect(saved.tokenHash).toBe(sha256('grace-raw-token'));
    expect(saved.revokedAt).toBeNull();
  });

  it('também tolera quando o substituto já girou de novo (terceira aba)', async () => {
    const rotated = makeRecord({ revokedAt: justNow(), replacedByTokenId: 'repl-id' });
    const replacement = makeRecord({
      id: 'repl-id',
      revokedAt: justNow(),
      replacedByTokenId: 'repl-2',
    });

    const { service, manager, repo } = makeService();
    manager.findOne.mockResolvedValueOnce(rotated).mockResolvedValueOnce(replacement);

    await expect(service.rotate('old-raw-token', null, null)).resolves.toBe('new-raw-token');
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('trata como roubo fora da janela de tolerância', async () => {
    const rotated = makeRecord({
      revokedAt: new Date(Date.now() - 5 * 60_000),
      replacedByTokenId: 'repl-id',
    });

    const { service, manager, repo } = makeService();
    manager.findOne.mockResolvedValue(rotated);

    await expect(service.rotate('old-raw-token', null, null)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(repo.update).toHaveBeenCalled();
  });

  it('não ressuscita sessão encerrada por logout (sem substituto)', async () => {
    const loggedOut = makeRecord({ revokedAt: justNow(), replacedByTokenId: null });

    const { service, manager } = makeService();
    manager.findOne.mockResolvedValue(loggedOut);

    await expect(service.rotate('old-raw-token', null, null)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('não ressuscita quando o substituto foi encerrado por logout', async () => {
    const rotated = makeRecord({ revokedAt: justNow(), replacedByTokenId: 'repl-id' });
    const replacementLoggedOut = makeRecord({
      id: 'repl-id',
      revokedAt: justNow(),
      replacedByTokenId: null,
    });

    const { service, manager, repo } = makeService();
    manager.findOne.mockResolvedValueOnce(rotated).mockResolvedValueOnce(replacementLoggedOut);

    await expect(service.rotate('old-raw-token', null, null)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(repo.update).toHaveBeenCalled();
  });
});
