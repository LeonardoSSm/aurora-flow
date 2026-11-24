import {
  fieldToSubmitItem,
  getVisibleSections,
  isValidCnpj,
  isValidCpf,
  resolveAnswers,
  validatePendingFileLabels,
  validatePublicAnswers,
} from './form-runtime';
import { createPendingUpload } from '../../lib/attachment-upload';
import type { PublicForm, PublicFormField } from './types';

function createField(overrides: Partial<PublicFormField>): PublicFormField {
  return {
    id: overrides.id ?? 'field-1',
    code: overrides.code ?? 'campo_1',
    label: overrides.label ?? 'Campo 1',
    fieldType: overrides.fieldType ?? 'short_text',
    required: overrides.required ?? false,
    order: overrides.order ?? 1,
    settingsJson: overrides.settingsJson ?? {},
    conditionsJson: overrides.conditionsJson ?? {},
    options: overrides.options ?? [],
  };
}

function createForm(fields: PublicFormField[]): PublicForm {
  return {
    id: 'form-1',
    name: 'Formulário de teste',
    description: null,
    category: null,
    area: null,
    status: 'published',
    activeVersion: {
      id: 'version-1',
      versionNumber: 1,
      titleDisplay: 'Formulário',
      descriptionDisplay: null,
      settingsJson: { mode: 'single' },
      sections: [
        {
          id: 'section-1',
          title: 'Seção principal',
          description: null,
          order: 1,
          nextSectionId: null,
          nextIsSubmit: true,
          branches: [],
          fields,
        },
      ],
    },
  };
}

