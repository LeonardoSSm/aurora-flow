import axios from 'axios';
import type { Approval, KanbanPhase, KanbanPhaseField, PhaseFieldValue, PhasePeople } from '../api/types';
import { computeCalculatedFieldValues, getFormulaDecimals } from '../utils/formula';

/*
 * Regras de fase do Kanban — espelho de frontend/src/modules/kanban-phases/lib/*. Aqui servem para
 * avisar antes; quem garante é o backend (kanban-phases/*).
 */

export const PHASE_LAYOUT_TYPES = new Set(['title', 'description', 'divider']);
const PHASE_START_SECTION = '__inicio__';

// ── Quem atua / quem aprova ─────────────────────────────────────────────────

function people(list: PhasePeople | null | undefined, legacyRole: string | null): PhasePeople {
  const roleCodes = list?.roleCodes ?? [];
  const userIds = list?.userIds ?? [];
  if (roleCodes.length + userIds.length > 0) return { roleCodes, userIds };
  return legacyRole ? { roleCodes: [legacyRole], userIds: [] } : { roleCodes: [], userIds: [] };
}

export function phaseActors(phase: Pick<KanbanPhase, 'actors' | 'actorRoleCode'>): PhasePeople {
  return people(phase.actors, phase.actorRoleCode);
}

export function phaseApprovers(phase: Pick<KanbanPhase, 'approvers' | 'approverRoleCode'>): PhasePeople {
  return people(phase.approvers, phase.approverRoleCode);
}

export function peopleCount(list: PhasePeople): number {
  return list.roleCodes.length + list.userIds.length;
}

/** Perfil OU usuário da lista; lista vazia = qualquer um. */
export function isPhasePerson(list: PhasePeople, user: { id: string; role: string } | null | undefined): boolean {
  if (peopleCount(list) === 0) return true;
  if (!user) return false;
  return list.roleCodes.includes(user.role) || list.userIds.includes(user.id);
}

export function actorsMessage(actors: PhasePeople): string {
  return actors.userIds.length === 0 && actors.roleCodes.length === 1
    ? `Apenas o perfil "${actors.roleCodes[0]}" pode preencher os campos desta fase.`
    : 'Apenas os perfis e usuários escolhidos para esta fase podem preencher os campos.';
}

// ── Caminho das seções do formulário da fase ────────────────────────────────

function branchMatches(fieldType: string, branch: { optionValue: string | null; checkboxValue: boolean | null }, value: unknown) {
  if (branch.checkboxValue !== null) return Boolean(value) === branch.checkboxValue;
  if (branch.optionValue === null) return false;
  if (fieldType === 'multi_select') return Array.isArray(value) && value.includes(branch.optionValue);
  return String(value ?? '') === branch.optionValue;
}

/** Ids dos campos (títulos inclusive) no caminho com as respostas atuais. Sem caminho, todos. */
export function reachablePhaseFieldIds(
  phase: Pick<KanbanPhase, 'fields' | 'sectionFlow'>,
  valueOf: (field: KanbanPhaseField) => unknown,
): Set<string> {
  const ordered = [...phase.fields].sort((a, b) => a.order - b.order);
  const sections: Array<{ key: string; fields: KanbanPhaseField[] }> = [];
  for (const field of ordered) {
    if (field.fieldType === 'title') sections.push({ key: field.code, fields: [field] });
    else if (sections.length === 0) sections.push({ key: PHASE_START_SECTION, fields: [field] });
    else sections[sections.length - 1].fields.push(field);
  }
  const routes = phase.sectionFlow ?? [];
  if (routes.length === 0) return new Set(ordered.map((field) => field.id));

  const indexOf = new Map(sections.map((section, index) => [section.key, index]));
  const routeOf = new Map(routes.map((route) => [route.section, route]));
  const reachable = new Set<string>();
  const visited = new Set<string>();
  let index: number | undefined = sections.length > 0 ? 0 : undefined;
  while (index !== undefined && !visited.has(sections[index].key)) {
    const section = sections[index];
    visited.add(section.key);
    section.fields.forEach((field) => reachable.add(field.id));
    const route = routeOf.get(section.key);
    let next: string | null | undefined;
    for (const branch of route?.branches ?? []) {
      const field = section.fields.find((candidate) => candidate.code === branch.fieldCode);
      if (field && branchMatches(field.fieldType, branch, valueOf(field))) {
        next = branch.target;
        break;
      }
    }
    if (next === undefined) next = route && route.next !== undefined ? route.next : (sections[index + 1]?.key ?? null);
    index = next === null ? undefined : indexOf.get(next);
  }
  return reachable;
}

