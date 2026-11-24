import type {
  KanbanPhaseCardVisibility,
  KanbanPhaseCardVisibilityRule,
  KanbanPhaseEntity,
} from '../../database/entities/kanban-phase.entity';

/** Limites do que se grava (o editor da fase não chega perto disso). */
export const CARD_VISIBILITY_MAX_RULES = 50;
const MAX_VALUES = 100;
const FIELD_CODE = /^[a-zA-Z0-9_]{1,120}$/;

function uniqueTexts(values: unknown, max: number): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const text = value.trim();
    if (text && text.length <= 500) seen.add(text);
    if (seen.size >= max) break;
  }
  return [...seen];
}

/**
 * Grava só regras completas (campo válido, pelo menos um valor e pelo menos um perfil ou usuário).
 * Sem regra nenhuma vira `null` (= filtro desligado, todos veem todos os cards da fase).
 */
export function normalizeCardVisibility(input: unknown): KanbanPhaseCardVisibility | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as { rules?: unknown; othersSeeAll?: unknown };
  const rules: KanbanPhaseCardVisibilityRule[] = [];
  for (const item of Array.isArray(raw.rules) ? raw.rules : []) {
    if (!item || typeof item !== 'object') continue;
    const rule = item as Record<string, unknown>;
    const fieldCode = typeof rule.fieldCode === 'string' ? rule.fieldCode.trim() : '';
    const values = uniqueTexts(rule.values, MAX_VALUES);
    const roleCodes = uniqueTexts(rule.roleCodes, 50);
    const userIds = uniqueTexts(rule.userIds, 200);
    if (!FIELD_CODE.test(fieldCode) || values.length === 0 || roleCodes.length + userIds.length === 0) {
      continue;
    }
    rules.push({ fieldCode, values, roleCodes, userIds });
    if (rules.length >= CARD_VISIBILITY_MAX_RULES) break;
  }
  if (rules.length === 0) return null;
  return { rules, othersSeeAll: raw.othersSeeAll !== false };
}

/** Códigos de campo que as regras da fase leem (para buscar só as respostas necessárias). */
export function cardVisibilityFieldCodes(phase: Pick<KanbanPhaseEntity, 'cardVisibility'>): string[] {
  const config = normalizeCardVisibility(phase.cardVisibility);
  return config ? [...new Set(config.rules.map((rule) => rule.fieldCode))] : [];
}

/** Resposta como lista de textos comparáveis: lista múltipla vira vários; caixa vira "true"/"false". */
export function answerTexts(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap((item) => answerTexts(item));
  if (typeof value === 'boolean') return [value ? 'true' : 'false'];
  if (typeof value === 'number') return Number.isFinite(value) ? [String(value)] : [];
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  // Lista do ERP e afins: o código escolhido e o nome mostrado.
  if (typeof value === 'object') {
    const { value: code, label } = value as Record<string, unknown>;
    return [...answerTexts(typeof code === 'string' ? code : null), ...answerTexts(typeof label === 'string' ? label : null)];
  }
  return [];
}

const comparable = (text: string): string => text.trim().toLocaleLowerCase('pt-BR');

export type CardViewer = { sub: string; role: string };

/**
 * O card desta fase aparece para o usuário? Quem está em pelo menos uma regra (pelo perfil ou
 * pelo nome) só vê os cards cuja resposta casa com UMA das suas regras; quem não está em nenhuma
 * vê todos (`othersSeeAll`) ou nenhum. `seesAll` = quem configura as fases do processo.
 * `answerOf` devolve a resposta do card para um código de campo.
 */
export function canSeeCardInPhase(
  phase: Pick<KanbanPhaseEntity, 'cardVisibility'>,
  viewer: CardViewer,
  seesAll: boolean,
  answerOf: (fieldCode: string) => unknown,
): boolean {
  if (seesAll) return true;
  const config = normalizeCardVisibility(phase.cardVisibility);
  if (!config) return true;
  const mine = config.rules.filter(
    (rule) => rule.roleCodes.includes(viewer.role) || rule.userIds.includes(viewer.sub),
  );
  if (mine.length === 0) return config.othersSeeAll;
  return mine.some((rule) => {
    const answers = new Set(answerTexts(answerOf(rule.fieldCode)).map(comparable));
    return rule.values.some((value) => answers.has(comparable(value)));
  });
}
