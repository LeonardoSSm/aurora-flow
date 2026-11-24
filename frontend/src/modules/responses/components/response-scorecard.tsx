import { useState } from 'react';
import type { ResponseScorecard } from '../utils/response-scorecard';

export type ScorecardUnit = 'percent' | 'points';

/** Escolha "% | Pontos" lembrada por pessoa, neste navegador. */
export const SCORECARD_UNIT_STORAGE_KEY = 'tijucaflow.scorecard.unit';

function readUnit(): ScorecardUnit {
  try {
    return window.localStorage.getItem(SCORECARD_UNIT_STORAGE_KEY) === 'points' ? 'points' : 'percent';
  } catch {
    return 'percent';
  }
}

function useScorecardUnit(): [ScorecardUnit, (unit: ScorecardUnit) => void] {
  const [unit, setUnit] = useState<ScorecardUnit>(readUnit);
  return [
    unit,
    (next) => {
      setUnit(next);
      try {
        window.localStorage.setItem(SCORECARD_UNIT_STORAGE_KEY, next);
      } catch {
        // Sem armazenamento (aba anônima, bloqueado): vale só nesta tela.
      }
    },
  ];
}

function UnitToggle({ unit, onChange }: { unit: ScorecardUnit; onChange: (unit: ScorecardUnit) => void }) {
  const option = (value: ScorecardUnit, label: string) => (
    <button
      type="button"
      aria-pressed={unit === value}
      onClick={() => onChange(value)}
      className={[
        'rounded-md px-2.5 py-1 text-xs font-bold transition-colors',
        unit === value ? 'bg-primary text-white' : 'text-tx-secondary hover:text-tx-primary',
      ].join(' ')}
    >
      {label}
    </button>
  );
  return (
    <div role="group" aria-label="Mostrar notas em" className="inline-flex rounded-lg border border-border-strong p-0.5">
      {option('percent', '%')}
      {option('points', 'Pontos')}
    </div>
  );
}

function markBadge(reached: boolean | null) {
  if (reached === null) return null;
  return reached ? (
    <span className="inline-flex shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
      Atingiu
    </span>
  ) : (
    <span className="inline-flex shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700 dark:bg-red-900/40 dark:text-red-200">
      Abaixo
    </span>
  );
}

function barColor(reached: boolean | null): string {
  if (reached === true) return 'bg-emerald-500';
  if (reached === false) return 'bg-red-500';
  return 'bg-primary';
}

/**
 * Quadro de pontuação da resposta: o resultado geral em destaque e a nota de cada seção, com barra
 * e a comparação com o marco (quando o resultado usa ATINGIRAM).
 */
export function ResponseScorecardView({ scorecard }: { scorecard: ResponseScorecard }) {
  const [unit, setUnit] = useScorecardUnit();
  // Só oferece "Pontos" quando há o que mostrar em pontos (notas vindas de pontos por opção).
  const hasPoints =
    scorecard.sections.some((row) => row.pointsText) || scorecard.results.some((row) => row.pointsText);
  const showPoints = hasPoints && unit === 'points';

  return (
    <section
      aria-label="Resultado da pontuação"
      className="grid gap-3 rounded-xl border border-border-strong bg-bg-surface px-3 py-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-bold text-tx-primary">Resultado da pontuação</h4>
        <div className="flex flex-wrap items-center gap-3">
          {scorecard.mark !== null ? (
            <span className="text-xs text-tx-secondary">
              Marco: {scorecard.mark.toLocaleString('pt-BR')}% — seção igual ou acima atingiu
            </span>
          ) : null}
          {hasPoints ? <UnitToggle unit={unit} onChange={setUnit} /> : null}
        </div>
      </div>

      {scorecard.results.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {scorecard.results.map((result) => (
            <div key={result.code} className="grid gap-1 rounded-lg bg-surface-container-low px-3 py-2">
              <span className="text-xs font-semibold text-tx-secondary">{result.label}</span>
              <span className="text-xl font-bold text-tx-primary">
                {showPoints && result.pointsText ? result.pointsText : result.formatted}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {scorecard.sections.length > 0 ? (
        <ul className="grid gap-2">
          {scorecard.sections.map((row) => (
            <li key={row.code} className="grid gap-1">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-tx-primary" title={row.label}>
                  {row.label}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {markBadge(row.reachedMark)}
                  <strong className={row.value === null ? 'font-semibold text-tx-secondary' : 'text-tx-primary'}>
                    {showPoints && row.pointsText ? row.pointsText : row.formatted}
                  </strong>
                </span>
              </div>
              {row.value !== null && row.percent ? (
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-bg-hover"
                  role="progressbar"
                  aria-label={row.label}
                  aria-valuenow={row.value}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className={`h-full rounded-full ${barColor(row.reachedMark)}`}
                    style={{ width: `${Math.min(Math.max(row.value, 0), 100)}%` }}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
