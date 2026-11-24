import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import type { PermissionScope } from '../../common/constants/permission-catalog';
import { SolicitationStatus } from '../../common/enums/solicitation-status.enum';
import type {
  FormEntity,
  SolicitationCommentEntity,
  SolicitationEntity,
  SolicitationHistoryEntity,
} from '../../database/entities';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { SolicitationCommentsService } from './solicitation-comments.service';
import { fakeProcessAccess, grantsFor } from '../access/testing/fake-process-access';

// Mirrors the seed matrix from 1786000000000-RolesAndPermissions for
// solicitations.view and comments.view_internal.
const SOLICITATIONS_VIEW_SCOPE: Record<string, PermissionScope> = {
  ['admin']: 'all',
  ['manager']: 'area',
  ['editor']: 'own',
  ['viewer']: 'assigned',
};

const COMMENTS_VIEW_INTERNAL: Record<string, boolean> = {
  ['admin']: true,
  ['manager']: true,
  ['editor']: false,
  ['viewer']: false,
};

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeActor(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'user-id',
    email: 'user@formhub.local',
    fullName: 'User',
    role: 'admin',
    tokenVersion: 0,
    areaId: null,
    ...overrides,
  };
}

function makeSolicitation(
  overrides: Partial<SolicitationEntity> = {},
): Partial<SolicitationEntity> {
  return {
    id: 'sol-id',
    title: 'Solicitação Teste',
    trackingToken: 'tok-123',
    formId: 'form-id',
    assigneeId: null,
    createdBy: 'user-id',
    areaId: null,
    ...overrides,
  };
}

