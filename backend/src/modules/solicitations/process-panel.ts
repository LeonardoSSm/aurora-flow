import type { KanbanPhaseEntity } from '../../database/entities/kanban-phase.entity';
import { isPhasePerson, phaseActors } from '../kanban-phases/phase-people';
import type { KanbanCard } from './solicitation-transitions';

/**
 * Painel inicial: o que depende de mim agora e como está cada processo, fase a fase. Cálculo puro
 * sobre os cards já resolvidos (fase atual, prazo da fase) — as consultas ficam no serviço.
 */

/** Por que a solicitação está na minha lista. */
export type ProcessPanelReason = 'approval' | 'assigned' | 'phase';

export interface ProcessPanelItem extends KanbanCard {
  phaseLabel: string;
  phaseColor: string;
  reason: ProcessPanelReason;
}

export interface ProcessPanelPhase {
  id: string;
  label: string;
  color: string;
  count: number;
  /** Cards com o prazo da fase vencido. */
  late: number;
}

export interface ProcessPanelProcess {
  formId: string;
  formName: string;
  active: number;
  late: number;
  warning: number;
  /** O card parado há mais tempo na fase em que está. */
  oldest: { phaseId: string; phaseLabel: string; enteredAt: string } | null;
  phases: ProcessPanelPhase[];
}

export interface ProcessPanelDto {
  forMe: { total: number; late: number; items: ProcessPanelItem[] };
  processes: ProcessPanelProcess[];
}

/** Card já resolvido contra as fases do processo: só fases não finais e visíveis para quem pede. */
export interface ProcessPanelCard {
  card: KanbanCard;
  formName: string;
  phase: Pick<KanbanPhaseEntity, 'id' | 'label' | 'color' | 'actors' | 'actorRoleCode'>;
  enteredAt: Date;
}

export const PROCESS_PANEL_MAX_ITEMS = 50;

const SLA_RANK: Record<string, number> = { breached: 0, warning: 1 };

function urgencyCompare(a: ProcessPanelCard, b: ProcessPanelCard): number {
  const slaA = SLA_RANK[a.card.phaseSla?.state ?? ''] ?? 2;
  const slaB = SLA_RANK[b.card.phaseSla?.state ?? ''] ?? 2;
  if (slaA !== slaB) return slaA - slaB;
  const urgentA = a.card.priority === 'urgent' ? 0 : 1;
  const urgentB = b.card.priority === 'urgent' ? 0 : 1;
  if (urgentA !== urgentB) return urgentA - urgentB;
  return a.enteredAt.getTime() - b.enteredAt.getTime();
}

/**
 * É comigo quando: a aprovação pendente é minha; sou o responsável; ou o card não tem responsável e
 * a fase escolheu quem atua (perfil ou usuário) e eu estou nessa lista. Fase sem "quem atua"
 * (= qualquer um) não entra — senão tudo seria "meu" para quem vê tudo.
 */
export function panelReason(
  entry: ProcessPanelCard,
  viewer: { sub: string; role: string },
  myApprovalSolicitationIds: ReadonlySet<string>,
): ProcessPanelReason | null {
  if (myApprovalSolicitationIds.has(entry.card.id)) return 'approval';
  if (entry.card.responsibleUserId === viewer.sub) return 'assigned';
  if (entry.card.responsibleUserId) return null;
  const actors = phaseActors(entry.phase);
  return actors && isPhasePerson(actors, viewer) ? 'phase' : null;
}

export function buildProcessPanel(input: {
  entries: ProcessPanelCard[];
  /** Fases visíveis e não finais de cada processo, na ordem do processo. */
  phasesByForm: Map<string, Pick<KanbanPhaseEntity, 'id' | 'label' | 'color'>[]>;
  viewer: { sub: string; role: string };
  myApprovalSolicitationIds: ReadonlySet<string>;
}): ProcessPanelDto {
  const { entries, phasesByForm, viewer, myApprovalSolicitationIds } = input;

  const mine: { entry: ProcessPanelCard; reason: ProcessPanelReason }[] = [];
  for (const entry of entries) {
    const reason = panelReason(entry, viewer, myApprovalSolicitationIds);
    if (reason) mine.push({ entry, reason });
  }
  mine.sort((a, b) => urgencyCompare(a.entry, b.entry));

  const byForm = new Map<string, ProcessPanelCard[]>();
  for (const entry of entries) {
    const formId = entry.card.formId as string;
    const list = byForm.get(formId);
    if (list) list.push(entry);
    else byForm.set(formId, [entry]);
  }

  const processes: ProcessPanelProcess[] = [];
  for (const [formId, cards] of byForm) {
    const phases = (phasesByForm.get(formId) ?? []).map((phase) => ({
      id: phase.id,
      label: phase.label,
      color: phase.color,
      count: 0,
      late: 0,
    }));
    const phaseById = new Map(phases.map((phase) => [phase.id, phase]));
    let late = 0;
    let warning = 0;
    let oldest: ProcessPanelCard | null = null;
    for (const entry of cards) {
      const phase = phaseById.get(entry.phase.id);
      if (phase) phase.count += 1;
      const state = entry.card.phaseSla?.state;
      if (state === 'breached') {
        late += 1;
        if (phase) phase.late += 1;
      } else if (state === 'warning') {
        warning += 1;
      }
      if (!oldest || entry.enteredAt < oldest.enteredAt) oldest = entry;
    }
    processes.push({
      formId,
      formName: cards[0].formName,
      active: cards.length,
      late,
      warning,
      oldest: oldest
        ? {
            phaseId: oldest.phase.id,
            phaseLabel: oldest.phase.label,
            enteredAt: oldest.enteredAt.toISOString(),
          }
        : null,
      phases,
    });
  }
  processes.sort(
    (a, b) =>
      b.late - a.late || b.active - a.active || a.formName.localeCompare(b.formName, 'pt-BR'),
  );

  return {
    forMe: {
      total: mine.length,
      late: mine.filter(({ entry }) => entry.card.phaseSla?.state === 'breached').length,
      items: mine.slice(0, PROCESS_PANEL_MAX_ITEMS).map(({ entry, reason }) => ({
        ...entry.card,
        phaseLabel: entry.phase.label,
        phaseColor: entry.phase.color,
        reason,
      })),
    },
    processes,
  };
}
