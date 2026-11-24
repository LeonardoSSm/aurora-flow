/**
 * "Personalizar card" do Kanban: o que o card mostra em cada fase. Espelha o backend
 * (kanban-phases/card-display.ts): vale o ajuste da pessoa, senão o padrão da fase, senão o do
 * sistema (o card de antes).
 */

export type CardIndicator =
  | 'process'
  | 'priority'
  | 'value'
  | 'sla'
  | 'phase_sla'
  | 'assignee'
  | 'updated_at'
  | 'requester'
  | 'created_at'
  | 'time_in_phase'
  | 'number';

export type CardDisplayField = { fieldCode: string; label: string | null };

export type CardDisplay = { indicators: CardIndicator[]; fields: CardDisplayField[] };

export type CardDisplaySource = 'personal' | 'phase' | 'default';

/** Campo do processo que pode ir para o card. */
export type CardDisplayFieldOption = {
  code: string;
  label: string;
  fieldType: string;
  phaseLabel: string | null;
};

/** GET /forms/:formId/kanban-phases/:phaseId/card-display */
export type PhaseCardDisplayView = {
  phaseId: string;
  phaseDefault: CardDisplay | null;
  personal: CardDisplay | null;
  effective: CardDisplay;
  source: CardDisplaySource;
  fields: CardDisplayFieldOption[];
};

export const CARD_DISPLAY_MAX_FIELDS = 8;
export const CARD_DISPLAY_LABEL_MAX = 60;

/** Indicadores na ordem do editor, com nome e explicação curta. */
export const CARD_INDICATOR_OPTIONS: ReadonlyArray<{ key: CardIndicator; label: string; hint: string }> = [
  { key: 'process', label: 'Processo', hint: 'Etiqueta com o nome do processo.' },
  { key: 'priority', label: 'Prioridade', hint: 'Urgente, alta, média ou baixa.' },
  { key: 'value', label: 'Valor do card', hint: 'O valor em R$ escolhido para o Kanban.' },
  { key: 'sla', label: 'Prazo da solicitação', hint: 'SLA geral (vencido, em risco, no prazo).' },
  { key: 'phase_sla', label: 'Prazo da fase', hint: 'Quanto falta do prazo desta fase.' },
  { key: 'assignee', label: 'Responsável', hint: 'Quem está com o card (e o botão de atribuir).' },
  { key: 'updated_at', label: 'Última atualização', hint: 'Há quanto tempo o card mudou.' },
  { key: 'requester', label: 'Solicitante', hint: 'Quem abriu a solicitação.' },
  { key: 'created_at', label: 'Data de abertura', hint: 'Quando a solicitação foi aberta.' },
  { key: 'time_in_phase', label: 'Tempo na fase', hint: 'Há quanto tempo o card está nesta fase.' },
  { key: 'number', label: 'Número', hint: 'Código curto da solicitação (#A1B2C3D4).' },
];

/** O card de sempre (padrão do sistema). */
export const DEFAULT_CARD_DISPLAY: CardDisplay = {
  indicators: ['process', 'priority', 'value', 'sla', 'phase_sla', 'assignee', 'updated_at'],
  fields: [],
};

/** O que vale quando o board não manda configuração (quadro "Sem processo", backend antigo). */
export function displayOrDefault(display: CardDisplay | null | undefined): CardDisplay {
  return display ?? DEFAULT_CARD_DISPLAY;
}

export function sameCardDisplay(a: CardDisplay, b: CardDisplay): boolean {
  return JSON.stringify(normalizeDraft(a)) === JSON.stringify(normalizeDraft(b));
}

/** Rascunho do editor como o backend grava: indicadores na ordem do editor, rótulo vazio = null. */
export function normalizeDraft(draft: CardDisplay): CardDisplay {
  const on = new Set(draft.indicators);
  return {
    indicators: CARD_INDICATOR_OPTIONS.filter((option) => on.has(option.key)).map((option) => option.key),
    fields: draft.fields.map((field) => ({
      fieldCode: field.fieldCode,
      label: field.label?.trim() ? field.label.trim().slice(0, CARD_DISPLAY_LABEL_MAX) : null,
    })),
  };
}

export function toggleIndicator(draft: CardDisplay, key: CardIndicator): CardDisplay {
  const indicators = draft.indicators.includes(key)
    ? draft.indicators.filter((item) => item !== key)
    : [...draft.indicators, key];
  return { ...draft, indicators };
}

export function addField(draft: CardDisplay, fieldCode: string): CardDisplay {
  if (!fieldCode || draft.fields.length >= CARD_DISPLAY_MAX_FIELDS) return draft;
  if (draft.fields.some((field) => field.fieldCode === fieldCode)) return draft;
  return { ...draft, fields: [...draft.fields, { fieldCode, label: null }] };
}

export function removeField(draft: CardDisplay, fieldCode: string): CardDisplay {
  return { ...draft, fields: draft.fields.filter((field) => field.fieldCode !== fieldCode) };
}

/** Sobe (-1) ou desce (+1) um campo na lista. */
export function moveField(draft: CardDisplay, fieldCode: string, direction: -1 | 1): CardDisplay {
  const index = draft.fields.findIndex((field) => field.fieldCode === fieldCode);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= draft.fields.length) return draft;
  const fields = [...draft.fields];
  [fields[index], fields[target]] = [fields[target], fields[index]];
  return { ...draft, fields };
}

export function renameField(draft: CardDisplay, fieldCode: string, label: string): CardDisplay {
  return {
    ...draft,
    fields: draft.fields.map((field) =>
      field.fieldCode === fieldCode ? { ...field, label: label.slice(0, CARD_DISPLAY_LABEL_MAX) } : field,
    ),
  };
}

/** "#A1B2C3D4": mesmo número curto da aprovação externa. */
export function cardNumber(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

/** "3 d 4 h", "2 h 10 min", "5 min": tempo desde um instante, curto para o card. */
export function formatElapsed(since: string | Date, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(since).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days} d ${hours % 24} h` : `${days} d`;
}

export function formatShortDate(value: string | Date): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
}
