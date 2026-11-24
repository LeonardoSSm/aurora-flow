import type { FieldSettings, FormFieldType, ScoreAlertSettings } from '../../forms/types';
import type { DraftField, DraftSection } from '../types';

/**
 * "Pontuação da seção" e "Resultado da pontuação": no seletor são tipos próprios, mas por baixo são
 * campos calculados com `scoreMode` — gravação, painéis, exportação e o app tratam igual a qualquer
 * cálculo. Quem monta o formulário não escreve fórmula: ela é gerada aqui (syncScoreFields) a partir
 * das perguntas da seção e das pontuações do formulário, ao validar, salvar e na prévia.
 */
export type ScoreMode = 'section' | 'result';
export type ScoreResultMeasure = 'reached' | 'average';

export const DEFAULT_SCORE_MARK = 70;

export type OptionScores = Record<string, Record<string, number | null>>;

export type ScoredChoiceField = {
  code: string;
  label: string;
  options: Array<{ internalValue: string; displayLabel: string }>;
};

const CHOICE_TYPES: ReadonlySet<FormFieldType> = new Set(['single_select', 'multi_select']);

export function scoreModeOf(field: { fieldType: FormFieldType; settingsJson?: FieldSettings | null }): ScoreMode | null {
  if (field.fieldType !== 'calculated') return null;
  const mode = field.settingsJson?.scoreMode;
  return mode === 'section' || mode === 'result' ? mode : null;
}

export function scoreResultMeasureOf(settings: FieldSettings): ScoreResultMeasure {
  return settings.scoreResultMeasure === 'average' ? 'average' : 'reached';
}

export function scoreMarkOf(settings: FieldSettings): number {
  return typeof settings.scoreMark === 'number' && Number.isFinite(settings.scoreMark)
    ? settings.scoreMark
    : DEFAULT_SCORE_MARK;
}

function normalizeLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Pontos padrão de uma pergunta pelo texto das opções: Sim = 1, Não = 0, "Não se aplica"/"N/A" não
 * conta. Outras opções começam em 0 — quem configura ajusta.
 */
export function defaultOptionScores(field: ScoredChoiceField): Record<string, number | null> {
  const scores: Record<string, number | null> = {};
  for (const option of field.options) {
    const label = normalizeLabel(option.displayLabel || option.internalValue);
    if (/^(nao se aplica|n\/?a)$/.test(label)) scores[option.internalValue] = null;
    else scores[option.internalValue] = label === 'sim' ? 1 : 0;
  }
  return scores;
}

/** Inverte os pontos de uma pergunta (Sim 1 / Não 0 vira Sim 0 / Não 1); "não conta" fica igual. */
export function invertOptionScores(scores: Record<string, number | null>): Record<string, number | null> {
  const values = Object.values(scores).filter((value): value is number => value !== null);
  if (values.length === 0) return scores;
  const top = Math.max(...values);
  const bottom = Math.min(...values);
  return Object.fromEntries(
    Object.entries(scores).map(([option, value]) => [option, value === null ? null : top + bottom - value]),
  );
}

/** Perguntas que a "Pontuação da seção" pontua: as de escolha da mesma seção, na ordem dela. */
export function sectionScoreQuestions(fields: DraftField[]): DraftField[] {
  return fields.filter((field) => CHOICE_TYPES.has(field.fieldType) && field.options.length > 0);
}

/**
 * Pontos de cada pergunta: os já configurados, e o padrão para pergunta ou opção nova (entra
 * sozinha). Pergunta que saiu da seção sai daqui também.
 */
