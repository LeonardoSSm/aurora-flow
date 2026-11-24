import { describe, expect, it } from 'vitest';
import type { KanbanPhaseField } from '../types';
import { missingRequiredToExit, phaseExitBlockers, phaseExitHint } from './phase-required-exit';

function field(id: string, overrides: Partial<KanbanPhaseField> = {}): KanbanPhaseField {
  return {
    id,
    code: id,
    label: id.toUpperCase(),
    fieldType: 'short_text',
    required: true,
    order: 0,
    settingsJson: null,
    optionsJson: null,
    ...overrides,
  };
}

function saved(phaseFieldId: string, patch: object) {
  return { phaseFieldId, valueText: null, valueNumber: null, valueBoolean: null, valueJson: null, ...patch };
}

describe('missingRequiredToExit', () => {
  const fields = [
    field('nota', { order: 0 }),
    field('conferido', { fieldType: 'checkbox', order: 1 }),
    field('obs', { required: false, order: 2 }),
    field('dados', { fieldType: 'title', order: 3 }),
    field('total', { fieldType: 'calculated', order: 4 }),
    field('pedido', { fieldType: 'item_order', order: 5 }),
  ];

  it('sem a trava na fase, nada segura o card', () => {
    expect(missingRequiredToExit({ fields, requireFieldsToExit: false }, [])).toEqual([]);
    expect(missingRequiredToExit({ fields }, [])).toEqual([]);
  });

  it('lista os obrigatórios em branco na ordem; layout, cálculo e opcional ficam de fora', () => {
    const missing = missingRequiredToExit({ fields, requireFieldsToExit: true }, [
      saved('nota', { valueText: '  ' }),
      saved('conferido', { valueBoolean: false }),
      saved('pedido', { valueJson: { rows: [] } }),
    ]);
    expect(missing.map((f) => f.id)).toEqual(['nota', 'conferido', 'pedido']);
  });

  it('preenchidos saem da lista (número zero conta como preenchido)', () => {
    const missing = missingRequiredToExit(
      { fields: [...fields, field('peso', { fieldType: 'number', order: 6 })], requireFieldsToExit: true },
      [
        saved('nota', { valueText: 'NF 1' }),
        saved('conferido', { valueBoolean: true }),
        saved('pedido', { valueJson: { rows: [{ key: 'a' }] } }),
        saved('peso', { valueNumber: 0 }),
      ],
    );
    expect(missing).toEqual([]);
  });

  it('obrigatório de seção fora do caminho do formulário não é cobrado', () => {
    const branchFields = [
      field('tipo', { fieldType: 'single_select', order: 0 }),
      field('sec_importacao', { fieldType: 'title', required: false, order: 1 }),
      field('incoterm', { order: 2 }),
      field('sec_fechamento', { fieldType: 'title', required: false, order: 3 }),
      field('valor', { order: 4 }),
    ];
    const phase = {
      fields: branchFields,
      requireFieldsToExit: true,
      sectionFlow: [
        {
          section: '__inicio__',
          next: 'sec_fechamento',
          branches: [{ fieldCode: 'tipo', optionValue: 'importacao', checkboxValue: null, target: 'sec_importacao' }],
        },
      ],
    };
    expect(missingRequiredToExit(phase, [saved('tipo', { valueText: 'nacional' })]).map((f) => f.id)).toEqual([
      'valor',
    ]);
    expect(missingRequiredToExit(phase, [saved('tipo', { valueText: 'importacao' })]).map((f) => f.id)).toEqual([
      'incoterm',
      'valor',
    ]);
  });
});

describe('phaseExitBlockers + phaseExitHint', () => {
  const fields = [field('nota', { label: 'Nota fiscal' })];

  it('sem responsável numa fase que exige: só o responsável no aviso', () => {
    const blockers = phaseExitBlockers({ fields, requireAssigneeToExit: true }, [], null);
    expect(blockers).toEqual({ needsAssignee: true, missingFields: [] });
    expect(phaseExitHint(blockers)).toBe(
      'Para avançar, atribua um responsável ao card. Voltar para uma fase anterior continua livre.',
    );
  });

  it('as duas travas juntas numa frase só', () => {
    const blockers = phaseExitBlockers({ fields, requireAssigneeToExit: true, requireFieldsToExit: true }, [], null);
    expect(phaseExitHint(blockers)).toBe(
      'Para avançar, atribua um responsável ao card e preencha e salve o campo obrigatório: “Nota fiscal”. Voltar para uma fase anterior continua livre.',
    );
  });

  it('com responsável e sem trava de campos, nada segura', () => {
    const blockers = phaseExitBlockers({ fields, requireAssigneeToExit: true }, [], 'user-1');
    expect(phaseExitHint(blockers)).toBeNull();
    expect(phaseExitHint(phaseExitBlockers({ fields }, [], null))).toBeNull();
  });
});
