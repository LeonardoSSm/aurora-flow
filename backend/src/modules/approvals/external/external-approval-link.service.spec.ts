import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { ApprovalStatus } from '../../../common/enums/approval-status.enum';
import { ApprovalStepStatus } from '../../../common/enums/approval-step-status.enum';
import { NotificationChannelError } from '../../notifications/domain/notification-errors';
import {
  EXTERNAL_APPROVAL_DEFAULT_TTL_HOURS,
  ExternalApprovalLinkService,
} from './external-approval-link.service';
import { hashApprovalToken } from './external-approval-token';

class TestableLinkService extends ExternalApprovalLinkService {
  readonly waits: number[] = [];
  protected override wait(ms: number): Promise<void> {
    this.waits.push(ms);
    return Promise.resolve();
  }
}

function makeStep(overrides: Record<string, unknown> = {}) {
  return {
    id: 'step-1',
    approvalId: 'approval-1',
    assignedEmail: 'gestor@tijucaalimentos.com',
    status: ApprovalStepStatus.PENDING,
    approval: {
      id: 'approval-1',
      title: 'Aprovar pedido',
      description: 'Detalhes',
      status: ApprovalStatus.PENDING,
      solicitation: {
        id: '11111111-2222-3333-4444-555555555555',
        title: 'Pedido de embalagens',
        createdByUser: { fullName: 'Maria Souza' },
        submission: null,
      },
    },
    ...overrides,
  };
}