// ── Travas de saída ─────────────────────────────────────────────────────────

function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function savedRaw(value: PhaseFieldValue): unknown {
  return value.valueJson ?? value.valueBoolean ?? value.valueText ?? value.valueNumber ?? null;
}

function isEmptySaved(field: KanbanPhaseField, value: PhaseFieldValue | undefined): boolean {
  if (!value) return true;
  if (field.fieldType === 'item_order') {
    const rows = (value.valueJson as { rows?: unknown } | null)?.rows;
    return !Array.isArray(rows) || rows.length === 0;
  }
  return !hasMeaningfulValue(value.valueText ?? value.valueNumber ?? value.valueBoolean ?? value.valueJson ?? null);
}

export function missingRequiredToExit(phase: KanbanPhase, saved: PhaseFieldValue[]): KanbanPhaseField[] {
  if (!phase.requireFieldsToExit) return [];
  const byField = new Map(saved.map((value) => [value.phaseFieldId, value]));
  const reachable = reachablePhaseFieldIds(phase, (field) => {
    const value = byField.get(field.id);
    return value ? savedRaw(value) : null;
  });
  return [...phase.fields]
    .sort((a, b) => a.order - b.order)
    .filter(
      (field) =>
        field.required &&
        !PHASE_LAYOUT_TYPES.has(field.fieldType) &&
        field.fieldType !== 'calculated' &&
        reachable.has(field.id) &&
        isEmptySaved(field, byField.get(field.id)),
    );
}

export type PhaseExitBlockers = { needsAssignee: boolean; missingFields: KanbanPhaseField[] };

export function phaseExitBlockers(
  phase: KanbanPhase,
  saved: PhaseFieldValue[],
  assigneeId: string | null | undefined,
): PhaseExitBlockers {
  return {
    needsAssignee: phase.requireAssigneeToExit === true && !assigneeId,
    missingFields: missingRequiredToExit(phase, saved),
  };
}

export function phaseExitHint(blockers: PhaseExitBlockers): string | null {
  const parts: string[] = [];
  if (blockers.needsAssignee) parts.push('atribua um responsável ao card');
  const missing = blockers.missingFields;
  if (missing.length > 0) {
    const noun = missing.length === 1 ? 'o campo obrigatório' : 'os campos obrigatórios';
    parts.push(`preencha e salve ${noun}: ${missing.map((field) => `“${field.label}”`).join(', ')}`);
  }
  if (parts.length === 0) return null;
  return `Para avançar, ${parts.join(' e ')}. Voltar para uma fase anterior continua livre.`;
}

// ── Ponto sem volta ─────────────────────────────────────────────────────────

type ColumnLike = { id: string; label: string; blockMoveBack?: boolean };

/** A fase que segura a volta de `fromId` para `toId` (fases em ordem). Null = pode ir. */
export function moveBackBarrier<T extends ColumnLike>(columns: readonly T[], fromId: string, toId: string): T | null {
  const from = columns.findIndex((c) => c.id === fromId);
  const to = columns.findIndex((c) => c.id === toId);
  if (from < 0 || to < 0 || to >= from) return null;
  for (let i = from; i > to; i -= 1) {
    if (columns[i].blockMoveBack === true) return columns[i];
  }
  return null;
}

export function moveBackMessage(barrier: Pick<ColumnLike, 'label'>): string {
  return `O card já chegou à fase "${barrier.label}", que é um ponto sem volta: ele não pode voltar para uma fase anterior a ela. Quem configura as fases do processo pode devolvê-lo.`;
}

// ── Trava de aprovação ao mover ─────────────────────────────────────────────

export type PhaseApprovalBlock = {
  code: 'phase_approval_required' | 'phase_approval_pending' | 'phase_approval_rejected';
  message: string;
  phaseId: string;
  phaseLabel: string;
  approvers: string[];
  canRequest: boolean;
};

const BLOCK_CODES: readonly PhaseApprovalBlock['code'][] = [
  'phase_approval_required',
  'phase_approval_pending',
  'phase_approval_rejected',
];

