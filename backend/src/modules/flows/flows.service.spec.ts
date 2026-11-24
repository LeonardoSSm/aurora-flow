import { QueryFailedError } from 'typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { FlowEntity } from '../../database/entities';
import { FlowsService } from './flows.service';
import type { QueryFlowsDto } from './dto/query-flows.dto';
import { fakeProcessAccess } from '../access/testing/fake-process-access';

interface CapturingQb {
  leftJoinAndSelect: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  skip: jest.Mock;
  take: jest.Mock;
  getManyAndCount: jest.Mock;
}

function makeQb(): CapturingQb {
  const qb = {
    leftJoinAndSelect: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    skip: jest.fn(),
    take: jest.fn(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  };
  qb.leftJoinAndSelect.mockReturnValue(qb);
  qb.andWhere.mockReturnValue(qb);
  qb.orderBy.mockReturnValue(qb);
  qb.skip.mockReturnValue(qb);
  qb.take.mockReturnValue(qb);
  return qb as unknown as CapturingQb;
}

function makeService() {
  const flowsRepo = {
    createQueryBuilder: jest.fn(() => makeQb()),
    findOne: jest.fn(),
    find: jest.fn(),
  };
  const executionsRepo = { findAndCount: jest.fn() };
  const submissionsRepo = {};
  const formsRepo = { exists: jest.fn().mockResolvedValue(false) };
  const solicitationsRepo = {};
  const approvalsRepo = {};
  const attachmentsRepo = {};
  const engine = {};
  const metricsService = {};
  const permissionsService = makeAccess();

  const service = new FlowsService(
    flowsRepo as never,
    executionsRepo as never,
    submissionsRepo as never,
    formsRepo as never,
    solicitationsRepo as never,
    approvalsRepo as never,
    attachmentsRepo as never,
    engine as never,
    metricsService as never,
    { find: jest.fn().mockResolvedValue([]) } as never,
    permissionsService as never,
    { getScope: jest.fn().mockResolvedValue('none') } as never,
  );
  return { service, flowsRepo, permissionsService, formsRepo };
}

const QUERY: QueryFlowsDto = { page: 1, limit: 20 } as QueryFlowsDto;

// Quem vê e gerencia fluxos: quem tem "ver/gerenciar fluxos" no vínculo com o processo do fluxo (o
// form_id dele ou o formulário de um gatilho), quem criou o fluxo, e o acesso total pelo perfil.
const FLOW_MEMBERS: Record<string, Record<string, Record<string, 'all' | 'own'>>> = {
  'gestor-id': { 'form-id': { 'flows.view': 'all', 'flows.manage': 'all' } },
  'leitor-id': { 'form-id': { 'flows.view': 'all' } },
  'operador-id': { 'form-id': { 'solicitations.view': 'all' } },
  'outro-processo-id': { 'outro-form': { 'flows.view': 'all', 'flows.manage': 'all' } },
};

function makeAccess() {
  return fakeProcessAccess({ fullAccessRoles: ['admin'], members: FLOW_MEMBERS });
}

describe('FlowsService.findAll — fluxos dos processos da pessoa', () => {
  it('acesso total: sem filtro', async () => {
    const { service, flowsRepo } = makeService();
    const qb = makeQb();
    flowsRepo.createQueryBuilder.mockReturnValue(qb);

    await service.findAll('admin-id', 'admin', QUERY);

    expect(qb.andWhere).not.toHaveBeenCalled();
  });

  it('com "ver fluxos" num processo: os fluxos dele (form_id ou gatilho) e os que criou', async () => {
    const { service, flowsRepo } = makeService();
    const qb = makeQb();
    flowsRepo.createQueryBuilder.mockReturnValue(qb);

    await service.findAll('leitor-id', 'qualquer', QUERY);

    const [sql, params] = qb.andWhere.mock.calls[0] as [string, Record<string, unknown>];
    expect(sql).toContain('flow.created_by = :flowActorId');
    expect(sql).toContain('flow.form_id IN (:...flowFormIds)');
    expect(sql).toContain("node->'data'->>'formId' IN (:...flowFormIds)");
    expect(params).toEqual({ flowActorId: 'leitor-id', flowFormIds: ['form-id'] });
  });

  it('vínculo sem "ver fluxos": só os que a própria pessoa criou', async () => {
    const { service, flowsRepo } = makeService();
    const qb = makeQb();
    flowsRepo.createQueryBuilder.mockReturnValue(qb);

    await service.findAll('operador-id', 'qualquer', QUERY);

    expect(qb.andWhere.mock.calls[0]).toEqual([
      '(flow.created_by = :flowActorId)',
      { flowActorId: 'operador-id', flowFormIds: [] },
    ]);
  });
});

describe.skip('REMOVED cycle-02 FlowsService.findByForm — fluxos de um processo', () => {
  // Fluxo criado na tela de Fluxos: sem form_id, o formulário só no nó gatilho.
  const standaloneWhere = {
    formId: expect.objectContaining({ _type: 'isNull' }),
    nodes: expect.objectContaining({ _type: 'raw' }),
  };

  it('com "ver fluxos" no processo: todos os fluxos dele, não só os que criou', async () => {
    const { service, flowsRepo } = makeService();
    flowsRepo.find.mockResolvedValue([]);

    await service.findByForm('form-id', 'leitor-id', 'qualquer');

    expect(flowsRepo.find).toHaveBeenCalledWith({
      where: [{ formId: 'form-id' }, standaloneWhere],
      order: { createdAt: 'ASC' },
    });
  });

  it('fluxo sem form_id entra quando um nó gatilho aponta para o formulário', async () => {
    const { service, flowsRepo } = makeService();
    const linked = {
      id: 'flow-linked',
      formId: null,
      nodes: [
        { id: 't', type: 'trigger_attachment_uploaded', data: { formId: 'form-id' } },
        { id: 'a', type: 'action_ai_agent', data: {} },
      ],
    };
    // A busca no banco casa qualquer nó com data.formId; só gatilho conta.
    const actionOnly = {
      id: 'flow-action-only',
      formId: null,
      nodes: [
        { id: 't', type: 'trigger_form_submit', data: { formId: 'other-form' } },
        { id: 'r', type: 'action_run_flow', data: { formId: 'form-id' } },
      ],
    };
    const bound = { id: 'flow-bound', formId: 'form-id', nodes: [] };
    flowsRepo.find.mockResolvedValue([bound, linked, actionOnly]);

    const flows = await service.findByForm('form-id', 'admin-id', 'admin');

    expect(flows.map((flow) => flow.id)).toEqual(['flow-bound', 'flow-linked']);
    const [, standalone] = flowsRepo.find.mock.calls[0][0].where;
    expect(standalone.nodes.getSql('nodes')).toBe('nodes @> CAST(:triggerFormPattern AS jsonb)');
    expect(standalone.nodes._objectLiteralParameters).toEqual({
      triggerFormPattern: JSON.stringify([{ data: { formId: 'form-id' } }]),
    });
  });

  it('sem "ver fluxos" no processo: só os fluxos dele que a pessoa criou', async () => {
    const { service, flowsRepo } = makeService();
    flowsRepo.find.mockResolvedValue([]);

    await service.findByForm('form-id', 'operador-id', 'qualquer');

    expect(flowsRepo.find).toHaveBeenCalledWith({
      where: [
        { formId: 'form-id', createdBy: 'operador-id' },
        { ...standaloneWhere, createdBy: 'operador-id' },
      ],
      order: { createdAt: 'ASC' },
    });
  });

  it('nunca filtra pela coluna apagada form.assignedUserId (dava 500 no banco real)', async () => {
    const { service, flowsRepo } = makeService();
    flowsRepo.find.mockResolvedValue([]);

    await service.findByForm('form-id', 'operador-id', 'qualquer');

    expect(JSON.stringify(flowsRepo.find.mock.calls)).not.toContain('assignedUserId');
  });
});

describe('FlowsService.findOne (findByIdOrFail) — vínculo com o processo do fluxo', () => {
  const flowOf = (overrides: Record<string, unknown> = {}) => ({
    id: 'flow-id',
    createdBy: 'someone-else',
    formId: 'form-id',
    form: null,
    nodes: [],
    ...overrides,
  });

  it('com "ver fluxos" no processo do fluxo, abre', async () => {
    const { service, flowsRepo } = makeService();
    flowsRepo.findOne.mockResolvedValue(flowOf());

    await expect(service.findOne('flow-id', 'leitor-id', 'qualquer')).resolves.toMatchObject({ id: 'flow-id' });
  });

  it('o processo do fluxo também vem do gatilho (fluxo criado na tela de Fluxos)', async () => {
    const { service, flowsRepo } = makeService();
    flowsRepo.findOne.mockResolvedValue(
      flowOf({ formId: null, nodes: [{ id: 't', type: 'trigger_form_submit', data: { formId: 'form-id' } }] }),
    );

    await expect(service.findOne('flow-id', 'leitor-id', 'qualquer')).resolves.toMatchObject({ id: 'flow-id' });
  });

  it('quem criou o fluxo abre, mesmo sem vínculo', async () => {
    const { service, flowsRepo } = makeService();
    flowsRepo.findOne.mockResolvedValue(flowOf({ createdBy: 'operador-id' }));

    await expect(service.findOne('flow-id', 'operador-id', 'qualquer')).resolves.toBeDefined();
  });

  it('vínculo só com outro processo: 404 (não revela que o fluxo existe)', async () => {
    const { service, flowsRepo } = makeService();
    flowsRepo.findOne.mockResolvedValue(flowOf());

    await expect(service.findOne('flow-id', 'outro-processo-id', 'qualquer')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('"ver" não basta para gerenciar', async () => {
    const { service, flowsRepo } = makeService();
    flowsRepo.findOne.mockResolvedValue(flowOf());

    await expect(service.assertFlowAccess('flow-id', 'leitor-id', 'qualquer', 'manage')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.assertFlowAccess('flow-id', 'gestor-id', 'qualquer', 'manage')).resolves.toBeDefined();
  });

  it('fluxo inexistente: 404', async () => {
    const { service, flowsRepo } = makeService();
    flowsRepo.findOne.mockResolvedValue(null);

    await expect(service.findOne('ghost', 'admin-id', 'admin')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe.skip('REMOVED cycle-02 FlowsService — validação do nó de criar solicitação', () => {
  // validateFlowStructure é privado; o acesso por índice mantém o teste no
  // comportamento público de "salvar um fluxo inválido é rejeitado", sem exigir
  // repositório de verdade só para chegar até a validação.
  function validate(data: Record<string, unknown>): void {
    const { service } = makeService();
    const nodes = [
      { id: 'trigger', type: 'trigger_solicitation_moved', position: { x: 0, y: 0 }, data: {} },
      {
        id: 'action',
        type: 'action_create_solicitation_from_payload',
        position: { x: 0, y: 0 },
        data,
      },
    ];
    (
      service as unknown as {
        validateFlowStructure: (n: unknown[], e: unknown[]) => void;
      }
    ).validateFlowStructure(nodes, [{ id: 'e1', source: 'trigger', target: 'action' }]);
  }

  it('aceita título por template, sem titlePath', () => {
    expect(() =>
      validate({ titleTemplate: 'Renovar certificado digital A4', dueInMonths: 12 }),
    ).not.toThrow();
  });

  it('aceita título por dot-path (comportamento anterior)', () => {
    expect(() => validate({ titlePath: 'header.numeroPedido' })).not.toThrow();
  });

  it('rejeita nó sem nenhuma origem de título', () => {
    expect(() => validate({ dueInMonths: 12 })).toThrow(/titlePath ou titleTemplate/);
  });

  it('rejeita prazo não inteiro ou negativo', () => {
    expect(() => validate({ titleTemplate: 'X', dueInMonths: 0 })).toThrow(/dueInMonths/);
    expect(() => validate({ titleTemplate: 'X', dueInDays: -5 })).toThrow(/dueInDays/);
    expect(() => validate({ titleTemplate: 'X', dueInMonths: 1.5 })).toThrow(/dueInMonths/);
  });

  it('rejeita percentual de alerta fora de 1–99', () => {
    expect(() => validate({ titleTemplate: 'X', slaWarningThresholdPercent: 0 })).toThrow(
      /slaWarningThresholdPercent/,
    );
    expect(() => validate({ titleTemplate: 'X', slaWarningThresholdPercent: 100 })).toThrow(
      /slaWarningThresholdPercent/,
    );
    expect(() => validate({ titleTemplate: 'X', slaWarningThresholdPercent: 92 })).not.toThrow();
  });
});

describe.skip('REMOVED cycle-02 FlowsService — validação do gatilho de anexo e do nó LOPS IA', () => {
  function validate(triggerType: string, triggerData: Record<string, unknown>, actionType: string, actionData: Record<string, unknown>): void {
    const { service } = makeService();
    const nodes = [
      { id: 'trigger', type: triggerType, position: { x: 0, y: 0 }, data: triggerData },
      { id: 'action', type: actionType, position: { x: 0, y: 0 }, data: actionData },
    ];
    (
      service as unknown as {
        validateFlowStructure: (n: unknown[], e: unknown[]) => void;
      }
    ).validateFlowStructure(nodes, [{ id: 'e1', source: 'trigger', target: 'action' }]);
  }

  it('aceita trigger_attachment_uploaded sem fieldCode (qualquer anexo de imagem)', () => {
    expect(() =>
      validate('trigger_attachment_uploaded', {}, 'action_ai_agent', {
        agentSlug: 'validador-de-etiquetas',
        apiKey: 'secret',
      }),
    ).not.toThrow();
  });

  it('rejeita trigger_attachment_uploaded com fieldCode vazio', () => {
    expect(() =>
      validate('trigger_attachment_uploaded', { fieldCode: '   ' }, 'action_ai_agent', {
        agentSlug: 'a',
        apiKey: 'k',
      }),
    ).toThrow(/fieldCode/);
  });

  it('o nó LOPS IA exige o agente e a chave do nó, mas não a URL (vem do servidor, LOPS_AI_BASE_URL)', () => {
    expect(() =>
      validate('trigger_attachment_uploaded', {}, 'action_ai_agent', { agentSlug: 'a', apiKey: 'k' }),
    ).not.toThrow();
  });

  it('rejeita action_ai_agent sem agentSlug (nenhum agente escolhido na lista)', () => {
    expect(() =>
      validate('trigger_attachment_uploaded', {}, 'action_ai_agent', { apiKey: 'k' }),
    ).toThrow(/agentSlug/);
    expect(() =>
      validate('trigger_attachment_uploaded', {}, 'action_ai_agent', { agentSlug: '   ', apiKey: 'k' }),
    ).toThrow(/agentSlug/);
  });

  it('rejeita action_ai_agent sem a chave do nó (a chave do servidor não executa agentes)', () => {
    expect(() =>
      validate('trigger_attachment_uploaded', {}, 'action_ai_agent', { agentSlug: 'a' }),
    ).toThrow(/apiKey/);
    expect(() =>
      validate('trigger_attachment_uploaded', {}, 'action_ai_agent', { agentSlug: 'a', apiKey: '  ' }),
    ).toThrow(/apiKey/);
  });

  it('continua aceitando nós antigos que guardam também o baseUrl', () => {
    expect(() =>
      validate('trigger_attachment_uploaded', {}, 'action_ai_agent', {
        baseUrl: 'https://lopsapi.appstijuca.com.br/api/v1',
        agentSlug: 'validador-de-etiquetas',
        apiKey: 'secret',
      }),
    ).not.toThrow();
  });

  it('aceita action_create_approval no modo phase_role sem assignedUserIds/approversPath', () => {
    expect(() =>
      validate('trigger_attachment_uploaded', {}, 'action_create_approval', {
        title: 'Aprovação de fase',
        scope: 'phase',
        approverSourceMode: 'phase_role',
      }),
    ).not.toThrow();
  });

  it('valida o "Avisar quem aprova por e-mail" do Criar aprovação', () => {
    const base = { title: 'X', assignedUserIds: ['u1'] };
    expect(() =>
      validate('trigger_solicitation_created', {}, 'action_create_approval', {
        ...base,
        emailApprovers: { enabled: true, subject: 'Aprovar {{approval_title}}', body: 'Link: {{approval_link}}' },
      }),
    ).not.toThrow();
    expect(() =>
      validate('trigger_solicitation_created', {}, 'action_create_approval', { ...base, emailApprovers: { enabled: 'sim' } }),
    ).toThrow(/enabled/);
    expect(() =>
      validate('trigger_solicitation_created', {}, 'action_create_approval', { ...base, emailApprovers: { subject: 'x'.repeat(201) } }),
    ).toThrow(/assunto/);
    expect(() =>
      validate('trigger_solicitation_created', {}, 'action_create_approval', { ...base, emailApprovers: { body: 'Oi {{nome' } }),
    ).toThrow(/mal formada/);
  });

  it('rejeita action_create_approval com scope inválido', () => {
    expect(() =>
      validate('trigger_attachment_uploaded', {}, 'action_create_approval', {
        title: 'X',
        scope: 'invalido',
        assignedUserIds: ['u1'],
      }),
    ).toThrow(/scope/);
  });

  it('aceita action_create_approval no modo campo do formulário com approverFieldCode', () => {
    expect(() =>
      validate('trigger_solicitation_created', {}, 'action_create_approval', {
        title: 'Aprovação do gestor',
        approverSourceMode: 'field',
        approverFieldCode: 'email_gestor',
      }),
    ).not.toThrow();
  });

  it('rejeita action_create_approval no modo campo do formulário sem approverFieldCode', () => {
    expect(() =>
      validate('trigger_solicitation_created', {}, 'action_create_approval', {
        title: 'Aprovação do gestor',
        approverSourceMode: 'field',
        approverFieldCode: '  ',
      }),
    ).toThrow(/approverFieldCode/);
  });

  it('aceita action_create_approval no modo fixed só com approverEmails (gestor sem usuário)', () => {
    expect(() =>
      validate('trigger_solicitation_created', {}, 'action_create_approval', {
        title: 'Aprovação do gestor',
        approverEmails: ['gestor@tijucaalimentos.com'],
      }),
    ).not.toThrow();
  });

  it('aceita usuários e e-mails juntos no modo fixed', () => {
    expect(() =>
      validate('trigger_solicitation_created', {}, 'action_create_approval', {
        title: 'Aprovação',
        assignedUserIds: ['u1'],
        approverEmails: ['gestor@tijucaalimentos.com'],
      }),
    ).not.toThrow();
  });

  it.each([
    ['não é lista', 'gestor@x.com'],
    ['e-mail inválido', ['sem-arroba']],
    ['item que não é texto', [123]],
    ['mais de 10 e-mails', Array.from({ length: 11 }, (_, i) => `a${i}@x.com`)],
  ])('rejeita approverEmails inválido (%s)', (_label, approverEmails) => {
    expect(() =>
      validate('trigger_solicitation_created', {}, 'action_create_approval', {
        title: 'Aprovação',
        assignedUserIds: ['u1'],
        approverEmails,
      }),
    ).toThrow(/approverEmails/);
  });

  it('modo fixed com approverEmails vazio e sem usuários continua sendo rejeitado', () => {
    expect(() =>
      validate('trigger_solicitation_created', {}, 'action_create_approval', {
        title: 'Aprovação',
        approverEmails: [],
      }),
    ).toThrow(/assignedUserIds, approverRoleCodes ou approverEmails/);
  });

  it('modo fixed aceita só perfis (approverRoleCodes) e recusa lista malformada', () => {
    expect(() =>
      validate('trigger_solicitation_created', {}, 'action_create_approval', {
        title: 'Aprovação',
        approverRoleCodes: ['diretor'],
      }),
    ).not.toThrow();
    expect(() =>
      validate('trigger_solicitation_created', {}, 'action_create_approval', {
        title: 'Aprovação',
        approverRoleCodes: [''],
      }),
    ).toThrow(/approverRoleCodes inválido/);
  });

  it('"Entrou na fase" e "Aprovação concluída" aceitam filtro de fase; filtro vazio é recusado', () => {
    expect(() =>
      validate('trigger_phase_entered', { phaseId: 'p-aprov', fromPhaseId: 'p-triagem' }, 'action_move_phase', {
        phaseId: 'p-compra',
      }),
    ).not.toThrow();
    expect(() =>
      validate('trigger_phase_entered', { fromPhaseId: '' }, 'action_move_phase', { phaseId: 'p' }),
    ).toThrow(/fromPhaseId inválido/);
    expect(() =>
      validate('trigger_approval_completed', { phaseId: '' }, 'action_move_phase', { phaseId: 'p' }),
    ).toThrow(/phaseId inválido/);
  });

  it('aceita allowExternalApprovers booleano e rejeita outros tipos', () => {
    expect(() =>
      validate('trigger_solicitation_created', {}, 'action_create_approval', {
        title: 'Aprovação do gestor',
        approverSourceMode: 'field',
        approverFieldCode: 'email_gestor',
        allowExternalApprovers: true,
      }),
    ).not.toThrow();
    expect(() =>
      validate('trigger_solicitation_created', {}, 'action_create_approval', {
        title: 'Aprovação do gestor',
        approverSourceMode: 'field',
        approverFieldCode: 'email_gestor',
        allowExternalApprovers: 'sim',
      }),
    ).toThrow(/allowExternalApprovers/);
  });

  it('continua exigindo assignedUserIds no modo fixed (comportamento anterior)', () => {
    expect(() =>
      validate('trigger_attachment_uploaded', {}, 'action_create_approval', { title: 'X' }),
    ).toThrow(/assignedUserIds/);
  });

  it('aceita trigger_phase_field_saved sem phaseId (qualquer fase do formulário)', () => {
    expect(() =>
      validate('trigger_phase_field_saved', {}, 'action_create_approval', {
        title: 'Aprovação de fase',
        scope: 'phase',
        approverSourceMode: 'phase_role',
      }),
    ).not.toThrow();
  });

  it('rejeita trigger_phase_field_saved com phaseId vazio', () => {
    expect(() =>
      validate('trigger_phase_field_saved', { phaseId: '   ' }, 'action_create_approval', {
        title: 'X',
        scope: 'phase',
        approverSourceMode: 'phase_role',
      }),
    ).toThrow(/phaseId/);
  });

  it('aceita condition_approval_result com operator/value válidos', () => {
    expect(() =>
      validate('trigger_attachment_uploaded', {}, 'condition_approval_result', {
        operator: 'equals',
        value: 'approved',
      }),
    ).not.toThrow();
  });

  it('rejeita condition_approval_result com value fora de approved/rejected', () => {
    expect(() =>
      validate('trigger_attachment_uploaded', {}, 'condition_approval_result', {
        operator: 'equals',
        value: 'pending',
      }),
    ).toThrow(/approved.*rejected|value/);
  });

  it('rejeita condition_approval_result com operator inválido', () => {
    expect(() =>
      validate('trigger_attachment_uploaded', {}, 'condition_approval_result', {
        operator: 'contains',
        value: 'approved',
      }),
    ).toThrow();
  });

  it('aceita action_wait_for_phase_fields com phaseId', () => {
    expect(() =>
      validate('trigger_attachment_uploaded', {}, 'action_wait_for_phase_fields', {
        phaseId: 'phase-id',
      }),
    ).not.toThrow();
  });

  it('rejeita action_wait_for_phase_fields sem phaseId', () => {
    expect(() =>
      validate('trigger_attachment_uploaded', {}, 'action_wait_for_phase_fields', {}),
    ).toThrow(/phaseId/);
  });

  it('aceita action_move_phase com phaseId', () => {
    expect(() =>
      validate('trigger_attachment_uploaded', {}, 'action_move_phase', { phaseId: 'phase-id' }),
    ).not.toThrow();
  });

  it('rejeita action_move_phase sem phaseId', () => {
    expect(() =>
      validate('trigger_attachment_uploaded', {}, 'action_move_phase', {}),
    ).toThrow(/phaseId/);
  });
});

// ─── FlowsService.executeFlowWithContext / resumePausedExecution ────────────
// Cobre a correcao da pausa em action_create_approval: sem etapa de espera de verdade
// no motor, uma condicao logo depois de criar a aprovacao avaliava o status desatualizado
// e o ramo "nao" chegava a mover o card de verdade antes de qualquer decisao humana.

describe.skip('REMOVED cycle-02 FlowsService.executeFlowWithContext / resumePausedExecution', () => {
  function makeFlow(overrides: Partial<FlowEntity> = {}): FlowEntity {
    return {
      id: 'flow-id',
      formId: 'form-id',
      isActive: true,
      nodes: [],
      edges: [],
      consecutiveFailureCount: 0,
      ...overrides,
    } as FlowEntity;
  }

  function makeExecutionService() {
    const flowsRepo = { findOne: jest.fn() };
    const executionsRepo = {
      findOne: jest.fn(),
      create: jest.fn((data: object) => data),
      save: jest.fn().mockResolvedValue({ id: 'execution-id' }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const submissionsRepo = { findOne: jest.fn() };
    const formsRepo = {};
    const solicitationsRepo = { findOne: jest.fn() };
    const approvalsRepo = { findOne: jest.fn() };
    const attachmentsRepo = { findOne: jest.fn() };
    const engine = { execute: jest.fn(), resumeFrom: jest.fn() };
    const metricsService = { recordFlowExecution: jest.fn() };
    const permissionsService = {};
    const phaseFieldValuesRepo = { find: jest.fn().mockResolvedValue([]) };

    const service = new FlowsService(
      flowsRepo as never,
      executionsRepo as never,
      submissionsRepo as never,
      formsRepo as never,
      solicitationsRepo as never,
      approvalsRepo as never,
      attachmentsRepo as never,
      engine as never,
      metricsService as never,
      phaseFieldValuesRepo as never,
      permissionsService as never,
      { getScope: jest.fn().mockResolvedValue('none') } as never,
    );

    return {
      service,
      flowsRepo,
      executionsRepo,
      submissionsRepo,
      solicitationsRepo,
      approvalsRepo,
      engine,
      metricsService,
      phaseFieldValuesRepo,
    };
  }

  it('marca a execucao como waiting_approval quando o motor sinaliza pausa, sem contar metricas de conclusao', async () => {
    const { service, executionsRepo, engine, metricsService } = makeExecutionService();
    engine.execute.mockResolvedValue([
      { nodeId: 'trigger', status: 'success', durationMs: 1 },
      {
        nodeId: 'approval',
        status: 'success',
        durationMs: 1,
        output: { paused: true, approvalId: 'approval-id' },
      },
    ]);

    await service.executeFlowWithContext(makeFlow(), { eventName: 'solicitations.moved' });

    expect(executionsRepo.update).toHaveBeenCalledTimes(1);
    expect(executionsRepo.update).toHaveBeenCalledWith(
      'execution-id',
      expect.objectContaining({
        status: 'waiting_approval',
        approvalId: 'approval-id',
        pausedNodeId: 'approval',
      }),
    );
    expect(metricsService.recordFlowExecution).not.toHaveBeenCalled();
  });

  it('conclui normalmente quando o motor nao sinaliza pausa', async () => {
    const { service, executionsRepo, metricsService, engine } = makeExecutionService();
    engine.execute.mockResolvedValue([{ nodeId: 'trigger', status: 'success', durationMs: 1 }]);

    await service.executeFlowWithContext(makeFlow(), { eventName: 'solicitations.created' });

    expect(executionsRepo.update).toHaveBeenCalledWith(
      'execution-id',
      expect.objectContaining({ status: 'success' }),
    );
    expect(metricsService.recordFlowExecution).toHaveBeenCalledWith(
      'flow-id',
      'success',
      expect.any(Number),
    );
  });

  it('entrega ao motor os campos de fase salvos na solicitacao, com a resposta do formulario ganhando no mesmo codigo', async () => {
    const { service, engine, phaseFieldValuesRepo } = makeExecutionService();
    engine.execute.mockResolvedValue([{ nodeId: 'trigger', status: 'success', durationMs: 1 }]);
    phaseFieldValuesRepo.find.mockResolvedValue([
      { fieldCode: 'retirado_de_rota', valueText: null, valueNumber: null, valueBoolean: true, valueJson: null },
      { fieldCode: 'romaneio', valueText: 'R-77', valueNumber: null, valueBoolean: null, valueJson: null },
      { fieldCode: 'motivo', valueText: 'da fase', valueNumber: null, valueBoolean: null, valueJson: null },
    ]);

    await service.executeFlowWithContext(makeFlow(), {
      eventName: 'solicitations.phase_fields_saved',
      solicitation: { id: 'solicitation-id' } as never,
      fields: { motivo: 'do formulario' },
    });

    expect(phaseFieldValuesRepo.find).toHaveBeenCalledWith({
      where: { solicitationId: 'solicitation-id' },
    });
    expect(engine.execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        fields: { retirado_de_rota: true, romaneio: 'R-77', motivo: 'do formulario' },
      }),
    );
  });

  it('sem solicitacao no contexto nao consulta campos de fase', async () => {
    const { service, engine, phaseFieldValuesRepo } = makeExecutionService();
    engine.execute.mockResolvedValue([{ nodeId: 'trigger', status: 'success', durationMs: 1 }]);

    await service.executeFlowWithContext(makeFlow(), {
      eventName: 'responses.submitted',
      fields: { motivo: 'x' },
    });

    expect(phaseFieldValuesRepo.find).not.toHaveBeenCalled();
    expect(engine.execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ fields: { motivo: 'x' } }),
    );
  });

  it('resumePausedExecution retoma do no pausado e conclui a execucao, anexando aos resultados anteriores', async () => {
    const { service, executionsRepo, flowsRepo, approvalsRepo, engine, metricsService } =
      makeExecutionService();
    executionsRepo.findOne.mockResolvedValue({
      id: 'execution-id',
      flowId: 'flow-id',
      status: 'waiting_approval',
      pausedNodeId: 'approval',
      nodeResults: [{ nodeId: 'trigger', status: 'success', durationMs: 1 }],
    });
    const flow = makeFlow();
    flowsRepo.findOne.mockResolvedValue(flow);
    approvalsRepo.findOne.mockResolvedValue({
      id: 'approval-id',
      solicitationId: 'solicitation-id',
      solicitation: { id: 'solicitation-id', formId: 'form-id', form: null, submission: null },
    });
    engine.resumeFrom.mockResolvedValue([{ nodeId: 'condition', status: 'success', durationMs: 1 }]);

    await service.resumePausedExecution('execution-id', 'approval-id');

    expect(engine.resumeFrom).toHaveBeenCalledWith(
      flow,
      'approval',
      expect.objectContaining({ flowId: 'flow-id', flowExecutionId: 'execution-id' }),
    );
    expect(executionsRepo.update).toHaveBeenCalledWith(
      'execution-id',
      expect.objectContaining({
        status: 'success',
        nodeResults: [
          { nodeId: 'trigger', status: 'success', durationMs: 1 },
          { nodeId: 'condition', status: 'success', durationMs: 1 },
        ],
      }),
    );
    expect(metricsService.recordFlowExecution).toHaveBeenCalledWith(
      'flow-id',
      'success',
      expect.any(Number),
    );
  });

  it('resumePausedExecution volta a pausar se o motor encontra um segundo action_create_approval', async () => {
    const { service, executionsRepo, flowsRepo, approvalsRepo, engine } = makeExecutionService();
    executionsRepo.findOne.mockResolvedValue({
      id: 'execution-id',
      flowId: 'flow-id',
      status: 'waiting_approval',
      pausedNodeId: 'approval-1',
      nodeResults: [],
    });
    flowsRepo.findOne.mockResolvedValue(makeFlow());
    approvalsRepo.findOne.mockResolvedValue({
      id: 'approval-1',
      solicitationId: 'solicitation-id',
      solicitation: { id: 'solicitation-id', formId: 'form-id', form: null, submission: null },
    });
    engine.resumeFrom.mockResolvedValue([
      {
        nodeId: 'approval-2',
        status: 'success',
        durationMs: 1,
        output: { paused: true, approvalId: 'approval-2' },
      },
    ]);

    await service.resumePausedExecution('execution-id', 'approval-1');

    expect(executionsRepo.update).toHaveBeenCalledWith(
      'execution-id',
      expect.objectContaining({
        status: 'waiting_approval',
        approvalId: 'approval-2',
        pausedNodeId: 'approval-2',
      }),
    );
  });

  it('resumePausedExecution nao faz nada se a execucao nao esta mais waiting_approval', async () => {
    const { service, executionsRepo, engine } = makeExecutionService();
    executionsRepo.findOne.mockResolvedValue({
      id: 'execution-id',
      status: 'success',
      pausedNodeId: null,
    });

    await service.resumePausedExecution('execution-id', 'approval-id');

    expect(engine.resumeFrom).not.toHaveBeenCalled();
    expect(executionsRepo.update).not.toHaveBeenCalled();
  });

  it('resumePausedExecution marca a execucao como failed se o fluxo foi removido/desativado', async () => {
    const { service, executionsRepo, flowsRepo, engine } = makeExecutionService();
    executionsRepo.findOne.mockResolvedValue({
      id: 'execution-id',
      flowId: 'flow-id',
      status: 'waiting_approval',
      pausedNodeId: 'approval',
    });
    flowsRepo.findOne.mockResolvedValue(null);

    await service.resumePausedExecution('execution-id', 'approval-id');

    expect(engine.resumeFrom).not.toHaveBeenCalled();
    expect(executionsRepo.update).toHaveBeenCalledWith(
      'execution-id',
      expect.objectContaining({ status: 'failed' }),
    );
  });
});

describe.skip('REMOVED cycle-02 FlowsService.resumePausedPhaseFieldsExecution', () => {
  function makeFlow(overrides: Partial<FlowEntity> = {}): FlowEntity {
    return {
      id: 'flow-id',
      formId: 'form-id',
      isActive: true,
      nodes: [],
      edges: [],
      consecutiveFailureCount: 0,
      ...overrides,
    } as FlowEntity;
  }

  function makeExecutionService() {
    const flowsRepo = { findOne: jest.fn() };
    const executionsRepo = {
      findOne: jest.fn(),
      create: jest.fn((data: object) => data),
      save: jest.fn().mockResolvedValue({ id: 'execution-id' }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const submissionsRepo = { findOne: jest.fn() };
    const formsRepo = {};
    const solicitationsRepo = { findOne: jest.fn() };
    const approvalsRepo = { findOne: jest.fn() };
    const attachmentsRepo = { findOne: jest.fn() };
    const engine = { execute: jest.fn(), resumeFrom: jest.fn() };
    const metricsService = { recordFlowExecution: jest.fn() };
    const permissionsService = {};

    const service = new FlowsService(
      flowsRepo as never,
      executionsRepo as never,
      submissionsRepo as never,
      formsRepo as never,
      solicitationsRepo as never,
      approvalsRepo as never,
      attachmentsRepo as never,
      engine as never,
      metricsService as never,
      { find: jest.fn().mockResolvedValue([]) } as never,
      permissionsService as never,
      { getScope: jest.fn().mockResolvedValue('none') } as never,
    );

    return { service, flowsRepo, executionsRepo, submissionsRepo, solicitationsRepo, engine, metricsService };
  }

  it('retoma do nó pausado e conclui a execução, anexando aos resultados anteriores', async () => {
    const { service, executionsRepo, flowsRepo, solicitationsRepo, engine, metricsService } =
      makeExecutionService();
    executionsRepo.findOne.mockResolvedValue({
      id: 'execution-id',
      flowId: 'flow-id',
      solicitationId: 'solicitation-id',
      status: 'waiting_phase_fields',
      pausedNodeId: 'wait',
      nodeResults: [{ nodeId: 'trigger', status: 'success', durationMs: 1 }],
    });
    const flow = makeFlow();
    flowsRepo.findOne.mockResolvedValue(flow);
    solicitationsRepo.findOne.mockResolvedValue({
      id: 'solicitation-id',
      formId: 'form-id',
      form: null,
      submission: null,
    });
    engine.resumeFrom.mockResolvedValue([{ nodeId: 'approval', status: 'success', durationMs: 1 }]);

    await service.resumePausedPhaseFieldsExecution('execution-id', { phaseId: 'phase-quantidade' });

    expect(engine.resumeFrom).toHaveBeenCalledWith(
      flow,
      'wait',
      expect.objectContaining({
        flowId: 'flow-id',
        flowExecutionId: 'execution-id',
        metadata: { phaseId: 'phase-quantidade' },
      }),
    );
    expect(executionsRepo.update).toHaveBeenCalledWith(
      'execution-id',
      expect.objectContaining({
        status: 'success',
        nodeResults: [
          { nodeId: 'trigger', status: 'success', durationMs: 1 },
          { nodeId: 'approval', status: 'success', durationMs: 1 },
        ],
      }),
    );
    expect(metricsService.recordFlowExecution).toHaveBeenCalledWith(
      'flow-id',
      'success',
      expect.any(Number),
    );
  });

  it('volta a pausar como waiting_approval se o motor encontra um action_create_approval logo depois', async () => {
    const { service, executionsRepo, flowsRepo, solicitationsRepo, engine } = makeExecutionService();
    executionsRepo.findOne.mockResolvedValue({
      id: 'execution-id',
      flowId: 'flow-id',
      solicitationId: 'solicitation-id',
      status: 'waiting_phase_fields',
      pausedNodeId: 'wait',
      nodeResults: [],
    });
    flowsRepo.findOne.mockResolvedValue(makeFlow());
    solicitationsRepo.findOne.mockResolvedValue({
      id: 'solicitation-id',
      formId: 'form-id',
      form: null,
      submission: null,
    });
    engine.resumeFrom.mockResolvedValue([
      {
        nodeId: 'approval-2',
        status: 'success',
        durationMs: 1,
        output: { paused: true, approvalId: 'approval-2' },
      },
    ]);

    await service.resumePausedPhaseFieldsExecution('execution-id', { phaseId: 'phase-quantidade' });

    expect(executionsRepo.update).toHaveBeenCalledWith(
      'execution-id',
      expect.objectContaining({
        status: 'waiting_approval',
        approvalId: 'approval-2',
        pausedNodeId: 'approval-2',
        waitingPhaseId: null,
      }),
    );
  });

  it('volta a pausar como waiting_phase_fields se o motor encontra outro action_wait_for_phase_fields', async () => {
    const { service, executionsRepo, flowsRepo, solicitationsRepo, engine } = makeExecutionService();
    executionsRepo.findOne.mockResolvedValue({
      id: 'execution-id',
      flowId: 'flow-id',
      solicitationId: 'solicitation-id',
      status: 'waiting_phase_fields',
      pausedNodeId: 'wait-1',
      nodeResults: [],
    });
    flowsRepo.findOne.mockResolvedValue(makeFlow());
    solicitationsRepo.findOne.mockResolvedValue({
      id: 'solicitation-id',
      formId: 'form-id',
      form: null,
      submission: null,
    });
    engine.resumeFrom.mockResolvedValue([
      {
        nodeId: 'wait-2',
        status: 'success',
        durationMs: 1,
        output: { paused: true, waitingPhaseId: 'phase-concluido' },
      },
    ]);

    await service.resumePausedPhaseFieldsExecution('execution-id', { phaseId: 'phase-quantidade' });

    expect(executionsRepo.update).toHaveBeenCalledWith(
      'execution-id',
      expect.objectContaining({
        status: 'waiting_phase_fields',
        waitingPhaseId: 'phase-concluido',
        pausedNodeId: 'wait-2',
        approvalId: null,
      }),
    );
  });

  it('não faz nada se a execução não está mais waiting_phase_fields', async () => {
    const { service, executionsRepo, engine } = makeExecutionService();
    executionsRepo.findOne.mockResolvedValue({
      id: 'execution-id',
      status: 'success',
      pausedNodeId: null,
    });

    await service.resumePausedPhaseFieldsExecution('execution-id', {});

    expect(engine.resumeFrom).not.toHaveBeenCalled();
    expect(executionsRepo.update).not.toHaveBeenCalled();
  });

  it('marca a execução como failed se o fluxo foi removido/desativado', async () => {
    const { service, executionsRepo, flowsRepo, engine } = makeExecutionService();
    executionsRepo.findOne.mockResolvedValue({
      id: 'execution-id',
      flowId: 'flow-id',
      solicitationId: 'solicitation-id',
      status: 'waiting_phase_fields',
      pausedNodeId: 'wait',
    });
    flowsRepo.findOne.mockResolvedValue(null);

    await service.resumePausedPhaseFieldsExecution('execution-id', {});

    expect(engine.resumeFrom).not.toHaveBeenCalled();
    expect(executionsRepo.update).toHaveBeenCalledWith(
      'execution-id',
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('marca a execução como failed se não há solicitationId associado', async () => {
    const { service, executionsRepo, flowsRepo, engine } = makeExecutionService();
    executionsRepo.findOne.mockResolvedValue({
      id: 'execution-id',
      flowId: 'flow-id',
      solicitationId: null,
      status: 'waiting_phase_fields',
      pausedNodeId: 'wait',
    });
    flowsRepo.findOne.mockResolvedValue(makeFlow());

    await service.resumePausedPhaseFieldsExecution('execution-id', {});

    expect(engine.resumeFrom).not.toHaveBeenCalled();
    expect(executionsRepo.update).toHaveBeenCalledWith(
      'execution-id',
      expect.objectContaining({ status: 'failed' }),
    );
  });
});

// ─── Defeitos conhecidos do módulo Fluxo ────────────────────────────────────────────────────
// Diagnóstico da suíte (ver documento "Diagnóstico da suíte de testes do módulo Fluxo"): os testes
// marcados com [P-xx] descrevem o comportamento CORRETO e falham hoje — cada um reproduz o
// defeito de mesmo número e fica verde quando a correção entra. Os casos sem marcação são
// contraprovas que já passam e protegem o que a correção não pode quebrar.

type PartesDoServico = Partial<
  Record<
    | 'flowsRepo'
    | 'executionsRepo'
    | 'submissionsRepo'
    | 'formsRepo'
    | 'solicitationsRepo'
    | 'approvalsRepo'
    | 'attachmentsRepo'
    | 'engine'
    | 'metricsService'
    | 'permissionsService'
    | 'phaseFieldValuesRepo',
    unknown
  >
>;

function novoServico(partes: PartesDoServico = {}) {
  return new FlowsService(
    (partes.flowsRepo ?? {}) as never,
    (partes.executionsRepo ?? {}) as never,
    (partes.submissionsRepo ?? {}) as never,
    (partes.formsRepo ?? {}) as never,
    (partes.solicitationsRepo ?? {}) as never,
    (partes.approvalsRepo ?? {}) as never,
    (partes.attachmentsRepo ?? {}) as never,
    (partes.engine ?? {}) as never,
    (partes.metricsService ?? {}) as never,
    (partes.phaseFieldValuesRepo ?? { find: jest.fn().mockResolvedValue([]) }) as never,
    (partes.permissionsService ?? {}) as never,
    { getScope: jest.fn().mockResolvedValue('none') } as never,
  );
}

describe.skip('REMOVED cycle-02 FlowsService — idempotência da execução por submissão', () => {
  const triggerDeMovimentacao = {
    id: 'trigger',
    type: 'trigger_solicitation_moved',
    position: { x: 0, y: 0 },
    data: {},
  };

  function montar() {
    type Linha = { id: string; flowId: string; submissionId: string | null; eventName: string };
    const linhas: Linha[] = [];
    const executionsRepo = {
      create: jest.fn((data: object) => data),
      // Reproduz o índice único parcial do banco (migration FlowExecutionSubmitOnlyUniqueness):
      // (flow_id, submission_id) quando submission_id não é nulo e o evento é responses.submitted
      // — e a violação 23505 que o TypeORM devolve nesse caso.
      save: jest.fn((data: Omit<Linha, 'id'>) => {
        const coberta = (l: Omit<Linha, 'id'>) =>
          l.submissionId !== null && l.eventName === 'responses.submitted';
        const duplicada =
          coberta(data) &&
          linhas.some(
            (l) => coberta(l) && l.flowId === data.flowId && l.submissionId === data.submissionId,
          );
        if (duplicada) {
          return Promise.reject(
            new QueryFailedError(
              'INSERT INTO "flow_executions"',
              [],
              Object.assign(new Error('duplicate key value violates unique constraint'), {
                code: '23505',
                constraint: 'UQ_flow_executions_flow_submission',
              }),
            ),
          );
        }
        const linha = { ...data, id: `execution-${linhas.length + 1}` };
        linhas.push(linha);
        return Promise.resolve(linha);
      }),
      findOne: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          linhas.find((l) =>
            Object.entries(where).every(([chave, valor]) => (l as Record<string, unknown>)[chave] === valor),
          ) ?? null,
        ),
      ),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const engine = { execute: jest.fn().mockResolvedValue([]) };
    const flowsRepo = { findOne: jest.fn() };
    const solicitationsRepo = { findOne: jest.fn() };
    const service = novoServico({
      flowsRepo,
      executionsRepo,
      solicitationsRepo,
      engine,
      metricsService: { recordFlowExecution: jest.fn() },
    });
    return { service, engine, flowsRepo, solicitationsRepo };
  }

  function fluxo(): FlowEntity {
    return {
      id: 'flow-id',
      isActive: true,
      nodes: [triggerDeMovimentacao],
      edges: [],
      consecutiveFailureCount: 0,
    } as unknown as FlowEntity;
  }

  it.each([
    'solicitations.moved',
    'solicitations.created',
    'approvals.approved',
    'solicitations.phase_fields_saved',
    'attachments.uploaded',
    'solicitations.sla.warning',
  ])(
    '[P-01] %s: duas ocorrências do evento para a mesma submissão executam o fluxo duas vezes',
    async (eventName) => {
      const { service, engine } = montar();
      // Os listeners e buildContextFromJob anexam ao contexto a submissão da solicitação de origem.
      const submission = { id: 'submission-1' } as never;

      await service.executeFlowWithContext(fluxo(), { eventName, submission, metadata: { ocorrencia: 1 } });
      await service.executeFlowWithContext(fluxo(), { eventName, submission, metadata: { ocorrencia: 2 } });

      expect(engine.execute).toHaveBeenCalledTimes(2);
    },
  );

  it('[P-01] cadeia completa: dois solicitations.moved da mesma solicitação executam o fluxo duas vezes', async () => {
    const { service, engine, flowsRepo, solicitationsRepo } = montar();
    flowsRepo.findOne.mockResolvedValue(fluxo());
    solicitationsRepo.findOne.mockResolvedValue({
      id: 'solicitation-id',
      formId: 'form-id',
      form: null,
      submission: { id: 'submission-1', items: [] },
    });
    const job = (toStatus: string) => ({
      kind: 'flow_context' as const,
      flowId: 'flow-id',
      triggerType: 'trigger_solicitation_moved' as const,
      eventName: 'solicitations.moved',
      solicitationId: 'solicitation-id',
      metadata: { toStatus },
      emittedAt: new Date().toISOString(),
    });

    await service.executeContextJob(job('in_progress'));
    await service.executeContextJob(job('completed'));

    expect(engine.execute).toHaveBeenCalledTimes(2);
  });

  it('o mesmo responses.submitted entregue duas vezes executa o fluxo uma única vez (idempotência pretendida)', async () => {
    const { service, engine } = montar();
    const submission = { id: 'submission-1' } as never;

    await service.executeFlowWithContext(fluxo(), { eventName: 'responses.submitted', submission });
    await service.executeFlowWithContext(fluxo(), { eventName: 'responses.submitted', submission });

    expect(engine.execute).toHaveBeenCalledTimes(1);
  });

  it('sem submissão no contexto (solicitação criada por fluxo ou webhook), cada ocorrência executa', async () => {
    const { service, engine } = montar();

    await service.executeFlowWithContext(fluxo(), { eventName: 'solicitations.moved' });
    await service.executeFlowWithContext(fluxo(), { eventName: 'solicitations.moved' });

    expect(engine.execute).toHaveBeenCalledTimes(2);
  });
});

describe('FlowsService — retomada concorrente de execução pausada', () => {
  // A correção precisa fechar a porta com um UPDATE condicional pelo repositório
  // (UPDATE ... WHERE id = ? AND status = 'waiting_*') e olhar `affected`: o banco em memória
  // abaixo tem essa semântica e é o único jeito de uma segunda retomada perder a corrida.
  function montar(status: 'waiting_approval' | 'waiting_phase_fields') {
    const linha: Record<string, unknown> = {
      id: 'execution-id',
      flowId: 'flow-id',
      solicitationId: 'solicitation-id',
      status,
      pausedNodeId: 'paused',
      approvalId: 'approval-1',
      waitingPhaseId: 'phase-1',
      nodeResults: [],
    };
    const executionsRepo = {
      findOne: jest.fn(() => Promise.resolve({ ...linha })),
      update: jest.fn((criterio: string | Record<string, unknown>, patch: Record<string, unknown>) => {
        const where = typeof criterio === 'string' ? { id: criterio } : criterio;
        const casa = Object.entries(where).every(([chave, valor]) => linha[chave] === valor);
        if (casa) Object.assign(linha, patch);
        return Promise.resolve({ affected: casa ? 1 : 0 });
      }),
    };
    const flowsRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'flow-id',
        isActive: true,
        nodes: [],
        edges: [],
        consecutiveFailureCount: 0,
      }),
    };
    const origem = { id: 'solicitation-id', formId: null, form: null, submission: null };
    const approvalsRepo = { findOne: jest.fn().mockResolvedValue({ id: 'approval-1', solicitation: origem }) };
    const solicitationsRepo = { findOne: jest.fn().mockResolvedValue(origem) };
    const engine = {
      resumeFrom: jest.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return [{ nodeId: 'depois-da-pausa', status: 'success', durationMs: 1 }];
      }),
    };
    const service = novoServico({
      flowsRepo,
      executionsRepo,
      approvalsRepo,
      solicitationsRepo,
      engine,
      metricsService: { recordFlowExecution: jest.fn() },
    });
    return { service, engine, linha };
  }

  it('uma única retomada executa o ramo pós-pausa e conclui a execução', async () => {
    const { service, engine, linha } = montar('waiting_approval');

    await service.resumePausedExecution('execution-id', 'approval-1');

    expect(engine.resumeFrom).toHaveBeenCalledTimes(1);
    expect(linha.status).toBe('success');
  });

  it('[P-05] duas retomadas simultâneas da mesma aprovação executam o ramo pós-pausa uma única vez', async () => {
    const { service, engine } = montar('waiting_approval');

    await Promise.all([
      service.resumePausedExecution('execution-id', 'approval-1'),
      service.resumePausedExecution('execution-id', 'approval-1'),
    ]);

    expect(engine.resumeFrom).toHaveBeenCalledTimes(1);
  });

  it('[P-05] duas retomadas simultâneas da mesma fase executam o ramo pós-pausa uma única vez', async () => {
    const { service, engine } = montar('waiting_phase_fields');

    await Promise.all([
      service.resumePausedPhaseFieldsExecution('execution-id', { phaseId: 'phase-1' }),
      service.resumePausedPhaseFieldsExecution('execution-id', { phaseId: 'phase-1' }),
    ]);

    expect(engine.resumeFrom).toHaveBeenCalledTimes(1);
  });
});

describe.skip('REMOVED cycle-02 FlowsService — pai esperando sub-fluxo sync', () => {
  // Banco em memória com UPDATE condicional (affected), como o usado na retomada concorrente.
  function montar(opcoes: { filhoFalha?: boolean; paiEsperaOutroFilho?: boolean } = {}) {
    const origem = { id: 'solicitation-id', formId: null, form: null, submission: null };
    const linhas: Record<string, Record<string, unknown>> = {
      'parent-exec': {
        id: 'parent-exec',
        flowId: 'parent-flow',
        solicitationId: 'solicitation-id',
        status: 'waiting_subflow',
        pausedNodeId: 'run',
        parentExecutionId: null,
        nodeResults: [
          {
            nodeId: 'run',
            status: 'success',
            durationMs: 1,
            output: {
              paused: true,
              waitingSubflowExecutionId: opcoes.paiEsperaOutroFilho ? 'outro-filho' : 'child-exec',
            },
          },
        ],
      },
      'child-exec': {
        id: 'child-exec',
        flowId: 'child-flow',
        solicitationId: 'solicitation-id',
        status: 'waiting_approval',
        pausedNodeId: 'child-approval-node',
        approvalId: 'approval-1',
        parentExecutionId: 'parent-exec',
        nodeResults: [],
      },
    };
    const executionsRepo = {
      findOne: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(linhas[where.id] ? { ...linhas[where.id] } : null),
      ),
      update: jest.fn((criterio: string | Record<string, unknown>, patch: Record<string, unknown>) => {
        const where = typeof criterio === 'string' ? { id: criterio } : criterio;
        const linha = linhas[where.id as string];
        const casa = !!linha && Object.entries(where).every(([chave, valor]) => linha[chave] === valor);
        if (casa) Object.assign(linha, patch);
        return Promise.resolve({ affected: casa ? 1 : 0 });
      }),
    };
    const fluxo = (id: string) => ({
      id,
      isActive: true,
      nodes: [{ id: 't', type: 'trigger_solicitation_created', position: { x: 0, y: 0 }, data: {} }],
      edges: [],
      consecutiveFailureCount: 0,
    });
    const flowsRepo = {
      findOne: jest.fn(({ where }: { where: { id: string } }) => Promise.resolve(fluxo(where.id))),
    };
    const engine = {
      resumeFrom: jest.fn((flow: { id: string }) =>
        Promise.resolve(
          flow.id === 'child-flow'
            ? [
                opcoes.filhoFalha
                  ? { nodeId: 'child-after', status: 'failed', error: 'boom', durationMs: 1 }
                  : { nodeId: 'child-after', status: 'success', durationMs: 1 },
              ]
            : [{ nodeId: 'parent-after', status: 'success', durationMs: 1 }],
        ),
      ),
    };
    const service = novoServico({
      flowsRepo,
      executionsRepo,
      approvalsRepo: { findOne: jest.fn().mockResolvedValue({ id: 'approval-1', solicitation: origem }) },
      solicitationsRepo: { findOne: jest.fn().mockResolvedValue(origem) },
      engine,
      metricsService: { recordFlowExecution: jest.fn() },
    });
    return { service, engine, linhas };
  }

  it('quando o filho termina, o pai sai de waiting_subflow e segue do nó do sub-fluxo', async () => {
    const { service, engine, linhas } = montar();

    await service.resumePausedExecution('child-exec', 'approval-1');

    expect(linhas['child-exec'].status).toBe('success');
    expect(engine.resumeFrom).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'parent-flow' }),
      'run',
      expect.objectContaining({ eventName: 'subflow.completed', flowExecutionId: 'parent-exec' }),
    );
    expect(linhas['parent-exec'].status).toBe('success');
    expect(linhas['parent-exec'].nodeResults).toEqual(
      expect.arrayContaining([expect.objectContaining({ nodeId: 'parent-after' })]),
    );
  });

  it('filho que termina com falha encerra o pai com o nó do sub-fluxo falho, sem seguir', async () => {
    const { service, engine, linhas } = montar({ filhoFalha: true });

    await service.resumePausedExecution('child-exec', 'approval-1');

    expect(linhas['child-exec'].status).toBe('partial_failure');
    expect(engine.resumeFrom).toHaveBeenCalledTimes(1);
    expect(linhas['parent-exec']).toMatchObject({
      status: 'partial_failure',
      errorMessage: 'Sub-fluxo falhou com status: partial_failure',
    });
    expect(linhas['parent-exec'].nodeResults).toEqual(
      expect.arrayContaining([expect.objectContaining({ nodeId: 'run', status: 'failed' })]),
    );
  });

  it('um filho que o pai não está esperando (ex.: async) termina sem mexer no pai', async () => {
    const { service, engine, linhas } = montar({ paiEsperaOutroFilho: true });

    await service.resumePausedExecution('child-exec', 'approval-1');

    expect(engine.resumeFrom).toHaveBeenCalledTimes(1);
    expect(linhas['parent-exec'].status).toBe('waiting_subflow');
  });

  it('executeFlowWithContext grava waiting_subflow quando o motor para num sub-fluxo sync', async () => {
    const executionsRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((data: object) => data),
      save: jest.fn().mockResolvedValue({ id: 'execution-id' }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const engine = {
      execute: jest.fn().mockResolvedValue([
        {
          nodeId: 'run',
          status: 'success',
          durationMs: 1,
          output: { paused: true, waitingSubflowExecutionId: 'child-exec' },
        },
      ]),
    };
    const metricsService = { recordFlowExecution: jest.fn() };
    const service = novoServico({ executionsRepo, engine, metricsService });

    await service.executeFlowWithContext(
      { id: 'flow-id', isActive: true, nodes: [], edges: [], consecutiveFailureCount: 0 } as never,
      { eventName: 'solicitations.created' },
    );

    expect(executionsRepo.update).toHaveBeenCalledWith(
      'execution-id',
      expect.objectContaining({ status: 'waiting_subflow', pausedNodeId: 'run' }),
    );
    expect(metricsService.recordFlowExecution).not.toHaveBeenCalled();
  });
});

describe('FlowsService — validação do grafo ao salvar (create e update)', () => {
  const no = (id: string, type: string, data: Record<string, unknown> = {}) => ({
    id,
    type,
    position: { x: 0, y: 0 },
    data,
  });
  const aresta = (id: string, source: string, target: string, sourceHandle?: string) => ({
    id,
    source,
    target,
    ...(sourceHandle ? { sourceHandle } : {}),
  });
  const gatilho = no('t', 'trigger_webhook_received');

  function montar() {
    const consulta = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getExists: jest.fn().mockResolvedValue(false),
    };
    const flowsRepo = {
      createQueryBuilder: jest.fn(() => consulta),
      create: jest.fn((data: object) => data),
      save: jest.fn((data: object) => Promise.resolve(data)),
      findOne: jest.fn(),
    };
    const service = novoServico({ flowsRepo, permissionsService: makeAccess() });
    return { service, flowsRepo };
  }

  function fluxoSalvo() {
    return {
      id: 'flow-id',
      createdBy: 'user-1',
      formId: null,
      form: null,
      isActive: true,
      nodes: [gatilho, no('A', 'condition_always_true')],
      edges: [aresta('1', 't', 'A')],
      consecutiveFailureCount: 0,
    };
  }

  type Grafo = [descricao: string, nodes: ReturnType<typeof no>[], edges: ReturnType<typeof aresta>[]];

  const invalidos: Grafo[] = [
    [
      'ciclo A → B → A',
      [gatilho, no('A', 'condition_always_true'), no('B', 'condition_always_true')],
      [aresta('1', 't', 'A'), aresta('2', 'A', 'B', 'yes'), aresta('3', 'B', 'A', 'yes')],
    ],
    [
      'ids de nó duplicados',
      [gatilho, no('A', 'condition_always_true'), no('A', 'condition_always_true')],
      [aresta('1', 't', 'A')],
    ],
    [
      'e-mail sem destinatário',
      [gatilho, no('m', 'action_send_email', { subject: 'Assunto', body: 'Corpo' })],
      [aresta('1', 't', 'm')],
    ],
    [
      'webhook sem URL',
      [gatilho, no('w', 'action_webhook', { method: 'POST' })],
      [aresta('1', 't', 'w')],
    ],
    [
      'notificação sem usuários',
      [gatilho, no('n', 'action_notify_users', { message: 'Aviso' })],
      [aresta('1', 't', 'n')],
    ],
    [
      'condição de campo sem campo e operador',
      [gatilho, no('c', 'condition_field_value', {})],
      [aresta('1', 't', 'c')],
    ],
    ['nenhum gatilho', [no('A', 'condition_always_true')], []],
    [
      'dois gatilhos agendados (o fluxo guarda uma próxima execução só)',
      [
        no('s1', 'trigger_scheduled', { mode: 'interval', intervalValue: 1, intervalUnit: 'hours' }),
        no('s2', 'trigger_scheduled', { mode: 'interval', intervalValue: 2, intervalUnit: 'hours' }),
        no('A', 'condition_always_true'),
      ],
      [aresta('1', 's1', 'A'), aresta('2', 's2', 'A')],
    ],
    [
      'conexão chegando num gatilho',
      [gatilho, no('t2', 'trigger_webhook_received'), no('A', 'condition_always_true')],
      [aresta('1', 't', 'A'), aresta('2', 'A', 't2', 'yes')],
    ],
    [
      'origem desconhecida no gatilho de solicitação criada',
      [no('t', 'trigger_solicitation_created', { originTypes: ['erp'] }), no('A', 'condition_always_true')],
      [aresta('1', 't', 'A')],
    ],
    [
      'resposta do formulário sem código de campo',
      [
        gatilho,
        no('c', 'action_create_solicitation_from_payload', {
          titleTemplate: 'Pedido {{item}}',
          fieldValues: [{ fieldCode: '', value: '{{item}}' }],
        }),
      ],
      [aresta('1', 't', 'c')],
    ],
  ];

  const validos: Grafo[] = [
    [
      'e-mail com toEmail',
      [gatilho, no('m', 'action_send_email', { toEmail: 'a@b.com', subject: 'x', body: 'y' })],
      [aresta('1', 't', 'm')],
    ],
    [
      'e-mail com lista `to` (uso por API)',
      [gatilho, no('m', 'action_send_email', { to: ['a@b.com'], subject: 'x', body: 'y' })],
      [aresta('1', 't', 'm')],
    ],
    [
      'webhook com webhookUrl (editor)',
      [gatilho, no('w', 'action_webhook', { webhookUrl: 'https://x.com/h', method: 'POST' })],
      [aresta('1', 't', 'w')],
    ],
    [
      'webhook com url (uso por API)',
      [gatilho, no('w', 'action_webhook', { url: 'https://x.com/h', method: 'POST' })],
      [aresta('1', 't', 'w')],
    ],
    [
      'notificação com usuários',
      [gatilho, no('n', 'action_notify_users', { userIds: ['u1'], message: 'Aviso' })],
      [aresta('1', 't', 'n')],
    ],
    [
      'condição de campo completa',
      [gatilho, no('c', 'condition_field_value', { fieldCode: 'valor', operator: 'greater_than', value: '10' })],
      [aresta('1', 't', 'c')],
    ],
    [
      'ramificação sim/não sem ciclo',
      [gatilho, no('c', 'condition_always_true'), no('y', 'condition_always_true'), no('n', 'condition_always_true')],
      [aresta('1', 't', 'c'), aresta('2', 'c', 'y', 'yes'), aresta('3', 'c', 'n', 'no')],
    ],
    [
      'duas entradas: a segunda entra no meio do fluxo',
      [
        gatilho,
        no('lote', 'trigger_webhook_received', { endpointId: 'ep-1', splitItemsPath: 'pedidos' }),
        no('A', 'condition_always_true'),
        no('B', 'condition_always_true'),
      ],
      [aresta('1', 't', 'A'), aresta('2', 'A', 'B', 'yes'), aresta('3', 'lote', 'B')],
    ],
  ];

  it.each(invalidos)('[P-07] create rejeita: %s', async (_descricao, nodes, edges) => {
    const { service, flowsRepo } = montar();

    await expect(
      service.create({ name: 'Fluxo', nodes, edges } as never, 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(flowsRepo.save).not.toHaveBeenCalled();
  });

  it.each(validos)('create continua aceitando: %s', async (_descricao, nodes, edges) => {
    const { service, flowsRepo } = montar();

    await expect(service.create({ name: 'Fluxo', nodes, edges } as never, 'user-1')).resolves.toBeDefined();
    expect(flowsRepo.save).toHaveBeenCalledTimes(1);
  });

  it('[P-07] update só com edges para nós inexistentes é rejeitado e não grava', async () => {
    const { service, flowsRepo } = montar();
    flowsRepo.findOne.mockResolvedValue(fluxoSalvo());

    await expect(
      service.update(
        'flow-id',
        { edges: [aresta('x', 'fantasma', 'inexistente')] } as never,
        'user-1',
        'admin',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(flowsRepo.save).not.toHaveBeenCalled();
  });

  it('[P-07] update com nós que formam um ciclo é rejeitado e não grava', async () => {
    const { service, flowsRepo } = montar();
    flowsRepo.findOne.mockResolvedValue(fluxoSalvo());

    await expect(
      service.update(
        'flow-id',
        {
          nodes: [gatilho, no('A', 'condition_always_true'), no('B', 'condition_always_true')],
          edges: [aresta('1', 't', 'A'), aresta('2', 'A', 'B', 'yes'), aresta('3', 'B', 'A', 'yes')],
        } as never,
        'user-1',
        'admin',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(flowsRepo.save).not.toHaveBeenCalled();
  });

  it('update que remove um nó ainda ligado por aresta salva é rejeitado', async () => {
    const { service, flowsRepo } = montar();
    flowsRepo.findOne.mockResolvedValue(fluxoSalvo());

    await expect(
      service.update('flow-id', { nodes: [gatilho] } as never, 'user-1', 'admin'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(flowsRepo.save).not.toHaveBeenCalled();
  });

  describe.skip('REMOVED cycle-02 processos que o fluxo referencia', () => {
    const negar = (): jest.Mock =>
      jest.fn().mockRejectedValue(new ForbiddenException('Acesso negado.'));

    it('create confere cada formulário referenciado nos nós e não grava se algum é negado', async () => {
      const { service, flowsRepo } = montar();
      const authorize = negar();
      const nodes = [
        no('t', 'trigger_form_submit', { formId: 'form-a' }),
        no('t2', 'trigger_attachment_uploaded', { formId: 'form-b' }),
        no('A', 'condition_always_true'),
      ];

      await expect(
        service.create(
          { name: 'Fluxo', nodes, edges: [aresta('1', 't', 'A'), aresta('2', 't2', 'A')] } as never,
          'user-1',
          undefined,
          authorize,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(authorize).toHaveBeenCalledWith(['form-a', 'form-b']);
      expect(flowsRepo.save).not.toHaveBeenCalled();
    });

    it('update confere só os formulários que a edição acrescenta', async () => {
      const { service, flowsRepo } = montar();
      flowsRepo.findOne.mockResolvedValue({
        ...fluxoSalvo(),
        nodes: [no('t', 'trigger_form_submit', { formId: 'form-a' }), no('A', 'condition_always_true')],
      });
      const authorize = jest.fn().mockResolvedValue(undefined);

      await service.update(
        'flow-id',
        {
          nodes: [
            no('t', 'trigger_form_submit', { formId: 'form-a' }),
            no('t2', 'trigger_attachment_uploaded', { formId: 'form-c' }),
            no('A', 'condition_always_true'),
          ],
          edges: [aresta('1', 't', 'A'), aresta('2', 't2', 'A')],
        } as never,
        'user-1',
        'admin',
        authorize,
      );

      expect(authorize).toHaveBeenCalledWith(['form-c']);
      expect(flowsRepo.save).toHaveBeenCalledTimes(1);
    });

    it('update que não acrescenta formulário não pergunta nada (fluxo antigo continua editável)', async () => {
      const { service, flowsRepo } = montar();
      flowsRepo.findOne.mockResolvedValue({
        ...fluxoSalvo(),
        nodes: [no('t', 'trigger_form_submit', { formId: 'form-a' }), no('A', 'condition_always_true')],
      });
      const authorize = negar();

      await service.update('flow-id', { name: 'Novo nome' } as never, 'user-1', 'admin', authorize);

      expect(authorize).not.toHaveBeenCalled();
      expect(flowsRepo.save).toHaveBeenCalledTimes(1);
    });
  });
});

describe('FlowsService.runTest', () => {
  it('marca o contexto como execução de teste (metadata.testRun) para o motor', async () => {
    const flowsRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'flow-id',
        createdBy: 'user-1',
        formId: null,
        form: null,
        nodes: [],
        edges: [],
      }),
    };
    const engine = { execute: jest.fn().mockResolvedValue([]) };
    const service = novoServico({ flowsRepo, engine, permissionsService: makeAccess() });

    await service.runTest('flow-id', 'user-1', { fieldValues: { valor: 10 } }, 'admin');

    expect(engine.execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventName: 'flows.test_run',
        actorId: 'user-1',
        metadata: { testRun: true },
      }),
    );
  });

  it('usa o formulário do nó gatilho (o editor não grava flow.formId) e informa o fluxo ao motor', async () => {
    const flowsRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'flow-id',
        createdBy: 'user-1',
        formId: null,
        form: null,
        nodes: [
          { id: 'gatilho', type: 'trigger_attachment_uploaded', position: { x: 0, y: 0 }, data: { formId: 'form-2' } },
        ],
        edges: [],
      }),
    };
    const formsRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'form-2', name: 'Datar Embalagens de Frango' }),
    };
    const engine = { execute: jest.fn().mockResolvedValue([]) };
    const service = novoServico({ flowsRepo, formsRepo, engine, permissionsService: makeAccess() });

    await service.runTest('flow-id', 'user-1', { fieldValues: { lote: 'L1' } }, 'admin');

    expect(formsRepo.findOne).toHaveBeenCalledWith({ where: { id: 'form-2' } });
    expect(engine.execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        flowId: 'flow-id',
        form: expect.objectContaining({ name: 'Datar Embalagens de Frango' }),
        fields: { lote: 'L1' },
      }),
    );
  });
});