describe('public form runtime', () => {
  it('validates CPF and CNPJ helpers with real values', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCnpj('11.444.777/0001-61')).toBe(true);
    expect(isValidCnpj('11.111.111/1111-11')).toBe(false);
  });

  it('ignores hidden conditional fields during validation', () => {
    const triggerField = createField({
      id: 'field-trigger',
      code: 'area',
      label: 'Area',
      fieldType: 'single_select',
      required: true,
      options: [
        { id: '1', internalValue: 'financeiro', displayLabel: 'Financeiro', order: 1 },
        { id: '2', internalValue: 'rh', displayLabel: 'RH', order: 2 },
      ],
    });
    const conditionalField = createField({
      id: 'field-conditional',
      code: 'cnpj_empresa',
      label: 'CNPJ',
      fieldType: 'cnpj',
      required: true,
      conditionsJson: {
        show_if: [{ fieldCode: 'area', operator: 'equals', value: 'financeiro' }],
      },
    });
    const form = createForm([triggerField, conditionalField]);

    const errors = validatePublicAnswers(
      form,
      {
        'field-trigger': 'rh',
        'field-conditional': null,
      },
      {
        area: 'rh',
        cnpj_empresa: null,
      },
    );

    expect(errors).toEqual({});
    expect(getVisibleSections(form, { area: 'rh' })[0]?.fields).toHaveLength(1);
  });

  it('skips a section reachable only via a non-matching branch, and requires it once the branch matches', () => {
    const triggerField = createField({
      id: 'field-trigger',
      code: 'area',
      label: 'Area',
      fieldType: 'single_select',
      required: true,
      options: [
        { id: '1', internalValue: 'financeiro', displayLabel: 'Financeiro', order: 1 },
        { id: '2', internalValue: 'ti', displayLabel: 'TI', order: 2 },
      ],
    });
    const branchField = createField({
      id: 'field-branch',
      code: 'centro_custo',
      label: 'Centro de custo',
      fieldType: 'short_text',
      required: true,
    });

    const form: PublicForm = {
      id: 'form-1',
      name: 'Formulário de teste',
      description: null,
      category: null,
      area: null,
      status: 'published',
      activeVersion: {
        id: 'version-1',
        versionNumber: 1,
        titleDisplay: 'Formulário',
        descriptionDisplay: null,
        settingsJson: { mode: 'single' },
        sections: [
          {
            id: 'section-1',
            title: 'Seção principal',
            description: null,
            order: 1,
            nextSectionId: 'section-final',
            nextIsSubmit: false,
            branches: [
              {
                id: 'branch-1',
                fieldCode: 'area',
                optionValue: 'financeiro',
                checkboxValue: null,
                targetSectionId: 'section-branch',
                targetIsSubmit: false,
              },
            ],
            fields: [triggerField],
          },
          {
            id: 'section-branch',
            title: 'Trilha financeiro',
            description: null,
            order: 2,
            nextSectionId: null,
            nextIsSubmit: true,
            branches: [],
            fields: [branchField],
          },
          {
            id: 'section-final',
            title: 'Seção final',
            description: null,
            order: 3,
            nextSectionId: null,
            nextIsSubmit: true,
            branches: [],
            fields: [],
          },
        ],
      },
    };

    // Trigger answered "ti": the branch doesn't match, so the walk goes straight to section-final,
    // skipping section-branch entirely — its required field is not enforced.
    const errorsHidden = validatePublicAnswers(
      form,
      { 'field-trigger': 'ti', 'field-branch': null },
      { area: 'ti', centro_custo: null },
    );
    expect(errorsHidden).toEqual({});
    expect(getVisibleSections(form, { area: 'ti' }).map((s) => s.id)).toEqual([
      'section-1',
      'section-final',
    ]);

    // Once "financeiro" is selected, the branch matches and section-branch is visited instead.
    const errorsVisible = validatePublicAnswers(
      form,
      { 'field-trigger': 'financeiro', 'field-branch': null },
      { area: 'financeiro', centro_custo: null },
    );
    expect(errorsVisible['field-branch']).toBe('Este campo é obrigatório.');
    expect(getVisibleSections(form, { area: 'financeiro' }).map((s) => s.id)).toEqual([
      'section-1',
      'section-branch',
    ]);
  });

  it('returns inline field errors for visible fields based on settingsJson rules', () => {
    const shortTextField = createField({
      id: 'field-name',
      code: 'nome',
      label: 'Nome',
      fieldType: 'short_text',
      required: true,
      settingsJson: { minLength: 3 },
    });
    const numberField = createField({
      id: 'field-score',
      code: 'pontuacao',
      label: 'Pontuação',
      fieldType: 'number',
      required: true,
      settingsJson: { min: 5, decimals: 0 },
    });
    const form = createForm([shortTextField, numberField]);

    const errors = validatePublicAnswers(
      form,
      {
        'field-name': 'Al',
        'field-score': 4.5,
      },
      {
        nome: 'Al',
        pontuacao: 4.5,
      },
    );

    expect(errors['field-name']).toContain('Mínimo de 3');
    expect(errors['field-score']).toContain('Valor mínimo: 5.');
  });

  it('valida e envia a tabela de produtos, mantendo só os itens com alguma coluna preenchida', () => {
    const productField = createField({
      id: 'field-produtos',
      code: 'produtos',
      label: 'Produtos',
      fieldType: 'product_table',
      required: true,
      settingsJson: {
        productTableColumns: [
          { id: 'quantidade', label: 'Quantidade', type: 'number', filledBy: 'respondent' },
          { id: 'obs', label: 'Observação', type: 'text', filledBy: 'respondent' },
        ],
      },
      options: [
        { id: '1', internalValue: 'caneta', displayLabel: 'Caneta', order: 1 },
        { id: '2', internalValue: 'caderno', displayLabel: 'Caderno', order: 2 },
      ],
    });
    const form = createForm([productField]);
    // Caderno fica sem nenhuma coluna preenchida — o respondente não quer esse produto.
    const rows = [
      { produto: 'Caneta', values: { Quantidade: 10, Observação: 'urgente' } },
      { produto: 'Caderno', values: {} },
    ];

    const errors = validatePublicAnswers(form, { 'field-produtos': rows }, { produtos: rows });
    expect(errors).toEqual({});

    expect(fieldToSubmitItem(productField, rows)).toEqual({
      fieldId: 'field-produtos',
      fieldCode: 'produtos',
      valueJson: [{ produto: 'Caneta', values: { Quantidade: 10, Observação: 'urgente' } }],
    });
  });

  it('cobra ao menos um produto com alguma coluna preenchida quando o campo é obrigatório', () => {
    const productField = createField({
      id: 'field-produtos',
      code: 'produtos',
      label: 'Produtos',
      fieldType: 'product_table',
      required: true,
      options: [{ id: '1', internalValue: 'caneta', displayLabel: 'Caneta', order: 1 }],
    });
    const form = createForm([productField]);
    const rows = [{ produto: 'Caneta', values: {} }];

    const errors = validatePublicAnswers(form, { 'field-produtos': rows }, { produtos: rows });
    expect(errors['field-produtos']).toBe('Este campo é obrigatório.');
  });

  it('mescla os valores fixos do criador só nos produtos que o respondente preencheu', () => {
    const productField = createField({
      id: 'field-produtos',
      code: 'produtos',
      label: 'Produtos',
      fieldType: 'product_table',
      settingsJson: {
        productTableColumns: [
          { id: 'quantidade', label: 'Quantidade', type: 'number', filledBy: 'respondent' },
          { id: 'preco', label: 'Preço', type: 'number', filledBy: 'creator' },
        ],
        productTableProductValues: {
          caneta: { preco: 2.5 },
          caderno: { preco: 5 },
        },
      },
      options: [
        { id: '1', internalValue: 'caneta', displayLabel: 'Caneta', order: 1 },
        { id: '2', internalValue: 'caderno', displayLabel: 'Caderno', order: 2 },
      ],
    });
    // Só a Caneta foi preenchida pelo respondente — o Caderno não deve entrar na
    // submissão mesmo tendo um preço fixo configurado, porque não foi "escolhido".
    const rows = [
      { produto: 'Caneta', values: { Quantidade: 3 } },
      { produto: 'Caderno', values: {} },
    ];

    expect(fieldToSubmitItem(productField, rows)).toEqual({
      fieldId: 'field-produtos',
      fieldCode: 'produtos',
      valueJson: [{ produto: 'Caneta', values: { Quantidade: 3, Preço: 2.5 } }],
    });
  });

  it('skips file_upload fields and empty text answers on submit mapping', () => {
    const uploadField = createField({
      id: 'field-file',
      code: 'anexo',
      label: 'Anexo',
      fieldType: 'file_upload',
    });
    const emptyTextField = createField({
      id: 'field-empty',
      code: 'observacoes',
      label: 'Observações',
      fieldType: 'long_text',
    });

    // file_upload is always skipped — files are uploaded separately after form submission
    expect(fieldToSubmitItem(uploadField, null)).toBeNull();
    expect(fieldToSubmitItem(uploadField, [])).toBeNull();

    expect(fieldToSubmitItem(emptyTextField, '   ')).toBeNull();
  });
});

