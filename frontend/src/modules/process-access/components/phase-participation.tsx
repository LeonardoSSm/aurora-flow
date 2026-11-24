import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import { fetchKanbanPhases } from '../../kanban-phases/services/kanban-phases-api';
import type { KanbanPhase, KanbanPhasePeople } from '../../kanban-phases/types';

type Person = { id: string; role: string };

function peopleOf(list: KanbanPhasePeople | null | undefined, legacyRole: string | null): KanbanPhasePeople | null {
  if (list && (list.roleCodes.length > 0 || list.userIds.length > 0)) return list;
  return legacyRole ? { roleCodes: [legacyRole], userIds: [] } : null;
}

function includes(list: KanbanPhasePeople | null, person: Person): boolean {
  return !!list && (list.userIds.includes(person.id) || list.roleCodes.includes(person.role));
}

/** Fases em que a pessoa atua e aprova, pela configuração de cada fase (pessoa ou perfil dela). */
export function phaseParticipation(phases: KanbanPhase[], person: Person) {
  const acts: string[] = [];
  const open: string[] = [];
  const approves: string[] = [];
  for (const phase of phases) {
    if (phase.isTerminal) continue;
    const actors = peopleOf(phase.actors, phase.actorRoleCode);
    if (!actors) open.push(phase.label);
    else if (includes(actors, person)) acts.push(phase.label);
    if (phase.requiresApproval && includes(peopleOf(phase.approvers, phase.approverRoleCode), person)) {
      approves.push(phase.label);
    }
  }
  return { acts, open, approves };
}

/**
 * Onde a pessoa entra nas fases do processo. Só mostra: quem atua e quem aprova se configura na fase,
 * no Criador — as fases são gravadas inteiras pelo "Salvar" de lá, e duas telas gravando a mesma lista
 * se atropelariam.
 */
export function PhaseParticipation({ formId, person }: { formId: string; person: Person }) {
  const { data: phases, isLoading, isError } = useQuery({
    queryKey: queryKeys.kanbanPhases.byForm(formId),
    queryFn: () => fetchKanbanPhases(formId),
  });

  if (isLoading) return <p className="text-xs text-tx-muted">Carregando as fases…</p>;
  if (isError || !phases) return <p className="text-xs text-tx-muted">Não foi possível carregar as fases.</p>;

  const { acts, open, approves } = phaseParticipation(phases, person);
  const line = (label: string, items: string[]) =>
    items.length > 0 ? (
      <li>
        <span className="font-semibold text-tx-primary">{label}:</span> {items.join(', ')}
      </li>
    ) : null;

  return (
    <div className="grid gap-1.5 rounded-[10px] bg-bg-s2 px-3 py-2.5">
      <span className="text-xs font-bold text-tx-primary">Nas fases</span>
      <ul className="grid gap-0.5 text-xs text-tx-secondary">
        {line('Atua em', acts)}
        {line('Aprova em', approves)}
        {line('Abertas a quem atua no processo', open)}
        {acts.length + approves.length + open.length === 0 ? <li>Não aparece em nenhuma fase.</li> : null}
      </ul>
      <span className="text-[11px] text-tx-muted">Quem atua e quem aprova em cada fase se configura no Criador.</span>
    </div>
  );
}