export function phaseApprovalBlockOf(error: unknown): PhaseApprovalBlock | null {
  if (!axios.isAxiosError(error)) return null;
  const data: unknown = error.response?.data;
  if (!data || typeof data !== 'object') return null;
  const body = data as Record<string, unknown>;
  if (!BLOCK_CODES.includes(body.code as PhaseApprovalBlock['code']) || typeof body.message !== 'string') return null;
  return {
    code: body.code as PhaseApprovalBlock['code'],
    message: body.message,
    phaseId: typeof body.phaseId === 'string' ? body.phaseId : '',
    phaseLabel: typeof body.phaseLabel === 'string' ? body.phaseLabel : '',
    approvers: Array.isArray(body.approvers) ? body.approvers.filter((name): name is string => typeof name === 'string') : [],
    canRequest: body.canRequest === true,
  };
}

export function describeApprovers(names: string[]): string {
  if (names.length <= 1) return names[0] ?? 'quem aprova a fase';
  return `${names.slice(0, -1).join(', ')} ou ${names[names.length - 1]}`;
}

/** Aprovações desta passagem pela fase (card devolvido que volta precisa de aprovação nova). */
export function currentPhaseApprovals(approvals: Approval[], phaseId: string | undefined, enteredAt?: string | null): Approval[] {
  const since = enteredAt ? new Date(enteredAt).getTime() : 0;
  return approvals
    .filter((a) => a.phaseId === phaseId && new Date(a.createdAt).getTime() >= since)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// ── Cálculo da fase ─────────────────────────────────────────────────────────

const PHASE_MONEY_DECIMALS = 2;

export function isPhaseHoursSettings(settings: Record<string, unknown> | null | undefined): boolean {
  return settings?.formulaFormat === 'hours';
}

/** Formato fixo do cálculo de fase: R$ com 2 casas, ou horas no "Total de horas". */
export function phaseCalculatedSettings(settings: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const rest = { ...(settings ?? {}) };
  if (rest.formulaFormat !== 'hours') return { ...rest, formulaDecimals: PHASE_MONEY_DECIMALS, formulaPrefix: 'R$ ' };
  delete rest.formulaPrefix;
  delete rest.formulaSuffix;
  delete rest.formulaDecimals;
  return { ...rest, formulaFormat: 'hours' };
}

type AnswerLike = { fieldCode: string; valueText: string | null; valueNumber: number | null; valueBoolean: boolean | null; valueJson: unknown };

function rawOf(item: AnswerLike): unknown {
  return item.valueText ?? item.valueNumber ?? item.valueBoolean ?? item.valueJson ?? null;
}

/**
 * Prévia dos "Cálculo" enquanto o card é preenchido (o valor gravado sai do backend ao salvar).
 * Precedência do backend: resposta do formulário > o que está sendo digitado > o salvo nas fases.
 */
export function previewPhaseCalculations({
  phases,
  savedValues,
  editingValues,
  formAnswers,
}: {
  phases: KanbanPhase[];
  savedValues: PhaseFieldValue[];
  editingValues: Record<string, unknown>;
  formAnswers: AnswerLike[];
}): Record<string, number | null> {
  const fields = phases.flatMap((phase) => phase.fields);
  const calculated = fields.filter((field) => field.fieldType === 'calculated');
  if (calculated.length === 0) return {};
  const calculatedCodes = new Set(calculated.map((field) => field.code));
  const scope: Record<string, unknown> = {};
  for (const item of savedValues) scope[item.fieldCode] = rawOf(item);
  for (const field of fields) if (field.id in editingValues) scope[field.code] = editingValues[field.id];
  for (const item of formAnswers) scope[item.fieldCode] = rawOf(item);
  for (const code of calculatedCodes) delete scope[code];
  const byCode = computeCalculatedFieldValues(
    calculated.map((field) => ({
      code: field.code,
      formula: typeof field.settingsJson?.formula === 'string' ? field.settingsJson.formula : '',
      decimals: isPhaseHoursSettings(field.settingsJson)
        ? getFormulaDecimals(field.settingsJson ?? {})
        : PHASE_MONEY_DECIMALS,
    })),
    scope,
  );
  return Object.fromEntries(calculated.map((field) => [field.id, byCode[field.code] ?? null]));
}