function makeService(options: { smtp?: boolean; env?: Record<string, string> } = {}) {
  const env: Record<string, string> = { FRONTEND_URL: 'https://flow.example.com/', ...options.env };
  const config = {
    get: jest.fn().mockImplementation((key: string, fallback?: string) => env[key] ?? fallback),
  } as unknown as ConfigService;
  const mailer = {
    isConfigured: jest.fn().mockReturnValue(options.smtp ?? true),
    sendDetailed: jest.fn().mockResolvedValue({ messageId: 'm1', accepted: ['gestor@tijucaalimentos.com'], rejected: [] }),
  };
  const settings = { getValue: jest.fn().mockResolvedValue('Tijuca Flow') };
  const stepsRepo = {
    findOne: jest.fn().mockResolvedValue(makeStep()),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const service = new TestableLinkService(config, mailer as never, settings as never, stepsRepo as never);
  return { service, mailer, stepsRepo, settings };
}

describe('ExternalApprovalLinkService', () => {
  describe('issueAndSend', () => {
    it('grava só o hash do token e envia o e-mail com o link do frontend', async () => {
      const { service, mailer, stepsRepo } = makeService();

      const result = await service.issueAndSend('step-1');

      expect(result).toEqual({ sent: true });
      const firstUpdate = stepsRepo.update.mock.calls[0][1] as Record<string, unknown>;
      expect(firstUpdate.accessTokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(firstUpdate.accessFailedAttempts).toBe(0);
      expect(firstUpdate.accessLinkSentAt).toBeNull();
      expect(firstUpdate.accessTokenExpiresAt).toBeInstanceOf(Date);

      const sent = mailer.sendDetailed.mock.calls[0][0] as { to: string[]; text: string; html: string };
      expect(sent.to).toEqual(['gestor@tijucaalimentos.com']);
      const link = /https:\/\/flow\.example\.com\/aprovar\/([A-Za-z0-9_-]{43})/.exec(sent.text);
      expect(link).not.toBeNull();
      // O token do e-mail corresponde ao hash gravado (e o hash não revela o token).
      expect(hashApprovalToken((link as RegExpExecArray)[1])).toBe(firstUpdate.accessTokenHash);
      expect(String(firstUpdate.accessTokenHash)).not.toContain((link as RegExpExecArray)[1]);

      const lastUpdate = stepsRepo.update.mock.calls.at(-1)?.[1] as Record<string, unknown>;
      expect(lastUpdate.accessLinkSentAt).toBeInstanceOf(Date);
    });

    it('cada emissão gera um token diferente (reenvio invalida o anterior)', async () => {
      const { service, stepsRepo } = makeService();

      await service.issueAndSend('step-1');
      await service.issueAndSend('step-1');

      const hashes = stepsRepo.update.mock.calls
        .map((call) => (call[1] as Record<string, unknown>).accessTokenHash)
        .filter(Boolean);
      expect(hashes).toHaveLength(2);
      expect(hashes[0]).not.toBe(hashes[1]);
    });

    it('usa a validade padrão (7 dias) e respeita APPROVAL_EXTERNAL_LINK_TTL_HOURS', async () => {
      const padrao = makeService();
      const before = Date.now();
      await padrao.service.issueAndSend('step-1');
      const expiresDefault = (padrao.stepsRepo.update.mock.calls[0][1] as { accessTokenExpiresAt: Date })
        .accessTokenExpiresAt.getTime();
      expect(expiresDefault - before).toBeGreaterThanOrEqual(EXTERNAL_APPROVAL_DEFAULT_TTL_HOURS * 3_600_000 - 1000);

      const curto = makeService({ env: { APPROVAL_EXTERNAL_LINK_TTL_HOURS: '2' } });
      const before2 = Date.now();
      await curto.service.issueAndSend('step-1');
      const expires2 = (curto.stepsRepo.update.mock.calls[0][1] as { accessTokenExpiresAt: Date })
        .accessTokenExpiresAt.getTime();
      expect(expires2 - before2).toBeLessThan(3 * 3_600_000);
      expect(curto.service.ttlHours()).toBe(2);
    });

    it.each(['0', '-5', 'abc', ''])('TTL inválido (%p) volta ao padrão', (value) => {
      const { service } = makeService({ env: { APPROVAL_EXTERNAL_LINK_TTL_HOURS: value } });

      expect(service.ttlHours()).toBe(EXTERNAL_APPROVAL_DEFAULT_TTL_HOURS);
    });

    it('recusa etapa que não é de aprovador externo', async () => {
      const { service, stepsRepo, mailer } = makeService();
      stepsRepo.findOne.mockResolvedValue(makeStep({ assignedEmail: null }));

      await expect(service.issueAndSend('step-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(mailer.sendDetailed).not.toHaveBeenCalled();
    });

    it.each([
      ['etapa já decidida', makeStep({ status: ApprovalStepStatus.APPROVED })],
      [
        'aprovação cancelada',
        makeStep({
          approval: { ...makeStep().approval, status: ApprovalStatus.CANCELLED },
        }),
      ],
    ])('recusa emitir link para %s', async (_label, step) => {
      const { service, stepsRepo, mailer } = makeService();
      stepsRepo.findOne.mockResolvedValue(step);

      await expect(service.issueAndSend('step-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(stepsRepo.update).not.toHaveBeenCalled();
      expect(mailer.sendDetailed).not.toHaveBeenCalled();
    });

    it('tenta de novo uma vez em erro transitório e conta como enviado se a 2ª funcionar', async () => {
      const { service, mailer } = makeService();
      mailer.sendDetailed
        .mockRejectedValueOnce(Object.assign(new Error('reset'), { code: 'ECONNRESET' }))
        .mockResolvedValueOnce({ messageId: 'm2', accepted: ['gestor@tijucaalimentos.com'], rejected: [] });

      const result = await service.issueAndSend('step-1');

      expect(result).toEqual({ sent: true });
      expect(mailer.sendDetailed).toHaveBeenCalledTimes(2);
      expect(service.waits).toEqual([1000]);
    });

    it('não repete em erro permanente e devolve motivo sem e-mail nem link', async () => {
      const { service, mailer, stepsRepo } = makeService();
      mailer.sendDetailed.mockRejectedValue(
        new NotificationChannelError('Caixa postal inexistente gestor@tijucaalimentos.com', 'invalid_recipient'),
      );

      const result = await service.issueAndSend('step-1');

      expect(result.sent).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).not.toContain('gestor@tijucaalimentos.com');
      expect(mailer.sendDetailed).toHaveBeenCalledTimes(1);
      // accessLinkSentAt permanece nulo quando o envio falha.
      const sentUpdates = stepsRepo.update.mock.calls.filter(
        (call) => (call[1] as Record<string, unknown>).accessLinkSentAt instanceof Date,
      );
      expect(sentUpdates).toHaveLength(0);
    });

    it('destinatário recusado pelo SMTP não conta como enviado', async () => {
      const { service, mailer } = makeService();
      mailer.sendDetailed.mockResolvedValue({ messageId: null, accepted: [], rejected: ['gestor@tijucaalimentos.com'] });

      const result = await service.issueAndSend('step-1');

      expect(result.sent).toBe(false);
      expect(result.error).toMatch(/recusou/i);
    });

    it('sem SMTP fora de produção: registra o link no log e marca como enviado', async () => {
      const { service, mailer, stepsRepo } = makeService({ smtp: false, env: { NODE_ENV: 'development' } });
      const warn = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);

      const result = await service.issueAndSend('step-1');

      expect(result).toEqual({ sent: true });
      expect(mailer.sendDetailed).not.toHaveBeenCalled();
      expect(String(warn.mock.calls[0][0])).toMatch(/\/aprovar\/[A-Za-z0-9_-]{43}/);
      expect(stepsRepo.update.mock.calls.at(-1)?.[1]).toEqual({ accessLinkSentAt: expect.any(Date) });
    });

    it('sem SMTP em produção: NÃO loga o link e devolve sent=false', async () => {
      const { service, mailer } = makeService({ smtp: false, env: { NODE_ENV: 'production' } });
      const warn = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
      const log = jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);

      const result = await service.issueAndSend('step-1');

      expect(result.sent).toBe(false);
      expect(mailer.sendDetailed).not.toHaveBeenCalled();
      const logged = JSON.stringify([...warn.mock.calls, ...log.mock.calls]);
      expect(logged).not.toMatch(/\/aprovar\//);
    });

    it('os logs de envio não contêm o e-mail do aprovador nem o link', async () => {
      const { service } = makeService();
      const log = jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);

      await service.issueAndSend('step-1');

      const logged = JSON.stringify(log.mock.calls);
      expect(logged).not.toContain('gestor@tijucaalimentos.com');
      expect(logged).not.toMatch(/\/aprovar\//);
    });
  });

  describe('assertDeliverable / isDeliverable', () => {
    it('é entregável com SMTP configurado', () => {
      const { service } = makeService({ smtp: true, env: { NODE_ENV: 'production' } });

      expect(service.isDeliverable()).toBe(true);
      expect(() => service.assertDeliverable()).not.toThrow();
    });

    it('sem SMTP em produção, falha cedo com orientação clara', () => {
      const { service } = makeService({ smtp: false, env: { NODE_ENV: 'production' } });

      expect(service.isDeliverable()).toBe(false);
      expect(() => service.assertDeliverable()).toThrow(BadRequestException);
      expect(() => service.assertDeliverable()).toThrow(/SMTP/);
    });

    it('sem SMTP em desenvolvimento, ainda é entregável (modo simulado)', () => {
      const { service } = makeService({ smtp: false, env: { NODE_ENV: 'development' } });

      expect(service.isDeliverable()).toBe(true);
    });
  });
});
