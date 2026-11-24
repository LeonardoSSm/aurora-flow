import { BadRequestException } from '@nestjs/common';
import { KanbanPhaseEntity, KanbanPhaseFieldEntity } from '../../database/entities';
import type { SaveKanbanPhasesDto } from './dto/save-kanban-phases.dto';
import { KanbanPhasesService } from './kanban-phases.service';

function makeService() {
  const phaseRepo = {
    find: jest.fn().mockResolvedValue([]),
    delete: jest.fn(),
    save: jest
      .fn()
      .mockImplementation(async (phase: { id?: string }) => ({ ...phase, id: phase.id ?? 'phase-new' })),
    update: jest.fn(),
  };
  const fieldRepo = { delete: jest.fn(), save: jest.fn().mockImplementation(async (field: object) => field) };
  const manager = {
    getRepository: jest.fn((entity: unknown) => (entity === KanbanPhaseEntity ? phaseRepo : entity === KanbanPhaseFieldEntity ? fieldRepo : null)),
  };
  const dataSource = { transaction: jest.fn((cb: (m: typeof manager) => unknown) => cb(manager)) };
  const phasesRepository = { find: jest.fn().mockResolvedValue([]) };
  const formsRepository = {
    findOne: jest.fn().mockResolvedValue({ id: 'form-id', kanbanSettings: null }),
    update: jest.fn(),
  };
  const service = new KanbanPhasesService(
    dataSource as never,
    phasesRepository as never,
    formsRepository as never,
    { syncPhaseFieldInput: jest.fn().mockResolvedValue(null) } as never,
    { assertPhaseFieldsReady: jest.fn() } as never,
  );
  return { service, phaseRepo, fieldRepo, formsRepository };
}

const phase = (overrides: Record<string, unknown>) =>
  ({ phases: [{ key: 'fin', label: 'Financeiro', order: 0, fields: [], ...overrides }] }) as unknown as SaveKanbanPhasesDto;

describe('KanbanPhasesService.save — quem atua e quem aprova', () => {
  it('grava perfis e usuários e mantém o primeiro perfil nas colunas antigas (app móvel)', async () => {
    const { service, phaseRepo } = makeService();
    await service.save(
      'form-id',
      phase({
        actors: { roleCodes: ['financeiro', 'financeiro', 'diretoria'], userIds: ['u1'] },
        requiresApproval: true,
        approvers: { roleCodes: [], userIds: ['u-diretor'] },
      }),
    );
    expect(phaseRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        actors: { roleCodes: ['financeiro', 'diretoria'], userIds: ['u1'] },
        actorRoleCode: 'financeiro',
        approvers: { roleCodes: [], userIds: ['u-diretor'] },
        approverRoleCode: null,
      }),
    );
  });

  it('cliente antigo (só actorRoleCode/approverRoleCode) continua funcionando', async () => {
    const { service, phaseRepo } = makeService();
    await service.save('form-id', phase({ actorRoleCode: 'operador', requiresApproval: true, approverRoleCode: 'supervisor' }));
    expect(phaseRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        actors: { roleCodes: ['operador'], userIds: [] },
        approvers: { roleCodes: ['supervisor'], userIds: [] },
      }),
    );
  });

  it('exigir aprovação sem ninguém para aprovar é recusado; sem exigir, aprovadores são descartados', async () => {
    const { service, phaseRepo } = makeService();
    await expect(
      service.save('form-id', phase({ requiresApproval: true, approvers: { roleCodes: [], userIds: [] } })),
    ).rejects.toBeInstanceOf(BadRequestException);

    await service.save('form-id', phase({ requiresApproval: false, approvers: { roleCodes: ['x'], userIds: [] } }));
    expect(phaseRepo.save).toHaveBeenLastCalledWith(expect.objectContaining({ approvers: null, approverRoleCode: null }));
  });
});

