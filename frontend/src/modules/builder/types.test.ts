import { describe, expect, it } from 'vitest';
import { makeInitialState } from './state/builder-reducer';
import {
  applyFieldTypeChoice,
  fieldTypeChoiceOf,
  fieldTypeIcon,
  fieldTypeIconOf,
  fieldTypeOptions,
  fieldTypePickerGroups,
  fieldTypePickerOptions,
  getDefaultFieldSettings,
  isDecorativeFieldType,
  mapDraftToCreatePayload,
  normalizeSearchText,
  sanitizeFieldSettings,
  sharedFieldTypeOptions,
} from './types';

describe('mapDraftToCreatePayload — settingsJson', () => {
  it('repassa o settingsJson do rascunho pro payload — sem isso, a configuração nunca chega no backend', () => {
    // Bug real que motivou o teste: "Modo do formulário" (Página única/Multi-etapas)
    // sempre existiu na tela do builder, mas nunca foi enviado no payload de salvar —
    // então nunca teve efeito nenhum, silenciosamente, desde que foi criado.
    const draft = makeInitialState().draft;
    draft.settingsJson = { mode: 'stepper', showResponderIdentification: false };

    const payload = mapDraftToCreatePayload(draft);

    expect(payload.settingsJson).toEqual({ mode: 'stepper', showResponderIdentification: false });
  });

  it('rascunho novo (modo padrão) manda { mode: "single" } — sem identificação desligada por engano', () => {
    const draft = makeInitialState().draft;

    const payload = mapDraftToCreatePayload(draft);

    expect(payload.settingsJson).toEqual({ mode: 'single' });
  });
});

describe('campo calculado com pontos e faixas', () => {
  it('sanitize mantém os pontos das opções e as faixas — sem isso, abrir e salvar o processo os apagaria', () => {
    const settings = {
      formula: 'SOMA({p1}; {p2})',
      formulaDecimals: 0,
      optionScores: { p1: { a: 10, b: 5 } },
      scoreRanges: [{ id: 'r1', from: 20, label: 'Atenção', phaseId: 'fase-1' }],
    };
    expect(sanitizeFieldSettings('calculated', settings)).toEqual(
      expect.objectContaining({
        optionScores: settings.optionScores,
        scoreRanges: settings.scoreRanges,
      }),
    );
  });

  it('sanitize mantém o "mostrar para quem responde" desligado', () => {
    expect(sanitizeFieldSettings('calculated', { formula: '1', hideFromRespondent: true }).hideFromRespondent).toBe(true);
  });
});

describe('Lista do ERP no construtor', () => {
  it('padrão: modo pesquisa, 3 caracteres, login desligado', () => {
    expect(getDefaultFieldSettings('erp_lookup')).toEqual({
      modo: 'pesquisa',
      minCaracteres: 3,
      exigirLogin: false,
    });
  });

  it('sanitize mantém conector, lista e o resto da configuração', () => {
    expect(
      sanitizeFieldSettings('erp_lookup', {
        erpConnectorId: 'conn-1',
        fonte: 'clientes',
        modo: 'lista',
        minCaracteres: 99,
        exigirLogin: true,
        placeholder: 'Busque o cliente',
        maxLength: 10,
      }),
    ).toEqual({
      erpConnectorId: 'conn-1',
      fonte: 'clientes',
      modo: 'lista',
      minCaracteres: 20,
      exigirLogin: true,
      placeholder: 'Busque o cliente',
    });
  });

  it('fica fora dos tipos de campo de fase e de pergunta padrão', () => {
    expect(fieldTypeOptions.some((option) => option.value === 'erp_lookup')).toBe(true);
    expect(sharedFieldTypeOptions.some((option) => option.value === 'erp_lookup')).toBe(false);
  });
});

describe('fieldTypeIcon', () => {
  it('tem um ícone para cada opção do seletor de tipo, inclusive a lista suspensa', () => {
    for (const option of fieldTypePickerOptions) {
      expect(fieldTypeIcon[option.value], option.value).toBeTruthy();
    }
  });

  it('campo de seleção mostrado como lista suspensa usa o ícone da lista suspensa', () => {
    expect(fieldTypeIconOf('single_select', { displayAs: 'dropdown' })).toBe(
      fieldTypeIcon.dropdown_single,
    );
    expect(fieldTypeIconOf('single_select', {})).toBe(fieldTypeIcon.single_select);
  });
});

