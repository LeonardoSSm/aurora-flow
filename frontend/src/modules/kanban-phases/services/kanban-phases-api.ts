import { api } from '../../../services/api';
import type {
  KanbanPhase,
  KanbanPhaseCardVisibility,
  KanbanPhasePeople,
  KanbanPhaseSectionRoute,
  KanbanPhaseVisibility,
} from '../types';

export async function fetchKanbanPhases(formId: string): Promise<KanbanPhase[]> {
  const { data } = await api.get<KanbanPhase[]>(`/forms/${formId}/kanban-phases`);
  return data;
}

export type SaveKanbanPhaseFieldInput = {
  id?: string;
  code: string;
  label: string;
  fieldType: string;
  required?: boolean;
  order: number;
  settingsJson?: Record<string, unknown> | null;
  options?: { value: string; label: string }[];
};

export type SaveKanbanPhaseInput = {
  id?: string;
  key: string;
  label: string;
  color?: string;
  description?: string | null;
  order: number;
  isTerminal?: boolean;
  /** Perfis e usuários; o backend preenche sozinho as colunas antigas (actorRoleCode/approverRoleCode). */
  actors?: KanbanPhasePeople | null;
  requiresApproval?: boolean;
  approvers?: KanbanPhasePeople | null;
  approvalMode?: 'any' | 'all' | 'sequential';
  approvalRequest?: 'manual' | 'on_enter' | 'on_complete';
  approvalOnApproved?: 'stay' | 'next';
  approvalOnRejected?: 'stay' | 'previous' | 'close';
  requireFieldsToExit?: boolean;
  requireAssigneeToExit?: boolean;
  blockMoveBack?: boolean;
  visibleTo?: KanbanPhaseVisibility | null;
  slaHours?: number | null;
  slaBusinessHours?: boolean;
  slaWarningPercent?: number | null;
  fields: SaveKanbanPhaseFieldInput[];
  /** Caminho entre as seções do formulário da fase; null = todas em ordem. */
  sectionFlow?: KanbanPhaseSectionRoute[] | null;
};

/** Áreas ativas (id e nome) para o "Visível para" — rota liberada para quem gerencia fases. */
export async function fetchAreaOptions(): Promise<Array<{ id: string; name: string }>> {
  const { data } = await api.get<Array<{ id: string; name: string }>>('/areas/options');
  return data;
}

export async function saveKanbanPhases(
  formId: string,
  phases: SaveKanbanPhaseInput[],
): Promise<KanbanPhase[]> {
  const { data } = await api.put<KanbanPhase[]>(`/forms/${formId}/kanban-phases`, { phases });
  return data;
}

/** Configuração do Kanban do formulário: o campo mostrado em R$ no card e somado por coluna. */
export type KanbanSettings = { cardValueField: string | null };

export async function fetchKanbanSettings(formId: string): Promise<KanbanSettings> {
  const { data } = await api.get<KanbanSettings>(`/forms/${formId}/kanban-settings`);
  return data;
}

export async function saveKanbanSettings(
  formId: string,
  settings: Partial<KanbanSettings>,
): Promise<KanbanSettings> {
  const { data } = await api.put<KanbanSettings>(`/forms/${formId}/kanban-settings`, settings);
  return data;
}

/** Filtro de cards da fase pela resposta; grava só isto (separado do "Salvar fases"). Sem regra = desliga. */
export async function saveKanbanPhaseCardVisibility(
  formId: string,
  phaseId: string,
  payload: KanbanPhaseCardVisibility,
): Promise<KanbanPhase> {
  const { data } = await api.put<KanbanPhase>(
    `/forms/${formId}/kanban-phases/${phaseId}/card-visibility`,
    payload,
  );
  return data;
}
