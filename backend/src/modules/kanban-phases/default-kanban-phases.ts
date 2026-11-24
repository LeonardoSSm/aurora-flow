import type { EntityManager } from 'typeorm';
import { SolicitationStatus } from '../../common/enums/solicitation-status.enum';
import { KanbanPhaseEntity, KanbanPhaseFieldEntity } from '../../database/entities';

/**
 * Board padrão do Kanban. Todo formulário nasce com estas três fases (o board antigo por
 * status foi descontinuado); solicitações sem formulário usam as mesmas três colunas, só que
 * calculadas a partir do status (ver defaultStageForStatus).
 */
export const DEFAULT_KANBAN_PHASES = [
  { key: 'novo', label: 'Novo', color: 'blue', isTerminal: false },
  { key: 'pendente', label: 'Pendente', color: 'amber', isTerminal: false },
  { key: 'concluido', label: 'Concluído', color: 'green', isTerminal: true },
] as const;

export type DefaultKanbanStage = (typeof DEFAULT_KANBAN_PHASES)[number]['key'];

export const DEFAULT_KANBAN_STAGES: ReadonlyArray<DefaultKanbanStage> = DEFAULT_KANBAN_PHASES.map(
  (phase) => phase.key,
);

const NEW_STAGE_STATUSES: ReadonlyArray<SolicitationStatus> = [
  SolicitationStatus.NEW,
  SolicitationStatus.OPEN,
  SolicitationStatus.IN_ANALYSIS,
];

export const DONE_STAGE_STATUSES: ReadonlyArray<SolicitationStatus> = [
  SolicitationStatus.COMPLETED,
  SolicitationStatus.REJECTED,
  SolicitationStatus.CANCELLED,
  SolicitationStatus.RESOLVED,
  SolicitationStatus.CANCELED,
];

/** Coluna padrão (Novo/Pendente/Concluído) em que cai uma solicitação com este status. */
export function defaultStageForStatus(status: SolicitationStatus): DefaultKanbanStage {
  if (NEW_STAGE_STATUSES.includes(status)) return 'novo';
  if (DONE_STAGE_STATUSES.includes(status)) return 'concluido';
  return 'pendente';
}

/** Status gravado ao mover uma solicitação sem formulário para uma coluna padrão. */
export const STATUS_FOR_DEFAULT_STAGE: Record<DefaultKanbanStage, SolicitationStatus> = {
  novo: SolicitationStatus.NEW,
  pendente: SolicitationStatus.IN_PROGRESS,
  concluido: SolicitationStatus.COMPLETED,
};

export async function createDefaultKanbanPhases(
  manager: EntityManager,
  formId: string,
): Promise<KanbanPhaseEntity[]> {
  const repo = manager.getRepository(KanbanPhaseEntity);
  return repo.save(
    DEFAULT_KANBAN_PHASES.map((phase, index) =>
      repo.create({
        formId,
        key: phase.key,
        label: phase.label,
        color: phase.color,
        description: null,
        order: index,
        isTerminal: phase.isTerminal,
        actorRoleCode: null,
        requiresApproval: false,
        approverRoleCode: null,
      }),
    ),
  );
}

/** Copia as fases (e os campos de cada fase) de um formulário para outro — usado ao duplicar. */
export async function copyKanbanPhases(
  manager: EntityManager,
  sourceFormId: string,
  targetFormId: string,
): Promise<KanbanPhaseEntity[]> {
  const phaseRepo = manager.getRepository(KanbanPhaseEntity);
  const fieldRepo = manager.getRepository(KanbanPhaseFieldEntity);
  const sourcePhases = await phaseRepo.find({
    where: { formId: sourceFormId },
    relations: { fields: true },
    order: { order: 'ASC', fields: { order: 'ASC' } },
  });
  if (sourcePhases.length === 0) return createDefaultKanbanPhases(manager, targetFormId);

  const copies: KanbanPhaseEntity[] = [];
  for (const phase of sourcePhases) {
    const copy = await phaseRepo.save(
      phaseRepo.create({
        formId: targetFormId,
        key: phase.key,
        label: phase.label,
        color: phase.color,
        description: phase.description,
        order: phase.order,
        isTerminal: phase.isTerminal,
        actorRoleCode: phase.actorRoleCode,
        requiresApproval: phase.requiresApproval,
        approverRoleCode: phase.approverRoleCode,
        actors: phase.actors,
        approvers: phase.approvers,
        approvalMode: phase.approvalMode,
        approvalRequest: phase.approvalRequest,
        approvalOnApproved: phase.approvalOnApproved,
        approvalOnRejected: phase.approvalOnRejected,
        requireFieldsToExit: phase.requireFieldsToExit,
        requireAssigneeToExit: phase.requireAssigneeToExit,
        blockMoveBack: phase.blockMoveBack,
        visibleTo: phase.visibleTo,
        cardVisibility: phase.cardVisibility,
      }),
    );
    if (phase.fields?.length) {
      await fieldRepo.save(
        phase.fields.map((field) =>
          fieldRepo.create({
            phaseId: copy.id,
            code: field.code,
            label: field.label,
            fieldType: field.fieldType,
            required: field.required,
            order: field.order,
            settingsJson: field.settingsJson,
            optionsJson: field.optionsJson,
          }),
        ),
      );
    }
    copies.push(copy);
  }
  return copies;
}
