import { formatHours } from '../../common/formula/formula.engine';
import type {
  KanbanCardDisplay,
  KanbanCardDisplayField,
  KanbanCardIndicator,
} from '../../database/entities/kanban-phase.entity';

/**
 * "Personalizar card" do Kanban: o que o card mostra em cada fase. Vale, nesta ordem, o ajuste da
 * pessoa (user_kanban_card_displays), o padrão da fase (kanban_phases.card_display) e o padrão do
 * sistema — que é o card de antes desta configuração existir.
 */

/** Todos os indicadores, na ordem em que o editor os lista. */
export const CARD_INDICATORS: readonly KanbanCardIndicator[] = [
  'process',
  'priority',
  'value',
  'sla',
  'phase_sla',
  'assignee',
  'updated_at',
  'requester',
  'created_at',
  'time_in_phase',
  'number',
];

/** O card de sempre: os indicadores que já apareciam, sem campos do processo. */
export const DEFAULT_CARD_DISPLAY: KanbanCardDisplay = {
  indicators: ['process', 'priority', 'value', 'sla', 'phase_sla', 'assignee', 'updated_at'],
  fields: [],
};

export const CARD_DISPLAY_MAX_FIELDS = 8;
export const CARD_DISPLAY_LABEL_MAX = 60;
/** Texto de um campo no card: mais que isso vira reticências (o card é estreito). */
const VALUE_MAX = 140;
const FIELD_CODE = /^[a-zA-Z0-9_]{1,120}$/;

/** Tipos que não têm valor para mostrar no card (layout, arquivo). */
export const CARD_DISPLAY_EXCLUDED_TYPES: ReadonlySet<string> = new Set([
  'title',
  'description',
  'divider',
  'file_upload',
  'file_download',
]);

export type CardDisplaySource = 'personal' | 'phase' | 'default';

/** Um campo já formatado no card. */
export type KanbanCardFieldValue = { code: string; label: string; text: string };

/**
 * Configuração gravada como deve ser: indicadores conhecidos sem repetir, campos com código válido
 * sem repetir (até o limite), rótulo aparado ou null. `null` quando a entrada não é um objeto.
 */
export function normalizeCardDisplay(raw: unknown): KanbanCardDisplay | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const input = raw as { indicators?: unknown; fields?: unknown };
  const known = new Set<string>(CARD_INDICATORS);
  const indicators: KanbanCardIndicator[] = [];
  for (const item of Array.isArray(input.indicators) ? input.indicators : []) {
    if (typeof item === 'string' && known.has(item) && !indicators.includes(item as KanbanCardIndicator)) {
      indicators.push(item as KanbanCardIndicator);
    }
  }
  const fields: KanbanCardDisplayField[] = [];
  for (const item of Array.isArray(input.fields) ? input.fields : []) {
    if (!item || typeof item !== 'object') continue;
    const { fieldCode, label } = item as Record<string, unknown>;
    const code = typeof fieldCode === 'string' ? fieldCode.trim() : '';
    if (!FIELD_CODE.test(code) || fields.some((field) => field.fieldCode === code)) continue;
    const text = typeof label === 'string' ? label.trim().slice(0, CARD_DISPLAY_LABEL_MAX) : '';
    fields.push({ fieldCode: code, label: text || null });
    if (fields.length >= CARD_DISPLAY_MAX_FIELDS) break;
  }
  return { indicators, fields };
}

/** O que vale para a pessoa nesta fase, e de onde veio. */
export function effectiveCardDisplay(
  personal: unknown,
  phaseDefault: unknown,
): { display: KanbanCardDisplay; source: CardDisplaySource } {
  const mine = normalizeCardDisplay(personal);
  if (mine) return { display: mine, source: 'personal' };
  const phase = normalizeCardDisplay(phaseDefault);
  if (phase) return { display: phase, source: 'phase' };
  return { display: DEFAULT_CARD_DISPLAY, source: 'default' };
}

/** O que o card precisa saber de um campo para mostrar a resposta como gente lê. */
export type CardFieldMeta = {
  code: string;
  label: string;
  fieldType: string;
  /** valor interno → rótulo, nas listas. */
  options: ReadonlyMap<string, string>;
  /** "Total de horas": cálculo mostrado como 8h30, não R$. */
  hours: boolean;
  /** Nome da fase, quando o campo é preenchido no card e não no formulário de abertura. */
  phaseLabel: string | null;
};

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const NUMBER = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 });
const DATE_TIME = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function clip(text: string): string {
  return text.length > VALUE_MAX ? `${text.slice(0, VALUE_MAX - 1)}…` : text;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value.trim());
  return null;
}

function isEmpty(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0)
  );
}

/** Uma opção (texto, código ou {value,label} da lista do ERP) como rótulo. */
function optionText(value: unknown, meta: CardFieldMeta | undefined): string | null {
  if (typeof value === 'string') return meta?.options.get(value) ?? (value.trim() || null);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value && typeof value === 'object') {
    const { value: code, label } = value as Record<string, unknown>;
    if (typeof label === 'string' && label.trim()) return label.trim();
    if (typeof code === 'string' || typeof code === 'number') return optionText(String(code), meta);
  }
  return null;
}

/**
 * A resposta de um campo como texto curto para o card, ou `null` quando não há o que mostrar.
 * Lista → rótulo da opção; caixa → Sim/Não; R$, número e cálculo no formato brasileiro; data
 * dd/mm/aaaa; tabelas de itens viram a quantidade de itens.
 */
export function formatCardFieldValue(value: unknown, meta: CardFieldMeta | undefined): string | null {
  if (isEmpty(value)) return null;
  const type = meta?.fieldType ?? '';
  if (CARD_DISPLAY_EXCLUDED_TYPES.has(type)) return null;

  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (type === 'checkbox' && (value === 'true' || value === 'false')) return value === 'true' ? 'Sim' : 'Não';

  if (type === 'item_order' || type === 'erp_table' || type === 'product_table') {
    if (!Array.isArray(value)) return null;
    return `${value.length} ${value.length === 1 ? 'item' : 'itens'}`;
  }

  if (type === 'currency' || type === 'calculated' || type === 'number') {
    const number = asNumber(value);
    if (number !== null) {
      if (type === 'number') return NUMBER.format(number);
      if (type === 'calculated' && meta?.hours) return formatHours(number);
      return BRL.format(number);
    }
    // "Valor (R$)" grava o texto que a pessoa viu ("R$ 1.234,56"): mostra como está.
    return typeof value === 'string' ? clip(value.trim()) : null;
  }

  if (type === 'date' && typeof value === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  }
  if (type === 'datetime' && typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return DATE_TIME.format(date).replace(',', '');
  }

  if (Array.isArray(value)) {
    const texts = value.map((item) => optionText(item, meta)).filter((text): text is string => !!text);
    return texts.length ? clip(texts.join(', ')) : null;
  }
  if (typeof value === 'object') {
    const text = optionText(value, meta);
    return text ? clip(text) : null;
  }
  if (typeof value === 'number') return NUMBER.format(value);
  const text = optionText(value, meta);
  return text ? clip(text) : null;
}