describe('KanbanPhasesService — cálculo de fase e "Valor do card"', () => {
  const calc = (settingsJson: Record<string, unknown>) =>
    phase({ fields: [{ code: 'total', label: 'Total', fieldType: 'calculated', order: 0, settingsJson }] });

  it('cálculo de fase grava a fórmula conferida e o formato fixo em R$', async () => {
    const { service, fieldRepo } = makeService();
    await service.save('form-id', calc({ formula: '{a} + {b}', formulaDecimals: 0 }));
    expect(fieldRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        settingsJson: { formula: '{a} + {b}', formulaDecimals: 2, formulaPrefix: 'R$ ' },
      }),
    );
  });

  it('cálculo sem fórmula ou com erro é recusado com o nome da fase', async () => {
    const { service } = makeService();
    await expect(service.save('form-id', calc({ formula: '' }))).rejects.toThrow(
      'Fase "Financeiro": O cálculo "Total" está sem fórmula.',
    );
    await expect(service.save('form-id', calc({ formula: '{a} +' }))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('"Valor do card": grava e devolve o código; null tira', async () => {
    const { service, formsRepository } = makeService();
    await expect(service.saveSettings('form-id', { cardValueField: 'valor_total' })).resolves.toEqual({
      cardValueField: 'valor_total',
    });
    expect(formsRepository.update).toHaveBeenCalledWith('form-id', { kanbanSettings: { cardValueField: 'valor_total' } });

    formsRepository.findOne.mockResolvedValue({ id: 'form-id', kanbanSettings: { cardValueField: 'valor_total' } });
    await expect(service.getSettings('form-id')).resolves.toEqual({ cardValueField: 'valor_total' });
    await expect(service.saveSettings('form-id', { cardValueField: null })).resolves.toEqual({ cardValueField: null });
  });
});

describe('KanbanPhasesService.save — prazo da fase', () => {
  it('grava horas, horas úteis e aviso; sem horas, as opções voltam ao padrão', async () => {
    const { service, phaseRepo } = makeService();
    await service.save('form-id', phase({ slaHours: 8, slaBusinessHours: true, slaWarningPercent: 60 }));
    expect(phaseRepo.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ slaHours: 8, slaBusinessHours: true, slaWarningPercent: 60 }),
    );

    await service.save('form-id', phase({ slaHours: null, slaBusinessHours: true, slaWarningPercent: 60 }));
    expect(phaseRepo.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ slaHours: null, slaBusinessHours: false, slaWarningPercent: null }),
    );
  });
});

describe('KanbanPhasesService.save — regra da aprovação', () => {
  it('grava a regra e a ordem de quem aprova; sem exigir aprovação volta para "qualquer um"', async () => {
    const { service, phaseRepo } = makeService();
    await service.save(
      'form-id',
      phase({
        requiresApproval: true,
        approvalMode: 'sequential',
        approvers: { roleCodes: ['gerente'], userIds: ['u-diretor'], order: ['role:gerente', 'user:u-diretor'] },
      }),
    );
    expect(phaseRepo.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        approvalMode: 'sequential',
        approvers: { roleCodes: ['gerente'], userIds: ['u-diretor'], order: ['role:gerente', 'user:u-diretor'] },
      }),
    );

    await service.save('form-id', phase({ requiresApproval: false, approvalMode: 'all' }));
    expect(phaseRepo.save).toHaveBeenLastCalledWith(expect.objectContaining({ approvalMode: 'any' }));
  });
});

describe('KanbanPhasesService.save — ramificação no formulário da fase', () => {
  const fields = [
    {
      code: 'tipo',
      label: 'Tipo',
      fieldType: 'single_select',
      order: 0,
      options: [
        { value: 'nacional', label: 'Nacional' },
        { value: 'importacao', label: 'Importação' },
      ],
    },
    { code: 'sec_importacao', label: 'Importação', fieldType: 'title', order: 1 },
    { code: 'incoterm', label: 'Incoterm', fieldType: 'short_text', order: 2 },
    { code: 'sec_fechamento', label: 'Fechamento', fieldType: 'title', order: 3 },
  ];
  const branchToImport = [
    {
      section: '__inicio__',
      next: 'sec_fechamento',
      branches: [{ fieldCode: 'tipo', optionValue: 'importacao', target: 'sec_importacao' }],
    },
  ];

  it('grava o caminho conferido contra os campos salvos', async () => {
    const { service, phaseRepo } = makeService();
    await service.save('form-id', phase({ fields, sectionFlow: branchToImport }));
    expect(phaseRepo.update).toHaveBeenCalledWith('phase-new', {
      sectionFlow: [
        {
          section: '__inicio__',
          next: 'sec_fechamento',
          branches: [
            { fieldCode: 'tipo', optionValue: 'importacao', checkboxValue: null, target: 'sec_importacao' },
          ],
        },
      ],
    });
  });

  it('referência que não existe recusa o salvamento com o nome da fase', async () => {
    const { service } = makeService();
    await expect(
      service.save(
        'form-id',
        phase({
          fields,
          sectionFlow: [{ section: '__inicio__', next: 'sumiu', branches: [] }],
        }),
      ),
    ).rejects.toThrow('Fase "Financeiro", formulário: O caminho padrão da seção de início leva a uma seção que não existe.');
  });

  it('cliente que não manda o caminho mantém o que estava, se ainda casar com os campos', async () => {
    const { service, phaseRepo } = makeService();
    phaseRepo.find.mockResolvedValue([
      { id: 'p1', fields: [], sectionFlow: [{ section: '__inicio__', next: null, branches: [] }] },
    ]);
    await service.save('form-id', phase({ id: 'p1', fields }));
    expect(phaseRepo.update).toHaveBeenLastCalledWith('p1', {
      sectionFlow: [{ section: '__inicio__', next: null, branches: [] }],
    });

    phaseRepo.find.mockResolvedValue([
      { id: 'p1', fields: [], sectionFlow: [{ section: 'apagada', next: null, branches: [] }] },
    ]);
    await service.save('form-id', phase({ id: 'p1', fields }));
    expect(phaseRepo.update).toHaveBeenLastCalledWith('p1', { sectionFlow: null });
  });
});