describe('Total de horas', () => {
  it('é um cálculo em horas, mostrado logo após a Hora', () => {
    const group = fieldTypePickerGroups.find((item) => item.group === 'Data e Hora');
    expect(group?.options.map((option) => option.value)).toEqual(['date', 'time', 'hours_total', 'datetime']);
    const applied = applyFieldTypeChoice('hours_total', { formula: 'DURACAO({a}; {b})' });
    expect(applied.fieldType).toBe('calculated');
    expect(applied.settingsJson).toMatchObject({ formula: 'DURACAO({a}; {b})', formulaFormat: 'hours', formulaDecimals: 4 });
    expect(fieldTypeChoiceOf('calculated', applied.settingsJson)).toBe('hours_total');
  });

  it('sai do formato em horas ao virar um cálculo comum', () => {
    const applied = applyFieldTypeChoice('calculated', { formula: 'DURACAO({a}; {b})', formulaFormat: 'hours' });
    expect(applied.settingsJson.formulaFormat).toBeUndefined();
    expect(fieldTypeChoiceOf('calculated', applied.settingsJson)).toBe('calculated');
  });
});

describe('normalizeSearchText', () => {
  it('ignora maiúsculas e acentos', () => {
    expect(normalizeSearchText('  Seleção Única ')).toBe('selecao unica');
  });
});

describe('Arquivo para baixar', () => {
  const downloadFile = {
    path: '11111111-2222-4333-8444-555555555555/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/Termo.pdf',
    name: 'Termo.pdf',
    size: 2048,
  };

  it('o construtor guarda o arquivo ao carregar/salvar e descarta o resto', () => {
    expect(sanitizeFieldSettings('file_download', { downloadFile, maxFiles: 3 })).toEqual({ downloadFile });
    expect(sanitizeFieldSettings('file_download', {})).toEqual({});
  });

  it('o arquivo chega no payload de salvar', () => {
    const draft = makeInitialState().draft;
    const field = draft.sections[0].fields[0];
    draft.sections[0].fields = [
      { ...field, code: 'termo', label: 'Baixe o termo', fieldType: 'file_download', settingsJson: { downloadFile } },
    ];
    const payload = mapDraftToCreatePayload(draft);
    expect(payload.sections[0].fields[0].settingsJson).toEqual({ downloadFile });
  });

  it('aparece no seletor do formulário, mas não em fase nem pergunta padrão, e não recebe resposta', () => {
    expect(fieldTypeOptions.some((option) => option.value === 'file_download')).toBe(true);
    expect(sharedFieldTypeOptions.some((option) => option.value === 'file_download')).toBe(false);
    expect(isDecorativeFieldType('file_download')).toBe(true);
  });
});

describe('campo de arquivo sem limites, com nome/descrição', () => {
  it('campo novo: sem máx. de arquivos nem de tamanho, e exige nome ou descrição', () => {
    expect(getDefaultFieldSettings('file_upload')).toEqual({
      allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
      requireFileLabel: true,
    });
  });

  it('salvar um campo antigo limpa maxFiles/maxSizeInBytes e mantém a escolha de exigir', () => {
    expect(
      sanitizeFieldSettings('file_upload', {
        allowedMimeTypes: ['application/pdf'],
        maxFiles: 1,
        maxSizeInBytes: 1024,
        requireFileLabel: false,
      }),
    ).toEqual({ allowedMimeTypes: ['application/pdf'], requireFileLabel: false });
    // Campo antigo sem a chave passa a exigir (o padrão).
    expect(sanitizeFieldSettings('file_upload', { allowedMimeTypes: ['application/pdf'] })).toEqual({
      allowedMimeTypes: ['application/pdf'],
      requireFileLabel: true,
    });
  });
});

describe('E-mail de usuário (preset do campo E-mail)', () => {
  it('aparece logo depois do E-mail e vira campo email com sugestões', () => {
    const group = fieldTypePickerGroups.find((item) => item.group === 'Texto e Formato');
    const values = group?.options.map((option) => option.value) ?? [];
    expect(values.indexOf('user_email')).toBe(values.indexOf('email') + 1);

    const applied = applyFieldTypeChoice('user_email', {});
    expect(applied).toEqual({
      fieldType: 'email',
      settingsJson: { userSuggestions: { userIds: [], onlySuggested: false } },
    });
    expect(fieldTypeChoiceOf('email', applied.settingsJson)).toBe('user_email');
    expect(fieldTypeChoiceOf('email', {})).toBe('email');
  });

  it('sanitize guarda ids (sem repetir) e a trava, e larga a lista pública', () => {
    expect(
      sanitizeFieldSettings('email', {
        userSuggestions: { userIds: ['a', 'a', 'b'], onlySuggested: true, users: [{ name: 'X', email: 'x@y' }] },
      }),
    ).toEqual({ userSuggestions: { userIds: ['a', 'b'], onlySuggested: true } });
    expect(sanitizeFieldSettings('email', {})).toEqual({});
  });

  it('voltar para E-mail comum tira as sugestões', () => {
    const applied = applyFieldTypeChoice('email', { userSuggestions: { userIds: ['a'], onlySuggested: true } });
    expect(applied).toEqual({ fieldType: 'email', settingsJson: {} });
  });
});
