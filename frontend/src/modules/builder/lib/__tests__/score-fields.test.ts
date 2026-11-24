import { describe, expect, it } from 'vitest';
import { computeCalculatedFieldValues, getFormulaOptionScores } from '../../../forms/formula';
import type { DraftField, DraftSection } from '../../types';
import { applyFieldTypeChoice, fieldTypeChoiceOf, mapDraftToCreatePayload } from '../../types';
import { makeInitialState } from '../../state/builder-reducer';
import { validateDraft } from '../../state/draft.validators';
import { scoreFieldsProblem, syncScoreFields } from '../score-fields';

const SIM_NAO = [
  { id: 'o1', internalValue: 'opcao_1', displayLabel: 'Sim' },
  { id: 'o2', internalValue: 'opcao_2', displayLabel: 'Não' },
];

function question(code: string, options = SIM_NAO): DraftField {
  return {
    id: `f-${code}`,
    code,
    label: code,
    fieldType: 'single_select',
    required: false,
    isSensitive: false,
    options,
    settingsJson: {},
    conditionsJson: {},
    visibilityRules: null,
  };
}

function scoreField(code: string, settingsJson: DraftField['settingsJson']): DraftField {
  return { ...question(code, []), fieldType: 'calculated', settingsJson };
}

function section(id: string, fields: DraftField[]): DraftSection {
  return {
    id,
    serverId: null,
    title: id.toUpperCase(),
    description: '',
    nextSectionId: null,
    nextIsSubmit: true,
    flowPositionX: null,
    flowPositionY: null,
    branches: [],
    fields,
  };
}

const sectionScore = { scoreMode: 'section' as const, formulaDecimals: 1, formulaSuffix: '%' };

describe('syncScoreFields', () => {
  it('"Pontuação da seção" vira CONFORMIDADE das perguntas da seção, com Sim = 1, Não = 0 e N/A fora', () => {
    const [synced] = syncScoreFields([
      section('agua', [
        question('q1'),
        question('q2', [...SIM_NAO, { id: 'o3', internalValue: 'opcao_3', displayLabel: 'Não se Aplica' }]),
        scoreField('pont_agua', sectionScore),
      ]),
    ]);
    const settings = synced.fields[2].settingsJson;
    expect(settings.formula).toBe('CONFORMIDADE({q1}; {q2})');
    expect(settings.optionScores).toEqual({
      q1: { opcao_1: 1, opcao_2: 0 },
      q2: { opcao_1: 1, opcao_2: 0, opcao_3: null },
    });
  });

  it('pergunta nova entra sozinha; a invertida à mão fica; a que saiu da seção sai', () => {
    const [synced] = syncScoreFields([
      section('agua', [
        question('q1'),
        question('nova'),
        scoreField('pont_agua', {
          ...sectionScore,
          formula: 'CONFORMIDADE({q1}; {removida})',
          optionScores: { q1: { opcao_1: 0, opcao_2: 1 }, removida: { opcao_1: 1 } },
        }),
      ]),
    ]);
    const settings = synced.fields[2].settingsJson;
    expect(settings.formula).toBe('CONFORMIDADE({q1}; {nova})');
    expect(settings.optionScores).toEqual({
      q1: { opcao_1: 0, opcao_2: 1 },
      nova: { opcao_1: 1, opcao_2: 0 },
    });
  });

  it('"Resultado da pontuação" junta as pontuações de todas as seções, com marco ou média', () => {
    const sections = [
      section('a', [question('qa'), scoreField('pont_a', sectionScore)]),
      section('b', [question('qb'), scoreField('pont_b', sectionScore)]),
      section('res', [
        scoreField('atingiram', { scoreMode: 'result', scoreResultMeasure: 'reached', scoreMark: 80 }),
        scoreField('media', { scoreMode: 'result', scoreResultMeasure: 'average' }),
      ]),
    ];
    const result = syncScoreFields(sections)[2].fields;
    expect(result[0].settingsJson.formula).toBe('ATINGIRAM(80; {pont_a}; {pont_b})');
    expect(result[1].settingsJson.formula).toBe('MEDIAPREENCHIDOS({pont_a}; {pont_b})');
  });

  it('não mexe no que já está em dia nem em cálculo de fórmula livre', () => {
    const livre = scoreField('total', { formula: '{q1} * 2' });
    const sections = [section('a', [question('q1'), livre])];
    expect(syncScoreFields(sections)[0]).toBe(sections[0]);
    const once = syncScoreFields([section('a', [question('q1'), scoreField('p', sectionScore)])]);
    expect(syncScoreFields(once)[0]).toBe(once[0]);
  });

  it('a fórmula gerada calcula de verdade (mesmo motor do envio)', () => {
    const synced = syncScoreFields([
      section('a', [question('q1'), question('q2'), scoreField('pont_a', sectionScore)]),
      section('b', [question('q3'), scoreField('pont_b', sectionScore)]),
      section('res', [scoreField('geral', { scoreMode: 'result', scoreMark: 70 })]),
    ]);
    const specs = synced
      .flatMap((s) => s.fields)
      .filter((f) => f.fieldType === 'calculated')
      .map((f) => ({
        code: f.code,
        formula: f.settingsJson.formula ?? '',
        decimals: 1,
        optionScores: getFormulaOptionScores(f.settingsJson),
      }));
    const values = computeCalculatedFieldValues(specs, { q1: 'opcao_1', q2: 'opcao_2', q3: 'opcao_1' });
    expect(values).toEqual({ pont_a: 50, pont_b: 100, geral: 50 });
  });
});

