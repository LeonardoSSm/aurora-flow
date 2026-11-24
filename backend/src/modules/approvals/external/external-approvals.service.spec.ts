import { BadRequestException, ForbiddenException, GoneException, NotFoundException } from '@nestjs/common';
import { ApprovalStatus } from '../../../common/enums/approval-status.enum';
import { ApprovalStepStatus } from '../../../common/enums/approval-step-status.enum';
import { EXTERNAL_APPROVAL_MAX_FAILED_ATTEMPTS } from './external-approval-link.service';
import { hashApprovalToken } from './external-approval-token';
import { ExternalApprovalsService, maskEmail } from './external-approvals.service';

const TOKEN = 'T'.repeat(43);
const EMAIL = 'gestor@tijucaalimentos.com';

function makeStep(overrides: Record<string, unknown> = {}, approvalOverrides: Record<string, unknown> = {}) {
  return {
    id: 'step-1',
    approvalId: 'approval-1',
    assignedEmail: EMAIL,
    status: ApprovalStepStatus.PENDING,
    accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
    accessFailedAttempts: 0,
    decidedAt: null,
    approval: {
      id: 'approval-1',
      title: 'Aprovar pedido',
      description: 'Confira os itens',
      status: ApprovalStatus.PENDING,
      solicitation: {
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        title: 'Pedido de embalagens',
        description: 'Descrição do pedido',
        createdAt: new Date('2026-10-01T12:00:00Z'),
        createdByUser: { fullName: 'Maria Souza' },
        submission: {
          responderName: null,
          items: [
            { fieldCode: 'qtd', valueText: null, valueNumber: 120, valueBoolean: null, valueJson: null, field: { label: 'Quantidade', order: 2, isSensitive: false, fieldType: 'number' } },
            { fieldCode: 'obs', valueText: ' Urgente ', valueNumber: null, valueBoolean: null, valueJson: null, field: { label: 'Observação', order: 1, isSensitive: false, fieldType: 'short_text' } },
            { fieldCode: 'cpf', valueText: '123.456.789-00', valueNumber: null, valueBoolean: null, valueJson: null, field: { label: 'CPF', order: 3, isSensitive: false, fieldType: 'cpf' } },
            { fieldCode: 'senha', valueText: 'segredo', valueNumber: null, valueBoolean: null, valueJson: null, field: { label: 'Dado sensível', order: 4, isSensitive: true, fieldType: 'short_text' } },
            { fieldCode: 'anexo', valueText: null, valueNumber: null, valueBoolean: null, valueJson: { path: '/uploads/x.pdf' }, field: { label: 'Anexo', order: 5, isSensitive: false, fieldType: 'file_upload' } },
            { fieldCode: 'vazio', valueText: '  ', valueNumber: null, valueBoolean: null, valueJson: null, field: { label: 'Vazio', order: 6, isSensitive: false, fieldType: 'short_text' } },
            { fieldCode: 'ok', valueText: null, valueNumber: null, valueBoolean: true, valueJson: null, field: { label: 'Confirmado', order: 7, isSensitive: false, fieldType: 'checkbox' } },
          ],
        },
        ...(approvalOverrides.solicitation as object | undefined),
      },
      ...approvalOverrides,
    },
    ...overrides,
  };
}

function makeService(step: ReturnType<typeof makeStep> | null = makeStep()) {
  const qb = {
    addSelect: jest.fn().mockReturnThis(),
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(step),
  };
  const updateQb = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ raw: [{ access_failed_attempts: 1 }] }),
  };
  const stepsRepo = {
    createQueryBuilder: jest.fn().mockImplementation((alias?: string) => (alias ? qb : updateQb)),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const approvals = { decideExternalStep: jest.fn().mockResolvedValue({}) };
  const settings = { getValue: jest.fn().mockResolvedValue('Tijuca Flow') };
  const service = new ExternalApprovalsService(stepsRepo as never, approvals as never, settings as never);
  return { service, qb, updateQb, stepsRepo, approvals };
}

describe('maskEmail', () => {
  it('mostra só a 1ª letra e o domínio', () => {
    expect(maskEmail('gestor@tijucaalimentos.com')).toBe('g***@tijucaalimentos.com');
    expect(maskEmail('sem-arroba')).toBe('***');
  });
});

