import { describe, expect, it } from 'vitest';
import type { FormDetail } from '../../forms/types';
import type { KanbanPhase } from '../types';
import {
  cardFilterFields,
  cardFilterRuleIssue,
  cardFilterValueLabel,
  cardVisibilityPayload,
  draftFromCardVisibility,
} from './phase-card-filter';

const form = {
  versions: [
    {
      sections: [
        {
          fields: [
            {
              code: 'filial',
              label: 'Filial',
              fieldType: 'multi_select',
              options: [{ internalValue: 'sp', displayLabel: 'São Paulo' }],
            },
            { code: 'arquivo', label: 'Arquivo', fieldType: 'file_upload', options: [] },
            { code: 'aceite', label: 'Aceite', fieldType: 'checkbox', options: [] },
          ],
        },
      ],
    },
  ],
} as unknown as FormDetail;

const phases = [
  {
    label: 'Compra',
    fields: [
      { code: 'filial', label: 'Filial (fase)', fieldType: 'single_select', optionsJson: [] },
      { code: 'fornecedor', label: 'Fornecedor', fieldType: 'single_select', optionsJson: [{ value: 'a', label: 'ACME' }] },
      { code: 'titulo', label: 'Título', fieldType: 'title', optionsJson: null },
    ],
  },
] as unknown as KanbanPhase[];

describe('cardFilterFields', () => {
  it('formulário primeiro (ganha no código repetido), depois fases; só tipos que dá para comparar', () => {
    const fields = cardFilterFields(form, phases);
    expect(fields.map((field) => [field.code, field.kind, field.phaseLabel ?? null])).toEqual([
      ['filial', 'options', null],
      ['aceite', 'checkbox', null],
      ['fornecedor', 'options', 'Compra'],
    ]);
    expect(fields[0].options).toEqual([{ value: 'sp', label: 'São Paulo' }]);
    expect(cardFilterValueLabel(fields[1], 'true')).toBe('Marcado (Sim)');
    expect(cardFilterValueLabel(fields[0], 'mg')).toBe('mg');
  });
});

describe('regras do filtro', () => {
  it('diz o que falta e devolve o formato da API sem o id do rascunho', () => {
    const draft = draftFromCardVisibility({
      rules: [{ fieldCode: 'filial', values: ['sp'], roleCodes: [], userIds: ['u1'] }],
      othersSeeAll: false,
    });
    expect(cardFilterRuleIssue(draft.rules[0])).toBeNull();
    expect(cardFilterRuleIssue({ ...draft.rules[0], values: [] })).toBe('Escolha pelo menos uma resposta.');
    expect(cardFilterRuleIssue({ ...draft.rules[0], userIds: [] })).toBe('Escolha pelo menos um perfil ou usuário.');
    expect(cardVisibilityPayload(draft)).toEqual({
      rules: [{ fieldCode: 'filial', values: ['sp'], roleCodes: [], userIds: ['u1'] }],
      othersSeeAll: false,
    });
    expect(draftFromCardVisibility(null)).toEqual({ rules: [], othersSeeAll: true });
  });
});
