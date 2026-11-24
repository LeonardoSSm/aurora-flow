import type { EntityManager } from 'typeorm';
import { SolicitationStatus } from '../../common/enums/solicitation-status.enum';
import { KanbanPhaseEntity, KanbanPhaseFieldEntity } from '../../database/entities';
import {
  copyKanbanPhases,
  createDefaultKanbanPhases,
  defaultStageForStatus,
} from './default-kanban-phases';

function makeRepository() {
  let seq = 0;
  return {
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation((data: object) => ({ ...data })),
    save: jest.fn().mockImplementation((data: object | object[]) =>
      Promise.resolve(
        Array.isArray(data)
          ? data.map((item) => ({ ...item, id: `new-${++seq}` }))
          : { ...data, id: `new-${++seq}` },
      ),
    ),
  };
}

function makeManager() {
  const phaseRepo = makeRepository();
  const fieldRepo = makeRepository();
  const manager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === KanbanPhaseEntity) return phaseRepo;
      if (entity === KanbanPhaseFieldEntity) return fieldRepo;
      throw new Error('Unexpected repository');
    }),
  } as unknown as EntityManager;
  return { manager, phaseRepo, fieldRepo };
}

describe('createDefaultKanbanPhases', () => {
  it('cria Novo, Pendente e Concluido (fase final), sem perfil nem aprovacao', async () => {
    const { manager, phaseRepo } = makeManager();

    await createDefaultKanbanPhases(manager, 'form-1');

    expect(phaseRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({ formId: 'form-1', key: 'novo', label: 'Novo', color: 'blue', order: 0, isTerminal: false }),
      expect.objectContaining({ formId: 'form-1', key: 'pendente', label: 'Pendente', color: 'amber', order: 1, isTerminal: false }),
      expect.objectContaining({ formId: 'form-1', key: 'concluido', label: 'Concluído', color: 'green', order: 2, isTerminal: true }),
    ]);
    const saved = phaseRepo.save.mock.calls[0][0] as KanbanPhaseEntity[];
    for (const phase of saved) {
      expect(phase).toMatchObject({
        description: null,
        actorRoleCode: null,
        requiresApproval: false,
        approverRoleCode: null,
      });
    }
  });
});

describe('copyKanbanPhases', () => {
  it('copia as fases do formulario original com os campos de cada fase', async () => {
    const { manager, phaseRepo, fieldRepo } = makeManager();
    phaseRepo.find.mockResolvedValue([
      {
        id: 'phase-a',
        formId: 'form-src',
        key: 'triagem',
        label: 'Triagem',
        color: 'purple',
        description: 'Primeira olhada',
        order: 0,
        isTerminal: false,
        actorRoleCode: 'analista',
        requiresApproval: true,
        approverRoleCode: 'gerente',
        fields: [
          {
            id: 'field-a',
            phaseId: 'phase-a',
            code: 'parecer',
            label: 'Parecer',
            fieldType: 'long_text',
            required: true,
            order: 0,
            settingsJson: { placeholder: 'x' },
            optionsJson: null,
          },
        ],
      },
      {
        id: 'phase-b',
        formId: 'form-src',
        key: 'fim',
        label: 'Fim',
        color: 'green',
        description: null,
        order: 1,
        isTerminal: true,
        actorRoleCode: null,
        requiresApproval: false,
        approverRoleCode: null,
        fields: [],
      },
    ]);

    const copies = await copyKanbanPhases(manager, 'form-src', 'form-copy');

    expect(phaseRepo.create).toHaveBeenCalledWith({
      formId: 'form-copy',
      key: 'triagem',
      label: 'Triagem',
      color: 'purple',
      description: 'Primeira olhada',
      order: 0,
      isTerminal: false,
      actorRoleCode: 'analista',
      requiresApproval: true,
      approverRoleCode: 'gerente',
    });
    expect(copies.map((phase) => phase.formId)).toEqual(['form-copy', 'form-copy']);
    // O campo vai para a fase copiada (novo id), nunca para a fase do original.
    expect(fieldRepo.save).toHaveBeenCalledTimes(1);
    expect(fieldRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({ phaseId: copies[0].id, code: 'parecer', required: true }),
    ]);
    expect(copies[0].id).not.toBe('phase-a');
  });

  it('original sem fases: a copia nasce com as fases padrao', async () => {
    const { manager, phaseRepo } = makeManager();
    phaseRepo.find.mockResolvedValue([]);

    const copies = await copyKanbanPhases(manager, 'form-src', 'form-copy');

    expect(copies.map((phase) => phase.key)).toEqual(['novo', 'pendente', 'concluido']);
  });
});

describe('defaultStageForStatus', () => {
  it.each([
    [SolicitationStatus.NEW, 'novo'],
    [SolicitationStatus.OPEN, 'novo'],
    [SolicitationStatus.IN_ANALYSIS, 'novo'],
    [SolicitationStatus.WAITING_APPROVAL, 'pendente'],
    [SolicitationStatus.APPROVED, 'pendente'],
    [SolicitationStatus.IN_PROGRESS, 'pendente'],
    [SolicitationStatus.WAITING_INTEGRATION, 'pendente'],
    [SolicitationStatus.WAITING, 'pendente'],
    [SolicitationStatus.COMPLETED, 'concluido'],
    [SolicitationStatus.REJECTED, 'concluido'],
    [SolicitationStatus.CANCELLED, 'concluido'],
    [SolicitationStatus.RESOLVED, 'concluido'],
    [SolicitationStatus.CANCELED, 'concluido'],
  ])('%s -> %s', (status, stage) => {
    expect(defaultStageForStatus(status)).toBe(stage);
  });
});
