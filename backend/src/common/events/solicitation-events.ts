import type { SolicitationOriginType } from '../enums/solicitation-origin-type.enum';
import type { SolicitationPriority } from '../enums/solicitation-priority.enum';
import type { SolicitationStatus } from '../enums/solicitation-status.enum';
import { DomainEvent } from './domain-event.base';

export class SolicitationCreatedEvent extends DomainEvent {
  readonly name = 'solicitations.created';

  constructor(
    actorId: string | null,
    readonly solicitationId: string,
    readonly originType: SolicitationOriginType,
    readonly formId: string | null,
    readonly submissionId: string | null,
    /**
     * Encadeamento de fluxos de quem criou o card (encaminhamento entre processos). Sem ele, um
     * fluxo do destino que encaminha de volta viraria laço sem fim.
     */
    readonly flowDepth?: number,
  ) {
    super(actorId);
  }
}

export class SolicitationStatusChangedEvent extends DomainEvent {
  readonly name = 'solicitations.status_changed';

  constructor(
    actorId: string | null,
    readonly solicitationId: string,
    readonly fromStatus: SolicitationStatus,
    readonly toStatus: SolicitationStatus,
  ) {
    super(actorId);
  }
}

export class SolicitationAssigneeChangedEvent extends DomainEvent {
  readonly name = 'solicitations.assignee_changed';

  constructor(
    actorId: string | null,
    readonly solicitationId: string,
    readonly fromAssigneeId: string | null,
    readonly toAssigneeId: string | null,
  ) {
    super(actorId);
  }
}

export class SolicitationPriorityChangedEvent extends DomainEvent {
  readonly name = 'solicitations.priority_changed';

  constructor(
    actorId: string | null,
    readonly solicitationId: string,
    readonly fromPriority: SolicitationPriority,
    readonly toPriority: SolicitationPriority,
  ) {
    super(actorId);
  }
}

export class SolicitationMovedEvent extends DomainEvent {
  readonly name = 'solicitations.moved';

  constructor(
    actorId: string | null,
    readonly solicitationId: string,
    readonly fromStatus: SolicitationStatus,
    readonly toStatus: SolicitationStatus,
    readonly flowDepth = 0,
  ) {
    super(actorId);
  }
}

/**
 * O card mudou de fase (SolicitationsService.movePhase, por pessoa ou por fluxo). `fromPhaseId`
 * é a fase efetiva de onde saiu (nula se não estava em nenhuma). `flowDepth` conta quantos fluxos
 * encadearam até aqui — o gatilho "Entrou na fase" para quando passa do limite.
 */
export class PhaseChangedEvent extends DomainEvent {
  readonly name = 'solicitations.phase_changed';

  constructor(
    actorId: string | null,
    readonly solicitationId: string,
    readonly fromPhaseId: string | null,
    readonly toPhaseId: string,
    readonly flowDepth = 0,
  ) {
    super(actorId);
  }
}

export class PhaseFieldsSavedEvent extends DomainEvent {
  readonly name = 'solicitations.phase_fields_saved';

  constructor(
    actorId: string | null,
    readonly solicitationId: string,
    readonly phaseId: string,
  ) {
    super(actorId);
  }
}