describe('ExternalApprovalsService.getForToken', () => {
  it('busca pelo HASH do token (nunca pelo token)', async () => {
    const { service, qb } = makeService();

    await service.getForToken(TOKEN);

    expect(qb.where).toHaveBeenCalledWith('step.accessTokenHash = :hash', { hash: hashApprovalToken(TOKEN) });
    expect(JSON.stringify(qb.where.mock.calls)).not.toContain(TOKEN);
  });

  it('pendente: devolve detalhes, e-mail mascarado e respostas filtradas e ordenadas', async () => {
    const { service } = makeService();

    const view = await service.getForToken(TOKEN);

    expect(view.state).toBe('pending');
    expect(view.emailHint).toBe('g***@tijucaalimentos.com');
    expect(view.approval).toEqual({ title: 'Aprovar pedido', description: 'Confira os itens' });
    expect(view.solicitation?.number).toBe('AAAAAAAA');
    expect(view.solicitation?.requesterName).toBe('Maria Souza');
    // Ordenadas por `order`; sem CPF, sem campo sensível, sem arquivo, sem vazio.
    expect(view.solicitation?.answers).toEqual([
      { label: 'Observação', value: 'Urgente' },
      { label: 'Quantidade', value: '120' },
      { label: 'Confirmado', value: 'Sim' },
    ]);
    // O e-mail completo do aprovador não aparece na resposta.
    expect(JSON.stringify(view)).not.toContain(EMAIL);
  });

  it('token com formato inválido: 404 sem consultar o banco', async () => {
    const { service, stepsRepo } = makeService();

    await expect(service.getForToken("x' OR '1'='1")).rejects.toBeInstanceOf(NotFoundException);
    expect(stepsRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('token inexistente: 404 genérico', async () => {
    const { service } = makeService(null);

    await expect(service.getForToken(TOKEN)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('já decidida: só o estado e a decisão — nada da solicitação', async () => {
    const decidedAt = new Date('2026-10-02T10:00:00Z');
    const { service } = makeService(makeStep({ status: ApprovalStepStatus.APPROVED, decidedAt }));

    const view = await service.getForToken(TOKEN);

    expect(view).toEqual({ state: 'decided', orgName: 'Tijuca Flow', decision: { decision: 'approved', decidedAt } });
  });

  it.each([
    ['expirado', 'expired', makeStep({ accessTokenExpiresAt: new Date(Date.now() - 1000) })],
    ['sem validade', 'expired', makeStep({ accessTokenExpiresAt: null })],
    ['bloqueado por tentativas', 'expired', makeStep({ accessFailedAttempts: EXTERNAL_APPROVAL_MAX_FAILED_ATTEMPTS })],
    ['etapa pulada (outra reprovou)', 'closed', makeStep({ status: ApprovalStepStatus.SKIPPED })],
    ['etapa aguardando', 'closed', makeStep({ status: ApprovalStepStatus.WAITING })],
    ['aprovação cancelada', 'closed', makeStep({}, { status: ApprovalStatus.CANCELLED })],
  ])('%s: estado "%s" sem vazar detalhes', async (_label, state, step) => {
    const { service } = makeService(step as never);

    const view = await service.getForToken(TOKEN);

    expect(view).toEqual({ state, orgName: 'Tijuca Flow' });
  });
});

describe('ExternalApprovalsService.decide', () => {
  const dto = { decision: 'approved' as const, comment: 'ok', confirmEmail: EMAIL };

  it('e-mail confere: decide pela mesma regra do usuário logado, com e-mail e IP', async () => {
    const { service, approvals } = makeService();

    await service.decide(TOKEN, dto, '203.0.113.9');

    expect(approvals.decideExternalStep).toHaveBeenCalledWith(
      'step-1',
      { decision: 'approved', comment: 'ok' },
      { email: EMAIL, ip: '203.0.113.9' },
    );
  });

  it('aceita o e-mail de confirmação com maiúsculas e espaços', async () => {
    const { service, approvals } = makeService();

    await service.decide(TOKEN, { ...dto, confirmEmail: '  Gestor@TijucaAlimentos.com ' }, null);

    expect(approvals.decideExternalStep).toHaveBeenCalledTimes(1);
  });

  it('e-mail errado: 403 com tentativas restantes, conta a tentativa e NÃO decide', async () => {
    const { service, approvals, updateQb } = makeService();
    updateQb.execute.mockResolvedValue({ raw: [{ access_failed_attempts: 2 }] });

    const error = await service
      .decide(TOKEN, { ...dto, confirmEmail: 'outro@x.com' }, null)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toMatchObject({
      remainingAttempts: EXTERNAL_APPROVAL_MAX_FAILED_ATTEMPTS - 2,
    });
    expect(approvals.decideExternalStep).not.toHaveBeenCalled();
  });

  it('na última tentativa errada o link é bloqueado (expira na hora) e responde 410', async () => {
    const { service, approvals, updateQb, stepsRepo } = makeService();
    updateQb.execute.mockResolvedValue({ raw: [{ access_failed_attempts: EXTERNAL_APPROVAL_MAX_FAILED_ATTEMPTS }] });

    await expect(service.decide(TOKEN, { ...dto, confirmEmail: 'outro@x.com' }, null)).rejects.toBeInstanceOf(
      GoneException,
    );

    expect(stepsRepo.update).toHaveBeenCalledWith('step-1', { accessTokenExpiresAt: expect.any(Date) });
    expect(approvals.decideExternalStep).not.toHaveBeenCalled();
  });

  it('link já bloqueado: 410 sem nem comparar o e-mail', async () => {
    const { service, updateQb, approvals } = makeService(
      makeStep({ accessFailedAttempts: EXTERNAL_APPROVAL_MAX_FAILED_ATTEMPTS }),
    );

    await expect(service.decide(TOKEN, dto, null)).rejects.toBeInstanceOf(GoneException);

    expect(updateQb.execute).not.toHaveBeenCalled();
    expect(approvals.decideExternalStep).not.toHaveBeenCalled();
  });

  it.each([
    ['já decidida', makeStep({ status: ApprovalStepStatus.REJECTED })],
    ['expirada', makeStep({ accessTokenExpiresAt: new Date(Date.now() - 1000) })],
    ['encerrada', makeStep({ status: ApprovalStepStatus.SKIPPED })],
  ])('%s: 410 Gone e não decide', async (_label, step) => {
    const { service, approvals } = makeService(step as never);

    await expect(service.decide(TOKEN, dto, null)).rejects.toBeInstanceOf(GoneException);
    expect(approvals.decideExternalStep).not.toHaveBeenCalled();
  });

  it('reprovar exige comentário (e não gasta tentativa de e-mail)', async () => {
    const { service, approvals, updateQb } = makeService();

    await expect(
      service.decide(TOKEN, { decision: 'rejected', comment: '  ', confirmEmail: EMAIL }, null),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(approvals.decideExternalStep).not.toHaveBeenCalled();
    expect(updateQb.execute).not.toHaveBeenCalled();
  });

  it('IP é truncado ao tamanho da coluna (45)', async () => {
    const { service, approvals } = makeService();

    await service.decide(TOKEN, dto, 'x'.repeat(80));

    const external = approvals.decideExternalStep.mock.calls[0][2] as { ip: string };
    expect(external.ip).toHaveLength(45);
  });

  it('corrida: se a etapa foi decidida entre a checagem e a gravação, responde 410 (não 400 cru)', async () => {
    const { service, approvals, qb } = makeService();
    approvals.decideExternalStep.mockRejectedValue(new BadRequestException('Esta etapa já foi decidida.'));
    // 1ª leitura: pendente. Releitura após o erro: já decidida por outra requisição.
    qb.getOne
      .mockResolvedValueOnce(makeStep())
      .mockResolvedValueOnce(makeStep({ status: ApprovalStepStatus.APPROVED, decidedAt: new Date() }));

    await expect(service.decide(TOKEN, dto, null)).rejects.toBeInstanceOf(GoneException);
  });

  it('erro de regra que não é corrida é repassado como está', async () => {
    const { service, approvals } = makeService();
    approvals.decideExternalStep.mockRejectedValue(new BadRequestException('Outra regra.'));

    await expect(service.decide(TOKEN, dto, null)).rejects.toThrow('Outra regra.');
  });

  it('devolve a visão atualizada (decidida) depois de gravar', async () => {
    const { service, qb } = makeService();
    const decidedAt = new Date('2026-10-03T09:00:00Z');
    qb.getOne
      .mockResolvedValueOnce(makeStep())
      .mockResolvedValueOnce(makeStep({ status: ApprovalStepStatus.APPROVED, decidedAt }));

    const view = await service.decide(TOKEN, dto, null);

    expect(view).toEqual({ state: 'decided', orgName: 'Tijuca Flow', decision: { decision: 'approved', decidedAt } });
  });
});