function makeComment(
  overrides: Partial<SolicitationCommentEntity> = {},
): Partial<SolicitationCommentEntity> {
  return {
    id: 'comment-id',
    solicitationId: 'sol-id',
    content: 'Olá, preciso de atualização.',
    isInternal: false,
    authorType: 'requester',
    authorName: 'João',
    authorEmail: null,
    authorUserId: null,
    proposalStatus: null,
    proposalDecidedAt: null,
    proposalRejectionReason: null,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeForm(overrides: Partial<FormEntity> = {}): Partial<FormEntity> {
  return {
    id: 'form-id',
    versions: [
      {
        id: 'version-id',
        versionNumber: 1,
        isPublished: true,
        settingsJson: {},
      } as never,
    ],
    ...overrides,
  };
}

// ── Service factory ───────────────────────────────────────────────────────────

function makeService(
  solicitationResult: Partial<SolicitationEntity> | null = makeSolicitation(),
  savedComment: Partial<SolicitationCommentEntity> = makeComment(),
  formResult: Partial<FormEntity> | null = makeForm(),
  pendingComment: Partial<SolicitationCommentEntity> | null = null,
) {
  const commentsRepo = {
    create: jest.fn().mockImplementation((data: object) => ({ ...data })),
    save: jest.fn().mockImplementation((data: object) =>
      Promise.resolve({ id: 'comment-id', ...savedComment, ...data }),
    ),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(pendingComment),
  } as unknown as jest.Mocked<Repository<SolicitationCommentEntity>>;

  const solicitationsRepo = {
    findOne: jest.fn().mockResolvedValue(solicitationResult),
    save: jest.fn().mockImplementation((data: object) => Promise.resolve(data)),
  } as unknown as jest.Mocked<Repository<SolicitationEntity>>;

  const formsRepo = {
    findOne: jest.fn().mockResolvedValue(formResult),
  } as unknown as jest.Mocked<Repository<FormEntity>>;

  const historyRepo = {
    create: jest.fn().mockImplementation((data: object) => ({ ...data })),
    save: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<Repository<SolicitationHistoryEntity>>;

  const userNotice = { notify: jest.fn().mockResolvedValue(undefined) };

  const permissionsService = {
    getScope: jest
      .fn()
      .mockImplementation((role: string) =>
        Promise.resolve(SOLICITATIONS_VIEW_SCOPE[role] ?? 'none'),
      ),
    hasAny: jest
      .fn()
      .mockImplementation((role: string) =>
        Promise.resolve(COMMENTS_VIEW_INTERNAL[role] ?? false),
      ),
  };

  const service = new SolicitationCommentsService(
    commentsRepo,
    solicitationsRepo,
    formsRepo,
    historyRepo,
    permissionsService as never,
    fakeProcessAccess({
      solicitationsRepository: solicitationsRepo,
      // A matriz dos perfis antigos convertida em vínculo com o processo do card: admin tem acesso total.
      resolve: (actor) =>
        grantsFor(actor.sub, actor.role === 'admin', {
          'form-id': {
            ...(SOLICITATIONS_VIEW_SCOPE[actor.role] === 'all' || SOLICITATIONS_VIEW_SCOPE[actor.role] === 'area'
              ? { 'solicitations.view': 'all' as const }
              : { 'solicitations.view': 'own' as const }),
            ...(COMMENTS_VIEW_INTERNAL[actor.role] ? { 'comments.view_internal': 'all' as const } : {}),
          },
        }),
    }),
    userNotice as never,
  );

  return {
    service,
    commentsRepo,
    solicitationsRepo,
    formsRepo,
    historyRepo,
    userNotice,
    permissionsService,
  };
}

// ── addPublicComment ──────────────────────────────────────────────────────────

describe('SolicitationCommentsService.addPublicComment', () => {
  it('cria comentário com isInternal=false e authorType=requester', async () => {
    const { service, commentsRepo } = makeService();

    await service.addPublicComment('tok-123', {
      content: 'Meu comentário',
      authorName: 'João',
    });

    expect(commentsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        isInternal: false,
        authorType: 'requester',
        content: 'Meu comentário',
        authorName: 'João',
      }),
    );
    expect(commentsRepo.save).toHaveBeenCalled();
  });

  it('avisa o responsável (sino + app) com link para a solicitação', async () => {
    const sol = makeSolicitation({ assigneeId: 'assignee-id', title: 'Pedido X' });
    const { service, userNotice } = makeService(sol);

    await service.addPublicComment('tok-123', { content: 'Olá', authorName: 'Maria' });

    expect(userNotice.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'comment',
        userIds: ['assignee-id'],
        pushTitle: '💬 Novo comentário do solicitante',
        body: expect.stringContaining('Maria'),
        link: `/solicitacoes?solicitationId=${sol.id}`,
      }),
    );
  });

  it('não avisa ninguém quando assigneeId é null', async () => {
    const sol = makeSolicitation({ assigneeId: null });
    const { service, userNotice } = makeService(sol);

    await service.addPublicComment('tok-123', { content: 'Olá' });

    expect(userNotice.notify).not.toHaveBeenCalled();
  });

  it('lança NotFoundException quando token inválido', async () => {
    const { service } = makeService(null);

    await expect(
      service.addPublicComment('invalid', { content: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lança BadRequestException quando content está vazio', async () => {
    const { service } = makeService();

    await expect(
      service.addPublicComment('tok-123', { content: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lança BadRequestException quando content excede 2000 chars', async () => {
    const { service } = makeService();

    await expect(
      service.addPublicComment('tok-123', { content: 'x'.repeat(2001) }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ── findByToken ───────────────────────────────────────────────────────────────

describe('SolicitationCommentsService.findByToken', () => {
  it('filtra comentários internos quando includeInternal=false', async () => {
    const { service, commentsRepo } = makeService();

    await service.findByToken('tok-123', false);

    expect(commentsRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isInternal: false }),
      }),
    );
  });

  it('não filtra comentários internos quando includeInternal=true', async () => {
    const { service, commentsRepo } = makeService();

    await service.findByToken('tok-123', true);

    expect(commentsRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ isInternal: false }),
      }),
    );
  });

  it('lança NotFoundException quando token inválido', async () => {
    const { service } = makeService(null);

    await expect(service.findByToken('bad', false)).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ── addInternalComment ────────────────────────────────────────────────────────

describe('SolicitationCommentsService.addInternalComment', () => {
  it('cria comentário com authorType=team e authorUserId=actor.sub', async () => {
    const { service, commentsRepo } = makeService();

    await service.addInternalComment(
      'sol-id',
      { content: 'Nota interna', isInternal: true },
      makeActor(),
    );

    expect(commentsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        authorType: 'team',
        authorUserId: 'user-id',
        isInternal: true,
      }),
    );
  });

  it('comentário visível: avisa responsável e quem abriu, menos quem comentou', async () => {
    const sol = makeSolicitation({ assigneeId: 'resp-id', createdBy: 'autor-id' });
    const { service, userNotice } = makeService(sol);

    await service.addInternalComment('sol-id', { content: 'Resposta', isInternal: false }, makeActor());

    expect(userNotice.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'comment',
        userIds: ['resp-id', 'autor-id'],
        exceptUserIds: ['user-id'],
      }),
    );
  });

  it('nota interna: só o responsável é avisado (quem abriu não vê nota interna)', async () => {
    const sol = makeSolicitation({ assigneeId: 'resp-id', createdBy: 'autor-id' });
    const { service, userNotice } = makeService(sol);

    await service.addInternalComment('sol-id', { content: 'Nota', isInternal: true }, makeActor());

    expect(userNotice.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userIds: ['resp-id', null], title: 'Nova nota interna' }),
    );
  });

  it('lança ForbiddenException quando viewer não é assignee', async () => {
    const sol = makeSolicitation({ assigneeId: 'other-user', createdBy: 'other-user' });
    const { service } = makeService(sol);

    await expect(
      service.addInternalComment(
        'sol-id',
        { content: 'X' },
        makeActor({ role: 'viewer', sub: 'viewer-id' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('não marca proposalStatus quando o formulário não exige aprovação', async () => {
    const sol = makeSolicitation({ formId: 'form-id' });
    const form = makeForm({
      versions: [{ id: 'v1', versionNumber: 1, isPublished: true, settingsJson: {} } as never],
    });
    const { service, commentsRepo } = makeService(sol, undefined, form);

    await service.addInternalComment(
      'sol-id',
      { content: 'Resposta ao solicitante', asProposal: true },
      makeActor(),
    );

    expect(commentsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ proposalStatus: null }),
    );
  });

  it('não marca proposalStatus quando asProposal não é enviado, mesmo com formulário exigindo aprovação', async () => {
    const sol = makeSolicitation({ formId: 'form-id' });
    const form = makeForm({
      versions: [
        {
          id: 'v1',
          versionNumber: 1,
          isPublished: true,
          settingsJson: { requiresResponseApproval: true },
        } as never,
      ],
    });
    const { service, commentsRepo, historyRepo } = makeService(sol, undefined, form, null);

    await service.addInternalComment('sol-id', { content: 'Só um comentário normal' }, makeActor());

    expect(commentsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ proposalStatus: null }),
    );
    expect(historyRepo.save).not.toHaveBeenCalled();
  });

  it('marca proposalStatus=pending quando asProposal=true e o formulário exige aprovação', async () => {
    const sol = makeSolicitation({ formId: 'form-id' });
    const form = makeForm({
      versions: [
        {
          id: 'v1',
          versionNumber: 1,
          isPublished: true,
          settingsJson: { requiresResponseApproval: true },
        } as never,
      ],
    });
    const { service, commentsRepo, historyRepo } = makeService(sol, undefined, form, null);

    await service.addInternalComment(
      'sol-id',
      { content: 'Resposta ao solicitante', asProposal: true },
      makeActor(),
    );

    expect(commentsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ proposalStatus: 'pending' }),
    );
    expect(historyRepo.save).toHaveBeenCalled();
  });

  it('lança BadRequestException ao tentar criar 2ª proposta pendente', async () => {
    const sol = makeSolicitation({ formId: 'form-id' });
    const form = makeForm({
      versions: [
        {
          id: 'v1',
          versionNumber: 1,
          isPublished: true,
          settingsJson: { requiresResponseApproval: true },
        } as never,
      ],
    });
    const existingPending = makeComment({ proposalStatus: 'pending' });
    const { service } = makeService(sol, undefined, form, existingPending);

    await expect(
      service.addInternalComment(
        'sol-id',
        { content: 'Outra proposta', asProposal: true },
        makeActor(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('permite comentário normal (asProposal ausente) mesmo com uma proposta já pendente', async () => {
    const sol = makeSolicitation({ formId: 'form-id' });
    const form = makeForm({
      versions: [
        {
          id: 'v1',
          versionNumber: 1,
          isPublished: true,
          settingsJson: { requiresResponseApproval: true },
        } as never,
      ],
    });
    const existingPending = makeComment({ proposalStatus: 'pending' });
    const { service, commentsRepo } = makeService(sol, undefined, form, existingPending);

    await service.addInternalComment('sol-id', { content: 'Só acompanhando' }, makeActor());

    expect(commentsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ proposalStatus: null }),
    );
  });

  it('não exige aprovação para comentário interno mesmo com form configurado', async () => {
    const sol = makeSolicitation({ formId: 'form-id' });
    const form = makeForm({
      versions: [
        {
          id: 'v1',
          versionNumber: 1,
          isPublished: true,
          settingsJson: { requiresResponseApproval: true },
        } as never,
      ],
    });
    const { service, commentsRepo, formsRepo } = makeService(sol, undefined, form);

    await service.addInternalComment(
      'sol-id',
      { content: 'Nota interna', isInternal: true },
      makeActor(),
    );

    expect(formsRepo.findOne).not.toHaveBeenCalled();
    expect(commentsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ proposalStatus: null }),
    );
  });
});

// ── decideProposal ────────────────────────────────────────────────────────────

describe('SolicitationCommentsService.decideProposal', () => {
  it('aprova proposta pendente e muda status da solicitação para completed', async () => {
    const sol = makeSolicitation({ assigneeId: 'assignee-id' });
    const pending = makeComment({ proposalStatus: 'pending', authorType: 'team' });
    const { service, solicitationsRepo, historyRepo, userNotice } = makeService(
      sol,
      undefined,
      undefined,
      pending,
    );

    await service.decideProposal('tok-123', 'comment-id', { decision: 'approved' });

    expect(solicitationsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: SolicitationStatus.COMPLETED }),
    );
    expect(historyRepo.save).toHaveBeenCalled();
    expect(userNotice.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userIds: ['assignee-id'], title: expect.stringContaining('aprovada') }),
    );
  });

  it('reprova exigindo motivo e não muda status da solicitação', async () => {
    const sol = makeSolicitation();
    const pending = makeComment({ proposalStatus: 'pending', authorType: 'team' });
    const { service, solicitationsRepo } = makeService(sol, undefined, undefined, pending);

    await service.decideProposal('tok-123', 'comment-id', {
      decision: 'rejected',
      comment: 'Faltou anexar o documento.',
    });

    expect(solicitationsRepo.save).not.toHaveBeenCalled();
  });

  it('lança BadRequestException ao reprovar sem motivo', async () => {
    const sol = makeSolicitation();
    const pending = makeComment({ proposalStatus: 'pending', authorType: 'team' });
    const { service } = makeService(sol, undefined, undefined, pending);

    await expect(
      service.decideProposal('tok-123', 'comment-id', { decision: 'rejected' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lança BadRequestException quando o comentário já foi decidido', async () => {
    const sol = makeSolicitation();
    const decided = makeComment({ proposalStatus: 'approved', authorType: 'team' });
    const { service } = makeService(sol, undefined, undefined, decided);

    await expect(
      service.decideProposal('tok-123', 'comment-id', { decision: 'approved' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lança NotFoundException quando o token não corresponde a uma solicitação', async () => {
    const { service } = makeService(null);

    await expect(
      service.decideProposal('bad-token', 'comment-id', { decision: 'approved' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ── findBySolicitation ────────────────────────────────────────────────────────

describe('SolicitationCommentsService.findBySolicitation', () => {
  it('admin vê todos os comentários (sem filtro isInternal)', async () => {
    const { service, commentsRepo } = makeService();

    await service.findBySolicitation('sol-id', makeActor({ role: 'admin' }));

    expect(commentsRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ isInternal: false }),
      }),
    );
  });

  it('editor vê apenas comentários públicos (isInternal=false)', async () => {
    const { service, commentsRepo } = makeService(
      makeSolicitation({ createdBy: 'user-id' }),
    );

    await service.findBySolicitation(
      'sol-id',
      makeActor({ role: 'editor', sub: 'user-id' }),
    );

    expect(commentsRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isInternal: false }),
      }),
    );
  });

  // NOTE: Rate limit (6ª tentativa → 429) é um comportamento HTTP testado via e2e
  // com ThrottlerGuard. O decorator @Throttle({ default: { ttl: 60000, limit: 5 } })
  // está aplicado em POST /public/solicitations/track/:token/comments.
});
