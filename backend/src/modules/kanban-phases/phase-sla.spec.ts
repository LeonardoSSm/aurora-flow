import {
  addBusinessMinutes,
  businessMinutesBetween,
  computePhaseDueAt,
  hasPhaseSla,
  phaseSlaProgress,
  warningPercentOf,
} from './phase-sla';

/** Horário de Brasília (UTC−3) → instante. */
const brt = (iso: string) => new Date(`${iso}-03:00`);

describe('prazo da fase — horas úteis (seg–sex, 08h–18h Brasília)', () => {
  it('dentro do expediente soma direto; passa do fim do dia para a manhã seguinte', () => {
    // quarta 2026-10-14
    expect(addBusinessMinutes(brt('2026-10-14T09:00:00'), 120)).toEqual(brt('2026-10-14T11:00:00'));
    expect(addBusinessMinutes(brt('2026-10-14T17:00:00'), 120)).toEqual(brt('2026-10-15T09:00:00'));
  });

  it('fora do expediente começa no próximo; sexta à tarde vira segunda', () => {
    expect(addBusinessMinutes(brt('2026-10-14T20:00:00'), 60)).toEqual(brt('2026-10-15T09:00:00'));
    expect(addBusinessMinutes(brt('2026-10-14T06:00:00'), 60)).toEqual(brt('2026-10-14T09:00:00'));
    // sexta 16/10 17h + 3h úteis = segunda 19/10 10h
    expect(addBusinessMinutes(brt('2026-10-16T17:00:00'), 180)).toEqual(brt('2026-10-19T10:00:00'));
    // sábado conta a partir de segunda 8h
    expect(addBusinessMinutes(brt('2026-10-17T10:00:00'), 30)).toEqual(brt('2026-10-19T08:30:00'));
  });

  it('conta os minutos úteis entre dois instantes, pulando noite e fim de semana', () => {
    expect(businessMinutesBetween(brt('2026-10-14T09:00:00'), brt('2026-10-14T11:30:00'))).toBe(150);
    expect(businessMinutesBetween(brt('2026-10-16T17:00:00'), brt('2026-10-19T10:00:00'))).toBe(180);
    expect(businessMinutesBetween(brt('2026-10-17T00:00:00'), brt('2026-10-18T23:00:00'))).toBe(0);
    expect(businessMinutesBetween(brt('2026-10-14T11:00:00'), brt('2026-10-14T09:00:00'))).toBe(0);
  });
});

describe('computePhaseDueAt / phaseSlaProgress', () => {
  const entered = brt('2026-10-16T17:00:00'); // sexta 17h

  it('horas corridas x horas úteis', () => {
    expect(computePhaseDueAt(entered, { slaHours: 3, slaBusinessHours: false })).toEqual(brt('2026-10-16T20:00:00'));
    expect(computePhaseDueAt(entered, { slaHours: 3, slaBusinessHours: true })).toEqual(brt('2026-10-19T10:00:00'));
    expect(computePhaseDueAt(entered, { slaHours: null, slaBusinessHours: false })).toBeNull();
  });

  it('no prazo, em alerta a partir do percentual e vencido depois do vencimento', () => {
    const due = brt('2026-10-19T10:00:00');
    const opts = (now: string) => ({ businessHours: true, warningPercent: 80, now: brt(now) });
    // fim de semana não consome prazo útil: 1h de 3h
    expect(phaseSlaProgress(entered, due, opts('2026-10-18T12:00:00'))).toMatchObject({
      state: 'on_track',
      percentUsed: 33.3,
    });
    expect(phaseSlaProgress(entered, due, opts('2026-10-19T09:30:00')).state).toBe('warning');
    const late = phaseSlaProgress(entered, due, opts('2026-10-19T10:30:00'));
    expect(late.state).toBe('breached');
    expect(late.minutesRemaining).toBe(-30);
  });

  it('fase final ou sem horas não tem prazo; aviso padrão é 80%', () => {
    expect(hasPhaseSla({ slaHours: 4, slaBusinessHours: false, slaWarningPercent: null, isTerminal: false })).toBe(true);
    expect(hasPhaseSla({ slaHours: 4, slaBusinessHours: false, slaWarningPercent: null, isTerminal: true })).toBe(false);
    expect(hasPhaseSla({ slaHours: null, slaBusinessHours: false, slaWarningPercent: null, isTerminal: false })).toBe(false);
    expect(warningPercentOf({ slaWarningPercent: null })).toBe(80);
    expect(warningPercentOf({ slaWarningPercent: 50 })).toBe(50);
  });
});
