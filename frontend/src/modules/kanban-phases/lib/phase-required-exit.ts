import { isPhaseLayoutType } from './phase-field-types';
import { reachablePhaseFieldIds } from './phase-section-flow';
import type { KanbanPhase, KanbanPhaseField } from '../types';

/**
 * Espelho no navegador das travas de saída da fase — "Só avançar com os obrigatórios preenchidos"
 * (`requireFieldsToExit`) e "Só avançar com responsável" (`requireAssigneeToExit`) —, para avisar
 * antes de tentar mover. Quem garante é o backend (kanban-phases/phase-required-fields.ts):
 * mesmas regras, sobre o que está SALVO no card, não o que está sendo digitado.
 */

type SavedValue = {
  phaseFieldId: string | null;
  valueText: string | null;
  valueNumber: number | null;
  valueBoolean: boolean | null;
  valueJson: unknown;
};

/** Mesma regra do envio do formulário: texto só com espaços, checkbox desmarcado e lista vazia não contam. */
function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function isEmpty(field: KanbanPhaseField, value: SavedValue | undefined): boolean {
  if (!value) return true;
  if (field.fieldType === 'item_order') {
    const rows = (value.valueJson as { rows?: unknown } | null)?.rows;
    return !Array.isArray(rows) || rows.length === 0;
  }
  return !hasMeaningfulValue(value.valueText ?? value.valueNumber ?? value.valueBoolean ?? value.valueJson ?? null);
}

/**
 * Campos obrigatórios desta fase ainda em branco no que está salvo — os que seguram o card. Vazio
 * quando a fase não tem a trava. Título/descrição/divisor e cálculo nunca entram; campo fora do
 * caminho do formulário da fase (ramificação) também não.
 */
export function missingRequiredToExit(
  phase: Pick<KanbanPhase, 'fields' | 'sectionFlow' | 'requireFieldsToExit'>,
  saved: SavedValue[],
): KanbanPhaseField[] {
  if (!phase.requireFieldsToExit) return [];
  const byField = new Map(saved.map((value) => [value.phaseFieldId, value]));
  const reachable = reachablePhaseFieldIds(phase, (field) => {
    const value = byField.get(field.id);
    return value ? (value.valueJson ?? value.valueBoolean ?? value.valueText ?? value.valueNumber ?? null) : null;
  });
  return [...phase.fields]
    .sort((a, b) => a.order - b.order)
    .filter(
      (field) =>
        field.required &&
        !isPhaseLayoutType(field.fieldType) &&
        field.fieldType !== 'calculated' &&
        reachable.has(field.id) &&
        isEmpty(field, byField.get(field.id)),
    );
}

/** O que segura o card na fase (as duas travas juntas, como a checagem do backend). */
export type PhaseExitBlockers = {
  needsAssignee: boolean;
  missingFields: KanbanPhaseField[];
};

export function phaseExitBlockers(
  phase: Pick<KanbanPhase, 'fields' | 'sectionFlow' | 'requireFieldsToExit' | 'requireAssigneeToExit'>,
  saved: SavedValue[],
  assigneeId: string | null | undefined,
): PhaseExitBlockers {
  return {
    needsAssignee: phase.requireAssigneeToExit === true && !assigneeId,
    missingFields: missingRequiredToExit(phase, saved),
  };
}

/** Aviso do card: tudo o que falta numa frase só. Nulo quando nada segura o card. */
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
