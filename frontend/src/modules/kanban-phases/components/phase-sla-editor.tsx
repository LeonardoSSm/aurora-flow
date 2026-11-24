import { Timer } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../../lib/cn';
import { BUSINESS_DAY_HOURS, DEFAULT_PHASE_SLA_WARNING_PERCENT, describePhaseSla } from '../lib/phase-sla';

type Unit = 'hours' | 'days';

export type PhaseSlaDraft = {
  slaHours: number | null;
  slaBusinessHours: boolean;
  slaWarningPercent: number | null;
};

const MAX_HOURS = 8760;

const inputCls =
  'h-9 rounded-[8px] border border-border-default bg-bg-s2 px-2.5 text-sm text-tx-primary outline-none focus:border-primary disabled:opacity-60';

/** Horas de um "dia" no prazo: 24 corridas ou o expediente (10 h úteis). */
function hoursPerDay(businessHours: boolean): number {
  return businessHours ? BUSINESS_DAY_HOURS : 24;
}

function toHours(amount: number, unit: Unit, businessHours: boolean): number {
  const hours = unit === 'days' ? amount * hoursPerDay(businessHours) : amount;
  return Math.min(MAX_HOURS, Math.max(1, Math.round(hours)));
}

function formatAmount(hours: number, unit: Unit, businessHours: boolean): string {
  const amount = unit === 'days' ? hours / hoursPerDay(businessHours) : hours;
  return String(Math.round(amount * 100) / 100).replace('.', ',');
}

/**
 * "Prazo nesta fase": quanto tempo o card pode ficar na fase, contado da entrada nela, em horas
 * corridas ou úteis, e a partir de quantos % ele fica em alerta. Grava sempre em horas.
 */
export function PhaseSlaEditor({
  value,
  isTerminal,
  onChange,
}: {
  value: PhaseSlaDraft;
  isTerminal: boolean;
  onChange: (next: PhaseSlaDraft) => void;
}) {
  const enabled = value.slaHours !== null && !isTerminal;
  const [unit, setUnit] = useState<Unit>(() =>
    value.slaHours && value.slaHours % hoursPerDay(value.slaBusinessHours) === 0 ? 'days' : 'hours',
  );
  // O texto digitado fica local: apagar para digitar outro número não pode virar "1" no meio.
  const [text, setText] = useState(() =>
    value.slaHours ? formatAmount(value.slaHours, unit, value.slaBusinessHours) : '',
  );

  function apply(nextText: string, nextUnit: Unit, businessHours: boolean) {
    setText(nextText);
    const parsed = Number(nextText.replace(',', '.'));
    if (nextText.trim() && Number.isFinite(parsed) && parsed > 0) {
      onChange({ ...value, slaBusinessHours: businessHours, slaHours: toHours(parsed, nextUnit, businessHours) });
    } else if (businessHours !== value.slaBusinessHours) {
      onChange({ ...value, slaBusinessHours: businessHours });
    }
  }

  return (
    <div className="grid gap-3 rounded-[10px] border border-border-default p-3">
      <label className="flex items-start gap-2 text-sm text-tx-primary">
        <input
          type="checkbox"
          checked={enabled}
          disabled={isTerminal}
          onChange={(event) => {
            if (event.target.checked) {
              setUnit('days');
              setText('1');
              onChange({ slaHours: 24, slaBusinessHours: false, slaWarningPercent: null });
            } else {
              onChange({ slaHours: null, slaBusinessHours: false, slaWarningPercent: null });
            }
          }}
          className="mt-0.5 h-4 w-4 rounded border-border-default"
        />
        <span>
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <Timer className="h-4 w-4 text-tx-secondary" />
            Prazo nesta fase
          </span>
          <span className="block text-xs text-tx-secondary">
            {isTerminal
              ? 'Fase final não tem prazo: o card já terminou.'
              : 'Conta a partir da entrada do card na fase. O card mostra quanto falta, e quem atua na fase é avisado no alerta e no vencimento. Mudar o prazo vale na hora para os cards que já estão nela.'}
          </span>
        </span>
      </label>

      {enabled && value.slaHours !== null ? (
        <div className="grid gap-3 pl-6">
          <div className="flex flex-wrap items-end gap-2">
            <input
              type="text"
              inputMode="decimal"
              aria-label="Prazo da fase"
              value={text}
              onChange={(event) => apply(event.target.value, unit, value.slaBusinessHours)}
              onBlur={() => setText(formatAmount(value.slaHours ?? 1, unit, value.slaBusinessHours))}
              className={cn(inputCls, 'w-20')}
            />
            <select
              aria-label="Unidade do prazo"
              value={unit}
              onChange={(event) => {
                const next = event.target.value as Unit;
                setUnit(next);
                apply(text, next, value.slaBusinessHours);
              }}
              className={inputCls}
            >
              <option value="hours">horas</option>
              <option value="days">{value.slaBusinessHours ? 'dias úteis' : 'dias'}</option>
            </select>
            <select
              aria-label="Como conta o prazo"
              value={value.slaBusinessHours ? 'business' : 'calendar'}
              onChange={(event) => apply(text, unit, event.target.value === 'business')}
              className={inputCls}
            >
              <option value="calendar">corridas (24h, todos os dias)</option>
              <option value="business">úteis (seg–sex, 8h–18h)</option>
            </select>
          </div>
          <label className="flex flex-wrap items-center gap-2 text-sm text-tx-primary">
            Alerta ao chegar em
            <input
              type="number"
              min={1}
              max={99}
              aria-label="Percentual de alerta"
              value={value.slaWarningPercent ?? DEFAULT_PHASE_SLA_WARNING_PERCENT}
              onChange={(event) => {
                const parsed = Math.round(Number(event.target.value));
                onChange({ ...value, slaWarningPercent: parsed >= 1 && parsed <= 99 ? parsed : null });
              }}
              className={cn(inputCls, 'w-20')}
            />
            % do prazo
          </label>
          <p className="text-[11px] text-tx-muted">
            {`Prazo: ${describePhaseSla(value.slaHours, value.slaBusinessHours)}`}
            {value.slaBusinessHours ? ' (dia útil = 10 h; feriados ainda não são descontados).' : '.'}
          </p>
        </div>
      ) : null}
    </div>
  );
}
