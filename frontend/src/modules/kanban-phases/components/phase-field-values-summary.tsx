import { formatBRL } from '../../../lib/money';
import { formatHours } from '../../forms/formula';
import { isPhaseHoursSettings } from '../lib/phase-formula';
import type { PhaseFieldValue } from '../../solicitations/services/solicitations-api';
import type { KanbanPhase, KanbanPhaseField } from '../types';

export type PhaseFieldEntry = { field: KanbanPhaseField; value: PhaseFieldValue };

export function hasPhaseValueContent(value: PhaseFieldValue): boolean {
  return value.valueText !== null || value.valueNumber !== null || value.valueBoolean !== null || value.valueJson !== null;
}

/**
 * Valor de campo de fase para ler. "Cálculo" é R$ (o "Total de horas", 8h30); "Valor (R$)" mostra o texto que a pessoa
 * viu (o número gravado junto é para somar); número sai no formato brasileiro.
 */
export function formatPhaseValue(
  value: PhaseFieldValue,
  field?: Pick<KanbanPhaseField, 'fieldType'> & { settingsJson?: KanbanPhaseField['settingsJson'] },
): string {
  if (value.valueBoolean !== null) return value.valueBoolean ? 'Sim' : 'Não';
  if (field?.fieldType === 'calculated' && value.valueNumber !== null) {
    return isPhaseHoursSettings(field.settingsJson) ? formatHours(value.valueNumber) : formatBRL(value.valueNumber);
  }
  if (value.valueText !== null) return value.valueText;
  if (value.valueNumber !== null) {
    return field?.fieldType === 'currency'
      ? formatBRL(value.valueNumber)
      : new Intl.NumberFormat('pt-BR').format(value.valueNumber);
  }
  if (value.valueJson !== null) {
    return typeof value.valueJson === 'string' ? value.valueJson : JSON.stringify(value.valueJson);
  }
  return '—';
}

/**
 * Campos da fase que já têm valor preenchido, na ordem da fase. Campos de arquivo ficam de
 * fora: a foto aparece como anexo (com a validação por IA), não como texto.
 */
export function getPhaseFieldEntries(phase: KanbanPhase, values: PhaseFieldValue[]): PhaseFieldEntry[] {
  const valueByFieldId = new Map(
    values.filter((v) => v.phaseFieldId).map((v) => [v.phaseFieldId as string, v]),
  );
  return phase.fields
    .filter((field) => field.fieldType !== 'file_upload')
    .map((field) => ({ field, value: valueByFieldId.get(field.id) }))
    .filter((entry): entry is PhaseFieldEntry =>
      Boolean(entry.value && hasPhaseValueContent(entry.value)),
    );
}

/**
 * O que o operador enviou nesta fase (ex.: a quantidade produzida), em destaque e somente
 * leitura — é o dado que o aprovador precisa ver para decidir. Não renderiza nada enquanto
 * não houver valor preenchido.
 */
export function PhaseFieldValuesSummary({
  phase,
  values,
  title = 'Dados enviados nesta fase',
}: {
  phase: KanbanPhase | undefined;
  values: PhaseFieldValue[];
  title?: string;
}) {
  if (!phase) return null;
  const entries = getPhaseFieldEntries(phase, values);
  if (entries.length === 0) return null;

  return (
    <section aria-label={title} className="grid grid-cols-1 gap-2">
      <p className="text-xs font-bold uppercase tracking-wide text-tx-secondary">{title}</p>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {entries.map(({ field, value }) => (
          <div
            key={field.id}
            className="min-w-0 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5"
          >
            <dt className="break-words text-xs font-bold uppercase text-tx-secondary">{field.label}</dt>
            <dd className="break-words text-xl font-extrabold text-tx-primary">{formatPhaseValue(value, field)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