describe('scoreFieldsProblem e validação ao salvar', () => {
  it('pontuação sem pergunta de escolha na seção não salva, com mensagem clara', () => {
    const sections = [section('vazia', [scoreField('p', sectionScore)])];
    expect(scoreFieldsProblem(sections)).toMatch(/não tem perguntas de escolha/);
  });

  it('resultado sem nenhuma pontuação de seção não salva', () => {
    const sections = [section('a', [question('q1'), scoreField('geral', { scoreMode: 'result' })])];
    expect(scoreFieldsProblem(sections)).toMatch(/precisa de pelo menos uma "Pontuação da seção"/);
  });

  it('validateDraft aceita o formulário sem fórmula escrita à mão', () => {
    const draft = makeInitialState().draft;
    draft.name = 'Checklist';
    draft.description = 'Teste';
    draft.sections = [
      section('a', [question('q1'), scoreField('pont_a', sectionScore)]),
      section('res', [scoreField('geral', { scoreMode: 'result' })]),
    ];
    expect(validateDraft(draft)).toBeNull();
    const payload = mapDraftToCreatePayload(draft);
    expect(payload.sections[1].fields[0].settingsJson).toEqual(
      expect.objectContaining({ scoreMode: 'result', formula: 'ATINGIRAM(70; {pont_a})' }),
    );
  });
});

describe('no seletor de tipos', () => {
  it('os dois aparecem como tipos próprios e trocar para Cálculo mantém a fórmula para editar', () => {
    expect(fieldTypeChoiceOf('calculated', { scoreMode: 'section' })).toBe('section_score');
    expect(fieldTypeChoiceOf('calculated', { scoreMode: 'result' })).toBe('score_result');
    expect(fieldTypeChoiceOf('calculated', { formula: '1' })).toBe('calculated');

    const toResult = applyFieldTypeChoice('score_result', null);
    expect(toResult).toEqual({
      fieldType: 'calculated',
      settingsJson: expect.objectContaining({ scoreMode: 'result', scoreMark: 70, scoreResultMeasure: 'reached' }),
    });
    const toPlain = applyFieldTypeChoice('calculated', { scoreMode: 'section', formula: 'CONFORMIDADE({q1})' });
    expect(toPlain.settingsJson.scoreMode).toBeUndefined();
    expect(toPlain.settingsJson.formula).toBe('CONFORMIDADE({q1})');
  });
});