describe('resolveAnswers — campos calculados', () => {
  const quantidade = createField({ id: 'f-qtd', code: 'quantidade', fieldType: 'number' });
  const preco = createField({ id: 'f-preco', code: 'preco', fieldType: 'currency' });
  const subtotal = createField({
    id: 'f-subtotal',
    code: 'subtotal',
    fieldType: 'calculated',
    settingsJson: { formula: '{quantidade} * {preco}', formulaDecimals: 2 },
  });
  const total = createField({
    id: 'f-total',
    code: 'total',
    fieldType: 'calculated',
    required: true,
    settingsJson: { formula: '{subtotal} * 1.1', formulaDecimals: 2 },
  });
  const form = createForm([quantidade, preco, subtotal, total]);

  it('deriva o valor do cálculo e o encadeia com outro cálculo', () => {
    const resolved = resolveAnswers(form, { 'f-qtd': 4, 'f-preco': 'R$ 25,00' });

    expect(resolved.answersById['f-subtotal']).toBe(100);
    expect(resolved.answersById['f-total']).toBe(110);
    expect(resolved.answersByCode.subtotal).toBe(100);
  });

  it('mantém o cálculo em branco enquanto as origens estão vazias', () => {
    const resolved = resolveAnswers(form, {});
    expect(resolved.answersById['f-subtotal']).toBeNull();
  });

  it('envia o cálculo como número na submissão', () => {
    const resolved = resolveAnswers(form, { 'f-qtd': 4, 'f-preco': 25 });
    expect(fieldToSubmitItem(subtotal, resolved.answersById['f-subtotal'])).toEqual({
      fieldId: 'f-subtotal',
      fieldCode: 'subtotal',
      valueNumber: 100,
    });
  });

  it('cobra os campos de origem quando o cálculo obrigatório fica vazio', () => {
    const resolved = resolveAnswers(form, {});
    const errors = validatePublicAnswers(form, resolved.answersById, resolved.answersByCode);
    expect(errors['f-total']).toBe('Preencha os campos usados neste cálculo.');
  });

  it('não acusa erro quando o cálculo obrigatório tem valor', () => {
    const resolved = resolveAnswers(form, { 'f-qtd': 1, 'f-preco': 10 });
    const errors = validatePublicAnswers(form, resolved.answersById, resolved.answersByCode);
    expect(errors['f-total']).toBeUndefined();
  });
});

