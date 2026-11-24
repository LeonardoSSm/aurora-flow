import { FormFieldType } from '../../common/enums/form-field-type.enum';
import {
  computePhaseCalculations,
  normalizePhaseCalculatedSettings,
  normalizePhaseValue,
  phaseFormulaScope,
} from './phase-calculations';
import { normalizeKanbanSettings } from './kanban-settings';

const item = (fieldCode: string, value: Partial<Record<'valueText' | 'valueNumber' | 'valueJson', unknown>>) => ({
  fieldCode,
  valueText: null,
  valueNumber: null,
  valueBoolean: null,
  valueJson: null,
  ...value,
}) as never;

describe('normalizePhaseValue', () => {
  it('"Valor (R$)" guarda o texto que a pessoa viu e também o número', () => {
    expect(normalizePhaseValue(FormFieldType.CURRENCY, { valueText: ' R$ 1.500,75 ' })).toEqual({
      valueText: 'R$ 1.500,75',
      valueNumber: 1500.75,
      valueBoolean: null,
      valueJson: null,
    });
    expect(normalizePhaseValue(FormFieldType.CURRENCY, { valueText: '' })).toMatchObject({
      valueText: null,
      valueNumber: null,
    });
  });

  it('número digitado como texto vira número; outros tipos ficam como vieram', () => {
    expect(normalizePhaseValue(FormFieldType.NUMBER, { valueText: '12,5' })).toMatchObject({
      valueText: null,
      valueNumber: 12.5,
    });
    expect(normalizePhaseValue(FormFieldType.SHORT_TEXT, { valueText: '12,5' })).toMatchObject({
      valueText: '12,5',
      valueNumber: null,
    });
  });
});

describe('phaseFormulaScope', () => {
  it('a resposta do formulário ganha, depois o valor dado por fluxo, por último o campo de fase', () => {
    const scope = phaseFormulaScope(
      [item('valor', { valueText: 'R$ 100,00' })],
      { valor: 'R$ 1,00', frete: '30' },
      [item('valor', { valueNumber: 5 }), item('frete', { valueNumber: 9 }), item('desconto', { valueNumber: 10 })],
    );
    expect(scope).toEqual({ valor: 'R$ 100,00', frete: '30', desconto: 10 });
  });
});

describe('computePhaseCalculations', () => {
  const total = { code: 'total', settingsJson: { formula: '{valor} + {frete} - {desconto}' } };

  it('soma valores do formulário e das fases, em R$ com 2 casas', () => {
    expect(
      computePhaseCalculations([total], { valor: 'R$ 1.234,567', frete: 30, desconto: '0,5' }),
    ).toEqual({ total: 1264.07 });
  });

  it('um cálculo usa outro, e o valor velho do próprio cálculo não entra', () => {
    const comImposto = { code: 'com_imposto', settingsJson: { formula: '{total} * 1.1' } };
    expect(
      computePhaseCalculations([total, comImposto], {
        valor: 100,
        frete: 0,
        desconto: 0,
        total: 999,
        com_imposto: 999,
      }),
    ).toEqual({ total: 100, com_imposto: 110 });
  });

  it('"Total de horas" de fase guarda todas as casas: horas × valor da hora fecha no centavo', () => {
    const horas = { code: 'total_horas', settingsJson: { formula: 'DURACAO({chegada}; {saida})', formulaFormat: 'hours' } };
    const valor = { code: 'valor', settingsJson: { formula: '{total_horas} * 250' } };
    const result = computePhaseCalculations([horas, valor], { chegada: '08:00', saida: '08:40' });
    expect(result.total_horas).toBeCloseTo(2 / 3, 9);
    // Com 2 casas seriam 0,67 h → R$ 167,50; o certo é R$ 166,67.
    expect(result.valor).toBe(166.67);
  });

  it('sem nenhum valor de origem o cálculo fica em branco', () => {
    expect(computePhaseCalculations([total], {})).toEqual({ total: null });
  });
});

describe('normalizePhaseCalculatedSettings', () => {
  it('confere a fórmula e fixa o formato em R$ com 2 casas', () => {
    expect(
      normalizePhaseCalculatedSettings('Total', { formula: ' {a} * 2 ', formulaDecimals: 5, formulaSuffix: '%' }),
    ).toEqual({ formula: '{a} * 2', formulaDecimals: 2, formulaPrefix: 'R$ ', formulaSuffix: '%' });
  });

  it('"Total de horas" fica em horas, sem prefixo, sufixo nem casas', () => {
    expect(
      normalizePhaseCalculatedSettings('Horas', {
        formula: 'DURACAO({chegada}; {saida})',
        formulaFormat: 'hours',
        formulaDecimals: 2,
        formulaPrefix: 'R$ ',
      }),
    ).toEqual({ formula: 'DURACAO({chegada}; {saida})', formulaFormat: 'hours' });
  });

  it('recusa fórmula vazia ou com erro', () => {
    expect(() => normalizePhaseCalculatedSettings('Total', {})).toThrow('O cálculo "Total" está sem fórmula.');
    expect(() => normalizePhaseCalculatedSettings('Total', { formula: '{a} *' })).toThrow(
      /A fórmula do cálculo "Total" tem erro/,
    );
  });
});

describe('normalizeKanbanSettings', () => {
  it('só aceita código de campo válido', () => {
    expect(normalizeKanbanSettings({ cardValueField: ' valor_total ' })).toEqual({ cardValueField: 'valor_total' });
    expect(normalizeKanbanSettings({ cardValueField: 'valor total' })).toEqual({ cardValueField: null });
    expect(normalizeKanbanSettings(null)).toEqual({ cardValueField: null });
  });
});