describe('KanbanPhasesService.save — só sair com os obrigatórios preenchidos', () => {
  it('grava a opção; cliente que não manda (app móvel, versão antiga) mantém o que estava', async () => {
    const { service, phaseRepo } = makeService();
    await service.save('form-id', phase({ requireFieldsToExit: true }));
    expect(phaseRepo.save).toHaveBeenLastCalledWith(expect.objectContaining({ requireFieldsToExit: true }));

    await service.save('form-id', phase({}));
    expect(phaseRepo.save).toHaveBeenLastCalledWith(expect.objectContaining({ requireFieldsToExit: false }));

    phaseRepo.find.mockResolvedValue([{ id: 'p-1', fields: [], requireFieldsToExit: true }]);
    await service.save('form-id', phase({ id: 'p-1' }));
    expect(phaseRepo.save).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'p-1', requireFieldsToExit: true }));

    await service.save('form-id', phase({ id: 'p-1', requireFieldsToExit: false }));
    expect(phaseRepo.save).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'p-1', requireFieldsToExit: false }));
  });
});

describe('KanbanPhasesService.save — só sair com responsável', () => {
  it('grava a opção; cliente que não manda mantém o que estava', async () => {
    const { service, phaseRepo } = makeService();
    await service.save('form-id', phase({ requireAssigneeToExit: true }));
    expect(phaseRepo.save).toHaveBeenLastCalledWith(expect.objectContaining({ requireAssigneeToExit: true }));

    phaseRepo.find.mockResolvedValue([{ id: 'p-1', fields: [], requireAssigneeToExit: true }]);
    await service.save('form-id', phase({ id: 'p-1' }));
    expect(phaseRepo.save).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'p-1', requireAssigneeToExit: true }));

    await service.save('form-id', phase({ id: 'p-1', requireAssigneeToExit: false }));
    expect(phaseRepo.save).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'p-1', requireAssigneeToExit: false }));
  });
});

describe('KanbanPhasesService — filtro de cards da fase', () => {
  const rule = { fieldCode: 'filial', values: ['SP'], roleCodes: ['comercial'], userIds: [] };

  function withPhase() {
    const ctx = makeService();
    const phasesRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'phase-1', formId: 'form-id', cardVisibility: null }),
      update: jest.fn(),
    };
    const service = new KanbanPhasesService(
      { transaction: jest.fn() } as never,
      phasesRepository as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { ...ctx, service, phasesRepository };
  }

  it('grava só a coluna do filtro, na fase daquele processo', async () => {
    const { service, phasesRepository } = withPhase();
    const saved = await service.saveCardVisibility('form-id', 'phase-1', { rules: [rule], othersSeeAll: false });
    expect(phasesRepository.findOne).toHaveBeenCalledWith({ where: { id: 'phase-1', formId: 'form-id' } });
    expect(phasesRepository.update).toHaveBeenCalledWith('phase-1', {
      cardVisibility: { rules: [rule], othersSeeAll: false },
    });
    expect(saved.cardVisibility).toEqual({ rules: [rule], othersSeeAll: false });
  });

  it('lista vazia desliga o filtro; regra sem valor ou sem pessoa é recusada', async () => {
    const { service, phasesRepository } = withPhase();
    await service.saveCardVisibility('form-id', 'phase-1', { rules: [], othersSeeAll: true });
    expect(phasesRepository.update).toHaveBeenCalledWith('phase-1', { cardVisibility: null });
    await expect(
      service.saveCardVisibility('form-id', 'phase-1', { rules: [{ ...rule, roleCodes: [] }], othersSeeAll: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('fase de outro processo não é encontrada', async () => {
    const { service, phasesRepository } = withPhase();
    phasesRepository.findOne.mockResolvedValue(null);
    await expect(
      service.saveCardVisibility('outro-form', 'phase-1', { rules: [rule], othersSeeAll: true }),
    ).rejects.toThrow('Fase não encontrada');
  });

  it('o "Salvar fases" do construtor não mexe no filtro', async () => {
    const { service, phaseRepo } = makeService();
    await service.save('form-id', phase({}));
    expect(phaseRepo.save.mock.calls[0][0]).not.toHaveProperty('cardVisibility');
  });
});