describe('public form runtime — Lista do ERP', () => {
  const erpField = createField({
    id: 'field-erp',
    code: 'cliente',
    label: 'Cliente',
    fieldType: 'erp_lookup',
    required: true,
    settingsJson: { modo: 'pesquisa', minCaracteres: 3 },
  });

  it('envia só o código; o nome fica no navegador só para mostrar a escolha', () => {
    expect(fieldToSubmitItem(erpField, { value: '000123', label: 'ACME LTDA' })).toEqual({
      fieldId: 'field-erp',
      fieldCode: 'cliente',
      valueJson: { value: '000123' },
    });
  });

  it('sem escolha não envia nada', () => {
    expect(fieldToSubmitItem(erpField, null)).toBeNull();
    expect(fieldToSubmitItem(erpField, { value: '  ', label: 'x' })).toBeNull();
  });

  it('obrigatório sem escolha é cobrado; com escolha passa', () => {
    const form = createForm([erpField]);

    expect(validatePublicAnswers(form, {}, {})).toEqual({ 'field-erp': 'Este campo é obrigatório.' });
    expect(
      validatePublicAnswers(
        form,
        { 'field-erp': { value: '000123', label: 'ACME LTDA' } },
        { cliente: { value: '000123', label: 'ACME LTDA' } },
      ),
    ).toEqual({});
  });
});

describe('cálculo escondido de quem responde', () => {
  const pergunta = createField({
    id: 'q1',
    code: 'q1',
    fieldType: 'single_select',
    options: [
      { id: 'o1', internalValue: 'opcao_1', displayLabel: 'Sim', order: 1 },
      { id: 'o2', internalValue: 'opcao_2', displayLabel: 'Não', order: 2 },
    ],
  });
  const nota = createField({
    id: 'nota',
    code: 'nota',
    fieldType: 'calculated',
    required: true,
    settingsJson: {
      formula: 'CONFORMIDADE({q1})',
      optionScores: { q1: { opcao_1: 1, opcao_2: 0 } },
      hideFromRespondent: true,
    },
  });

  function formWithResult(): PublicForm {
    const form = createForm([pergunta, nota]);
    form.activeVersion.sections[0].nextSectionId = 'resultado';
    form.activeVersion.sections[0].nextIsSubmit = false;
    form.activeVersion.sections.push({
      id: 'resultado',
      title: 'RESULTADO',
      description: 'Só para quem consulta',
      order: 2,
      nextSectionId: null,
      nextIsSubmit: true,
      branches: [],
      fields: [
        createField({
          id: 'geral',
          code: 'geral',
          fieldType: 'calculated',
          settingsJson: { formula: 'ATINGIRAM(70; {nota})', hideFromRespondent: true },
        }),
      ],
    });
    return form;
  }

  it('não aparece, e a seção só com campos escondidos sai do caminho de quem responde', () => {
    const sections = getVisibleSections(formWithResult(), {});
    expect(sections.map((section) => section.id)).toEqual(['section-1']);
    expect(sections[0].fields.map((field) => field.code)).toEqual(['q1']);
  });

  it('continua calculado (para condições) e não trava o envio, mesmo obrigatório', () => {
    const form = formWithResult();
    const { answersByCode, answersById } = resolveAnswers(form, {});
    expect(validatePublicAnswers(form, answersById, answersByCode)).toEqual({});
    expect(resolveAnswers(form, { q1: 'opcao_1' }).answersByCode.nota).toBe(100);
  });

  it('sem a opção, aparece como sempre', () => {
    const visivel = { ...nota, settingsJson: { ...nota.settingsJson, hideFromRespondent: undefined } };
    expect(getVisibleSections(createForm([pergunta, visivel]), {})[0].fields).toHaveLength(2);
  });
});

describe('validatePendingFileLabels (nome ou descrição em cada arquivo)', () => {
  const foto = createField({ id: 'f-foto', code: 'foto', fieldType: 'file_upload', settingsJson: {} });
  const livre = createField({
    id: 'f-livre',
    code: 'livre',
    fieldType: 'file_upload',
    settingsJson: { requireFileLabel: false },
  });
  const sections = createForm([foto, livre]).activeVersion.sections;
  const file = (name: string) => new File(['x'], name, { type: 'image/jpeg' });

  it('aponta o campo com arquivo sem nome novo nem descrição (padrão = exige)', () => {
    const errors = validatePendingFileLabels(sections, {
      'f-foto': [{ ...createPendingUpload(file('a.jpg')), description: 'ok' }, createPendingUpload(file('b.jpg'))],
    });
    expect(errors).toEqual({ 'f-foto': 'Dê um nome novo ou uma descrição a cada arquivo.' });
  });

  it('todos identificados, campo sem arquivo ou exigência desligada = sem erro', () => {
    expect(
      validatePendingFileLabels(sections, {
        'f-foto': [{ ...createPendingUpload(file('a.jpg')), name: 'Etiqueta' }],
        'f-livre': [createPendingUpload(file('c.jpg'))],
      }),
    ).toEqual({});
    expect(validatePendingFileLabels(sections, {})).toEqual({});
  });
});
