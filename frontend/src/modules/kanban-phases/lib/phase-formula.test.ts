import { describe, expect, it } from 'vitest';
import type { PhaseFieldValue } from '../../solicitations/services/solicitations-api';
import type { KanbanPhase, KanbanPhaseField } from '../types';
import { formatPhaseValue } from '../components/phase-field-values-summary';
import { applyPhaseTypeChoice, PHASE_FIELD_TYPE_GROUPS, phaseFieldTypeDef } from './phase-field-types';
import { previewPhaseCalculations, withPhaseCalculatedFormat } from './phase-formula';

function field(
  id: string,
  code: string,
  fieldType: KanbanPhaseField['fieldType'],
  formula?: string,
  extra: Record<string, unknown> = {},
): KanbanPhaseField {
  return {
    id,
    code,
    label: code,
    fieldType,
    required: false,
    order: 0,
    settingsJson: formula ? { formula, ...extra } : null,
    optionsJson: null,
  };
}

function phase(id: string, fields: KanbanPhaseField[]): KanbanPhase {
  return {
    id,
    formId: 'form',
    key: id,
    label: id,
    color: 'blue',
    description: null,
    order: 0,
    isTerminal: false,
    actorRoleCode: null,
    requiresApproval: false,
    approverRoleCode: null,
    fields,
  };
}

const answer = (fieldCode: string, valueText: string | null, valueNumber: number | null = null) => ({
  fieldCode,
  valueText,
  valueNumber,
  valueBoolean: null,
  valueJson: null,
});

describe('previewPhaseCalculations', () => {
  const phases = [
    phase('cotacao', [field('f-frete', 'frete', 'currency')]),
    phase('compra', [
      field('f-desconto', 'desconto', 'currency'),
      field('f-total', 'total', 'calculated', '{valor} + {frete} - {desconto}'),
      field('f-imposto', 'com_imposto', 'calculated', '{total} * 1.1'),
    ]),
  ];

  it('usa o formulário, o que está sendo digitado e o já salvo — o formulário ganha', () => {
    const preview = previewPhaseCalculations({
      phases,
      savedValues: [
        { ...answer('frete', 'R$ 50,00', 50), id: 'v1', solicitationId: 's', phaseFieldId: 'f-frete' },
        { ...answer('valor', null, 1), id: 'v2', solicitationId: 's', phaseFieldId: 'x' },
        { ...answer('total', null, 999), id: 'v3', solicitationId: 's', phaseFieldId: 'f-total' },
      ] as PhaseFieldValue[],
      editingValues: { 'f-desconto': 'R$ 10,00' },
      formAnswers: [answer('valor', 'R$ 1.000,00', 1000)],
    });
    expect(preview).toEqual({ 'f-total': 1040, 'f-imposto': 1144 });
  });

  it('sem cálculo nas fases não calcula nada', () => {
    expect(
      previewPhaseCalculations({ phases: [phases[0]], savedValues: [], editingValues: {}, formAnswers: [] }),
    ).toEqual({});
  });
});

describe('"Total de horas" nos campos de fase', () => {
  it('aparece no seletor logo após a Hora e vira um cálculo em horas, sem R$', () => {
    const dates = PHASE_FIELD_TYPE_GROUPS.find((group) => group.group === 'Números e datas');
    const values = dates?.types.map((type) => type.value) ?? [];
    expect(values.indexOf('hours_total')).toBe(values.indexOf('time') + 1);
    const applied = applyPhaseTypeChoice('hours_total', { formula: '{a} * 2', formulaPrefix: 'R$ ' });
    expect(applied).toEqual({ fieldType: 'calculated', settingsJson: { formula: '', formulaFormat: 'hours' } });
    expect(phaseFieldTypeDef('calculated', applied.settingsJson).label).toBe('Total de horas');
    expect(phaseFieldTypeDef('calculated', { formula: '{a}' }).label).toBe('Cálculo (R$)');
  });

  it('o formato fixo da fase mantém horas e segue em R$ nos outros cálculos', () => {
    expect(withPhaseCalculatedFormat({ formula: 'x', formulaFormat: 'hours', formulaPrefix: 'R$ ', formulaDecimals: 2 })).toEqual({
      formula: 'x',
      formulaFormat: 'hours',
    });
    expect(withPhaseCalculatedFormat({ formula: 'x', formulaSuffix: ' un' })).toEqual({
      formula: 'x',
      formulaSuffix: ' un',
      formulaDecimals: 2,
      formulaPrefix: 'R$ ',
    });
  });

  it('prévia em horas, que entra no valor em R$ sem perder centavo, e o card mostra 8h30', () => {
    const phases = [
      phase('atendimento', [
        field('f-chegada', 'chegada', 'time'),
        field('f-saida', 'saida', 'time'),
        field('f-horas', 'total_horas', 'calculated', 'DURACAO({chegada}; {saida})', { formulaFormat: 'hours' }),
        field('f-valor', 'valor', 'calculated', '{total_horas} * 250'),
      ]),
    ];
    const preview = previewPhaseCalculations({
      phases,
      savedValues: [],
      editingValues: { 'f-chegada': '08:00', 'f-saida': '08:40' },
      formAnswers: [],
    });
    expect(preview['f-valor']).toBe(166.67);
    const saved = { ...answer('total_horas', null, 8.5), id: 'v', solicitationId: 's', phaseFieldId: 'f-horas' } as PhaseFieldValue;
    expect(formatPhaseValue(saved, phases[0].fields[2])).toBe('8h30');
    expect(formatPhaseValue({ ...saved, valueNumber: 150 }, phases[0].fields[3])).toMatch(/^R\$\s150,00$/);
  });
});
