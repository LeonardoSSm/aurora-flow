import { useState } from 'react';
import { describeScoreRange, findScoreRange } from '../../forms/score-ranges';
import type { ScoreRange } from '../../forms/types';
import {
  defaultOptionScores,
  invertOptionScores,
  type OptionScores,
  type ScoredChoiceField,
} from '../lib/score-fields';
import { createLocalId } from '../state/draft.helpers';

const INPUT_CLASS =
  'h-8 rounded-[6px] border border-border-strong bg-bg-surface px-2 text-sm text-tx-primary outline-none focus:border-primary';

export type { ScoredChoiceField };

export type FormulaPhaseOption = { id: string; label: string };

/**
 * Pontos por opção: cada pergunta de escolha pontuada vale, na fórmula, os pontos da opção que a
 * pessoa marcar. Os pontos ficam no próprio campo calculado (`settings.optionScores`).
 */
export function OptionScoresEditor({
  choiceFields,
  sectionFieldCodes,
  scores,
  onChange,
  onUseSum,
  onScoreSection,
  locked = false,
}: {
  choiceFields: ScoredChoiceField[];
  /** Perguntas da mesma seção do cálculo, para o atalho "pontuar as perguntas desta seção". */
  sectionFieldCodes?: string[];
  scores: OptionScores;
  onChange: (scores: OptionScores) => void;
  /** Troca a fórmula pela soma de todas as perguntas pontuadas. */
  onUseSum?: () => void;
  /** Pontuou as perguntas da seção pelo atalho: quem chama decide a fórmula (CONFORMIDADE). */
  onScoreSection?: (scores: OptionScores, sectionCodes: string[]) => void;
  /**
   * "Pontuação da seção": as perguntas são as da seção, sempre — sem tirar nem acrescentar
   * pergunta, sem atalhos de fórmula; só os pontos de cada opção.
   */
  locked?: boolean;
}) {
  const scored = choiceFields.filter((field) => field.code in scores);
  const unscored = choiceFields.filter((field) => !(field.code in scores));
  const sectionChoices = choiceFields.filter((field) => sectionFieldCodes?.includes(field.code));

  function setPoints(fieldCode: string, optionValue: string, raw: string) {
    const byOption = { ...(scores[fieldCode] ?? {}) };
    const points = raw.trim() === '' ? Number.NaN : Number(raw.replace(',', '.'));
    if (Number.isFinite(points)) byOption[optionValue] = points;
    else delete byOption[optionValue];
    onChange({ ...scores, [fieldCode]: byOption });
  }

  function setCounts(fieldCode: string, optionValue: string, counts: boolean) {
    const byOption = { ...(scores[fieldCode] ?? {}) };
    // Voltar a contar começa em 0 ponto (apagar faria "Não se aplica" voltar ao padrão, que não conta).
    byOption[optionValue] = counts ? 0 : null;
    onChange({ ...scores, [fieldCode]: byOption });
  }

  function removeField(fieldCode: string) {
    const next = { ...scores };
    delete next[fieldCode];
    onChange(next);
  }

  function scoreSection() {
    const next = { ...scores };
    // Pergunta já pontuada (ex.: invertida à mão) fica como está.
    for (const field of sectionChoices) {
      if (!(field.code in next)) next[field.code] = defaultOptionScores(field);
    }
    onScoreSection?.(next, sectionChoices.map((field) => field.code));
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-tx-secondary">Pontos por opção</span>
        <div className={locked ? 'hidden' : 'flex flex-wrap gap-1.5'}>
          {onScoreSection && sectionChoices.length > 0 ? (
            <button
              type="button"
              onClick={scoreSection}
              title="Sim = 1, Não = 0 e Não se aplica não conta; a fórmula vira CONFORMIDADE das perguntas da seção"
              className="rounded-[6px] border border-border-strong px-2 py-1 text-xs font-bold text-tx-primary hover:bg-bg-hover"
            >
              Pontuar as perguntas desta seção
            </button>
          ) : null}
          {onUseSum && scored.length > 0 ? (
            <button
              type="button"
              onClick={onUseSum}
              className="rounded-[6px] bg-bg-hover px-2 py-1 text-xs font-semibold text-tx-secondary hover:text-tx-primary"
            >
              Usar a soma das perguntas pontuadas
            </button>
          ) : null}
        </div>
      </div>
      {locked ? null : choiceFields.length === 0 ? (
        <span className="text-xs text-tx-ph">
          Crie perguntas de escolha (única ou múltipla) para dar pontos às opções delas.
        </span>
      ) : (
        <span className="text-xs text-tx-ph">
          Na fórmula, a pergunta vale os pontos da opção escolhida (várias marcadas: a soma).
          Opção sem pontos vale 0; desmarque “conta” numa opção como “Não se aplica” para ela ficar
          fora da CONFORMIDADE.
        </span>
      )}

      {scored.map((field) => (
        <div
          key={field.code}
          className="grid gap-2 rounded-[8px] border border-border-strong bg-bg-surface px-3 py-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 text-sm font-semibold text-tx-primary">
              {field.label || field.code}{' '}
              <span className="font-mono text-[11px] font-normal text-tx-ph">{`{${field.code}}`}</span>
            </span>
            <div className="flex shrink-0 gap-3">
              <button
                type="button"
                onClick={() => onChange({ ...scores, [field.code]: invertOptionScores(scores[field.code] ?? {}) })}
                title="Para pergunta em que “Sim” é a resposta ruim"
                className="text-xs font-semibold text-tx-secondary hover:text-tx-primary"
              >
                Inverter
              </button>
              <button
                type="button"
                hidden={locked}
                onClick={() => removeField(field.code)}
                className="text-xs font-semibold text-tx-secondary hover:text-error"
              >
                Tirar pontos
              </button>
            </div>
          </div>
          {field.options.length === 0 ? (
            <span className="text-xs text-tx-ph">Esta pergunta ainda não tem opções.</span>
          ) : (
            <div className="grid gap-1.5">
              {field.options.map((option) => {
                const name = option.displayLabel || option.internalValue;
                const value = scores[field.code]?.[option.internalValue];
                const counts = value !== null;
                return (
                  <div key={option.internalValue} className="flex items-center justify-between gap-3 text-sm text-tx-primary">
                    <span className="min-w-0 truncate">{name}</span>
                    <div className="flex shrink-0 items-center gap-3">
                      <label className="flex items-center gap-1 text-[11px] font-semibold text-tx-ph">
                        <input
                          type="checkbox"
                          aria-label={`${name} conta na pontuação`}
                          checked={counts}
                          onChange={(event) => setCounts(field.code, option.internalValue, event.target.checked)}
                        />
                        conta
                      </label>
                      <input
                        type="number"
                        aria-label={`Pontos de ${name}`}
                        value={counts ? (value ?? '') : ''}
                        disabled={!counts}
                        onChange={(event) => setPoints(field.code, option.internalValue, event.target.value)}
                        placeholder={counts ? '0' : '—'}
                        className={`${INPUT_CLASS} w-24 text-right disabled:opacity-60`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {!locked && unscored.length > 0 ? (
        <select
          aria-label="Pontuar uma pergunta"
          value=""
          onChange={(event) => {
            const field = unscored.find((item) => item.code === event.target.value);
            if (field) onChange({ ...scores, [field.code]: defaultOptionScores(field) });
          }}
          className={`${INPUT_CLASS} h-9 max-w-xs`}
        >
          <option value="">+ Pontuar uma pergunta…</option>
          {unscored.map((field) => (
            <option key={field.code} value={field.code}>
              {field.label || field.code}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}

function formatNumber(value: number): string {
  return value.toLocaleString('pt-BR');
}

/**
 * Faixas do resultado: no envio do formulário, o card começa na fase da faixa em que o resultado
 * cair. Cada faixa vai do seu início até a próxima (`settings.scoreRanges`).
 */
export function ScoreRangesEditor({
  ranges,
  phaseOptions,
  testValue,
  onChange,
}: {
  ranges: ScoreRange[];
  /** null = processo ainda não salvo (não há fases com id para escolher). */
  phaseOptions: FormulaPhaseOption[] | null;
  /** Resultado do teste logo abaixo, para mostrar em que faixa ele cai. */
  testValue: number | null;
  onChange: (ranges: ScoreRange[]) => void;
}) {
  // Texto do "A partir de" enquanto se digita (ex.: "-" ou "2," ainda não são número).
  const [draftFrom, setDraftFrom] = useState<Record<string, string>>({});
  const sorted = [...ranges].sort((a, b) => a.from - b.from);
  const phaseLabel = (phaseId?: string) =>
    phaseOptions?.find((phase) => phase.id === phaseId)?.label ?? null;
  const testRange = findScoreRange(ranges, testValue);

  function update(id: string, patch: Partial<ScoreRange>) {
    onChange(ranges.map((range) => (range.id === id ? { ...range, ...patch } : range)));
  }

  function addRange() {
    const last = sorted[sorted.length - 1];
    onChange([
      ...ranges,
      { id: createLocalId('faixa'), from: last ? last.from + 10 : 0, phaseId: undefined },
    ]);
  }

  function upperBoundText(range: ScoreRange): string {
    const next = sorted.find((item) => item.from > range.from);
    return next ? `de ${formatNumber(range.from)} até antes de ${formatNumber(next.from)}` : `${formatNumber(range.from)} ou mais`;
  }

  return (
    <div className="grid gap-2">
      <span className="text-xs font-semibold text-tx-secondary">Faixas do resultado</span>
      <span className="text-xs text-tx-ph">
        Ao enviar o formulário, o card começa na fase da faixa em que o resultado cair. Cada faixa
        vai do seu início até a próxima; abaixo da primeira, o card começa na 1ª fase, como sempre.
      </span>
      {phaseOptions === null ? (
        <span className="text-xs font-semibold text-tx-secondary">
          Salve o processo para escolher as fases das faixas.
        </span>
      ) : null}

      {ranges.map((range) => {
        const duplicated = ranges.some((other) => other.id !== range.id && other.from === range.from);
        const missingPhase = phaseOptions !== null && !phaseLabel(range.phaseId);
        return (
          <div
            key={range.id}
            className={[
              'grid gap-2 rounded-[8px] border px-3 py-2.5',
              testRange?.id === range.id ? 'border-primary bg-primary/5' : 'border-border-strong bg-bg-surface',
            ].join(' ')}
          >
            <div className="flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-[11px] font-semibold text-tx-ph">
                A partir de
                <input
                  type="number"
                  value={draftFrom[range.id] ?? String(range.from)}
                  onChange={(event) => {
                    const raw = event.target.value;
                    setDraftFrom((current) => ({ ...current, [range.id]: raw }));
                    const from = Number(raw);
                    if (raw.trim() !== '' && Number.isFinite(from)) update(range.id, { from });
                  }}
                  onBlur={() =>
                    setDraftFrom((current) => {
                      const next = { ...current };
                      delete next[range.id];
                      return next;
                    })
                  }
                  className={`${INPUT_CLASS} w-24`}
                />
              </label>
              <label className="grid min-w-[120px] flex-1 gap-1 text-[11px] font-semibold text-tx-ph">
                Nome (opcional)
                <input
                  value={range.label ?? ''}
                  placeholder="Ex.: Risco alto"
                  onChange={(event) => update(range.id, { label: event.target.value || undefined })}
                  className={INPUT_CLASS}
                />
              </label>
              <label className="grid min-w-[160px] flex-1 gap-1 text-[11px] font-semibold text-tx-ph">
                Card começa na fase
                <select
                  value={range.phaseId ?? ''}
                  disabled={phaseOptions === null}
                  onChange={(event) => update(range.id, { phaseId: event.target.value || undefined })}
                  className={INPUT_CLASS}
                >
                  <option value="">Escolha a fase…</option>
                  {(phaseOptions ?? []).map((phase) => (
                    <option key={phase.id} value={phase.id}>
                      {phase.label}
                    </option>
                  ))}
                  {range.phaseId && phaseOptions && !phaseLabel(range.phaseId) ? (
                    <option value={range.phaseId}>Fase removida</option>
                  ) : null}
                </select>
              </label>
              <button
                type="button"
                aria-label={`Remover faixa ${describeScoreRange(range)}`}
                onClick={() => onChange(ranges.filter((item) => item.id !== range.id))}
                className="h-8 rounded-[6px] px-2 text-xs font-semibold text-tx-secondary hover:text-error"
              >
                Remover
              </button>
            </div>
            <span className="text-[11px] text-tx-ph">{upperBoundText(range)}</span>
            {duplicated ? (
              <span className="text-xs font-semibold text-error">Duas faixas começam no mesmo valor.</span>
            ) : null}
            {missingPhase ? (
              <span className="text-xs font-semibold text-error">Escolha a fase desta faixa.</span>
            ) : null}
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={addRange}
          className="rounded-[6px] bg-bg-hover px-2.5 py-1.5 text-xs font-semibold text-tx-secondary hover:text-tx-primary"
        >
          + Adicionar faixa
        </button>
        {testValue !== null && ranges.length > 0 ? (
          <span className="text-xs text-tx-secondary">
            Com o resultado de teste ({formatNumber(testValue)}):{' '}
            <strong className="text-tx-primary">
              {testRange
                ? `faixa "${describeScoreRange(testRange)}" → ${phaseLabel(testRange.phaseId) ?? 'fase não escolhida'}`
                : 'abaixo da primeira faixa → 1ª fase'}
            </strong>
          </span>
        ) : null}
      </div>
    </div>
  );
}