export function effectiveSectionScores(settings: FieldSettings, questions: ScoredChoiceField[]): OptionScores {
  const saved = settings.optionScores ?? {};
  const result: OptionScores = {};
  for (const question of questions) {
    const defaults = defaultOptionScores(question);
    const current = saved[question.code] ?? {};
    result[question.code] = Object.fromEntries(
      question.options.map((option) => [
        option.internalValue,
        option.internalValue in current ? current[option.internalValue] : defaults[option.internalValue],
      ]),
    );
  }
  return result;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Gera pontos e fórmula dos campos de pontuação a partir do formulário como ele está:
 * - "Pontuação da seção" = CONFORMIDADE das perguntas de escolha da seção;
 * - "Resultado da pontuação" = ATINGIRAM(marco; ...) ou MEDIAPREENCHIDOS(...) de todas as
 *   pontuações de seção do formulário, na ordem.
 * Sem pergunta (ou sem pontuação de seção), a fórmula fica vazia — a validação explica o porquê.
 */
export function syncScoreFields(sections: DraftSection[]): DraftSection[] {
  const sectionScoreCodes: string[] = [];
  const withSectionScores = sections.map((section) => {
    const questions = sectionScoreQuestions(section.fields);
    let changed = false;
    const fields = section.fields.map((field) => {
      if (scoreModeOf(field) !== 'section') return field;
      sectionScoreCodes.push(field.code);
      const optionScores = effectiveSectionScores(field.settingsJson, questions);
      const formula = questions.length > 0
        ? `CONFORMIDADE(${questions.map((question) => `{${question.code}}`).join('; ')})`
        : '';
      if (field.settingsJson.formula === formula && sameJson(field.settingsJson.optionScores, optionScores)) {
        return field;
      }
      changed = true;
      return { ...field, settingsJson: { ...field.settingsJson, formula, optionScores } };
    });
    return changed ? { ...section, fields } : section;
  });

  const refs = sectionScoreCodes.map((code) => `{${code}}`).join('; ');
  return withSectionScores.map((section) => {
    let changed = false;
    const fields = section.fields.map((field) => {
      if (scoreModeOf(field) !== 'result') return field;
      const formula =
        sectionScoreCodes.length === 0
          ? ''
          : scoreResultMeasureOf(field.settingsJson) === 'average'
            ? `MEDIAPREENCHIDOS(${refs})`
            : `ATINGIRAM(${scoreMarkOf(field.settingsJson)}; ${refs})`;
      if (field.settingsJson.formula === formula) return field;
      changed = true;
      return { ...field, settingsJson: { ...field.settingsJson, formula } };
    });
    return changed ? { ...section, fields } : section;
  });
}

/** O que falta no aviso de pontuação ligado (gatilho ou destinatário), ou null. */
export function scoreAlertProblem(alert: ScoreAlertSettings | undefined): string | null {
  if (!alert?.enabled) return null;
  if (alert.trigger !== 'always' && !alert.sectionsBelow && typeof alert.resultBelow !== 'number') {
    return 'Escolha quando avisar: seção abaixo do limite e/ou resultado abaixo de um valor.';
  }
  const hasRecipient = (alert.recipients ?? []).some((recipient) =>
    recipient.type === 'users' ? recipient.userIds.length > 0 : recipient.value.trim().length > 0,
  );
  if (!hasRecipient) return 'Escolha quem recebe o aviso.';
  return null;
}

/** Mensagem de erro dos campos de pontuação, ou null quando estão prontos para salvar. */
export function scoreFieldsProblem(sections: DraftSection[]): string | null {
  const hasSectionScore = sections.some((section) => section.fields.some((field) => scoreModeOf(field) === 'section'));
  for (const [index, section] of sections.entries()) {
    for (const field of section.fields) {
      const mode = scoreModeOf(field);
      if (mode === 'section' && sectionScoreQuestions(section.fields).length === 0) {
        return `A "${field.label}" da seção "${section.title.trim() || `Seção ${index + 1}`}" não tem perguntas de escolha (com opções) para pontuar.`;
      }
      if (mode === 'result' && !hasSectionScore) {
        return `O "${field.label}" precisa de pelo menos uma "Pontuação da seção" no formulário.`;
      }
      const alertProblem = mode === 'result' ? scoreAlertProblem(field.settingsJson.scoreAlert) : null;
      if (alertProblem) return `Aviso do "${field.label}": ${alertProblem}`;
    }
  }
  return null;
}
