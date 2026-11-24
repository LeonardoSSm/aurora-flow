import { SolicitationStatus } from '../../common/enums/solicitation-status.enum';
import type { SolicitationPriority } from '../../common/enums/solicitation-priority.enum';
import type { SolicitationOriginType } from '../../common/enums/solicitation-origin-type.enum';
import type { KanbanCardDisplay } from '../../database/entities/kanban-phase.entity';
import type { CardDisplaySource, KanbanCardFieldValue } from '../kanban-phases/card-display';

export const KANBAN_COLUMNS: ReadonlyArray<{ status: SolicitationStatus; label: string }> = [
  { status: SolicitationStatus.NEW, label: 'Nova' },
  { status: SolicitationStatus.IN_ANALYSIS, label: 'Em Análise' },
  { status: SolicitationStatus.WAITING_APPROVAL, label: 'Aguardando Aprovação' },
  { status: SolicitationStatus.APPROVED, label: 'Aprovado' },
  { status: SolicitationStatus.IN_PROGRESS, label: 'Em Andamento' },
  { status: SolicitationStatus.WAITING_INTEGRATION, label: 'Aguardando Integração' },
  { status: SolicitationStatus.COMPLETED, label: 'Concluído' },
  { status: SolicitationStatus.REJECTED, label: 'Rejeitado' },
  { status: SolicitationStatus.CANCELLED, label: 'Cancelado' },
];

/** Statuses that no longer count as an "active" solicitation on the Kanban. */
export const TERMINAL_SOLICITATION_STATUSES: ReadonlyArray<SolicitationStatus> = [
  SolicitationStatus.COMPLETED,
  SolicitationStatus.REJECTED,
  SolicitationStatus.CANCELLED,
];

export const SOLICITATION_TRANSITIONS = new Map<
  SolicitationStatus,
  ReadonlyArray<SolicitationStatus>
>([
  [
    SolicitationStatus.NEW,
    [SolicitationStatus.IN_ANALYSIS, SolicitationStatus.REJECTED],
  ],
  [
    SolicitationStatus.IN_ANALYSIS,
    [
      SolicitationStatus.WAITING_APPROVAL,
      SolicitationStatus.IN_PROGRESS,
      SolicitationStatus.CANCELLED,
    ],
  ],
  [
    SolicitationStatus.WAITING_APPROVAL,
    [SolicitationStatus.APPROVED, SolicitationStatus.REJECTED, SolicitationStatus.CANCELLED],
  ],
  [SolicitationStatus.APPROVED, [SolicitationStatus.IN_PROGRESS, SolicitationStatus.CANCELLED]],
  [
    SolicitationStatus.IN_PROGRESS,
    [
      SolicitationStatus.WAITING_INTEGRATION,
      SolicitationStatus.COMPLETED,
      SolicitationStatus.CANCELLED,
    ],
  ],
  [
    SolicitationStatus.WAITING_INTEGRATION,
    [SolicitationStatus.COMPLETED, SolicitationStatus.CANCELLED],
  ],
  [SolicitationStatus.REJECTED, [SolicitationStatus.CANCELLED]],
]);

export function isTransitionAllowed(
  from: SolicitationStatus,
  to: SolicitationStatus,
): boolean {
  return SOLICITATION_TRANSITIONS.get(from)?.includes(to) ?? false;
}

export interface KanbanCard {
  id: string;
  title: string;
  formId: string | null;
  formName: string | null;
  requesterName: string | null;
  requesterEmail: string | null;
  responsibleUserId: string | null;
  responsibleName: string | null;
  priority: SolicitationPriority;
  slaDueAt: string | null;
  currentStage: string | null;
  phaseId: string | null;
  updatedAt: Date;
  originType: SolicitationOriginType;
  hasIntegrationError: boolean;
  /** Valor em R$ do "Valor do card" do formulário; ausente quando o Kanban não tem campo de valor. */
  value?: number | null;
  /** Prazo do card na fase atual; ausente quando a fase não tem prazo. */
  phaseSla?: KanbanCardPhaseSla;
  /** Quando o card entrou na fase atual (só as aprovações desta passagem valem para sair dela). */
  phaseEnteredAt?: string;
  /** Quando a solicitação foi aberta. */
  createdAt?: Date;
  /** Campos do processo escolhidos no "Personalizar card" da fase, já como texto (só os respondidos). */
  fields?: KanbanCardFieldValue[];
}

export interface KanbanCardPhaseSla {
  enteredAt: string;
  dueAt: string;
  businessHours: boolean;
  /** O prazo foi prorrogado por alguém. */
  extended: boolean;
  state: 'on_track' | 'warning' | 'breached';
  percentUsed: number;
  minutesRemaining: number;
}

export interface KanbanColumn {
  /** KanbanPhase id quando `groupBy === 'phase'`; chave da coluna padrão (novo/pendente/concluido) quando `groupBy === 'stage'`. */
  id: string;
  label: string;
  color?: string;
  /**
   * Só para quem gerencia fases (vê todas): a fase tem "Visível para" e outros usuários podem não
   * vê-la. Ausente para quem já está vendo por estar na lista.
   */
  restrictedVisibility?: boolean;
  /**
   * Só para quem gerencia fases: quantas regras o filtro de cards da fase tem (cards que só
   * aparecem para alguns perfis/usuários conforme a resposta). Ausente = sem filtro.
   */
  cardFilterRules?: number;
  /** Soma dos valores dos cards da coluna (R$); só quando o Kanban tem "Valor do card". */
  totalValue?: number;
  /** O que o card mostra nesta fase para quem está vendo (board por fase). */
  cardDisplay?: KanbanCardDisplay;
  /** De onde veio `cardDisplay`: ajuste da pessoa, padrão da fase ou padrão do sistema. */
  cardDisplaySource?: CardDisplaySource;
  cards: KanbanCard[];
}

export interface KanbanBoardDto {
  groupBy: 'phase' | 'stage';
  /** Nome do processo (board por fase): o título não pode depender de haver card visível. */
  formName?: string;
  /** Código do campo somado em `totalValue` e mostrado em `card.value`. */
  valueField?: string;
  columns: KanbanColumn[];
}

export interface KanbanFormSummary {
  formId: string | null;
  formName: string;
  totalCards: number;
  urgentCount: number;
}
