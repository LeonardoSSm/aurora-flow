import {
  AlignLeft,
  Building2,
  Calculator,
  Calendar,
  CalendarClock,
  CircleDollarSign,
  CircleDot,
  ClipboardCheck,
  Clock,
  Database,
  FileDown,
  Hash,
  Heading,
  IdCard,
  ListChecks,
  ListCollapse,
  Mail,
  MapPin,
  Minus,
  Paperclip,
  Phone,
  Sheet,
  ShoppingCart,
  SlidersHorizontal,
  SquareCheck,
  SquareChevronDown,
  Star,
  Target,
  Table,
  Text,
  Timer,
  UserRoundSearch,
  Type,
  type LucideIcon,
} from 'lucide-react';
import { DEFAULT_FORMULA_DECIMALS } from '../forms/formula';
import { DEFAULT_SCORE_MARK, scoreModeOf, syncScoreFields } from './lib/score-fields';
import type {
  CreateFormInput,
  ErpTableInputColumn,
  FieldConditions,
  FieldSettings,
  FormDetail,
  FormFieldType,
  FormVersionSettings,
  ProductTableColumn,
  VisibilityRule,
} from '../forms/types';

export const DEFAULT_PRODUCT_TABLE_COLUMNS: ProductTableColumn[] = [
  { id: 'quantidade', label: 'Quantidade', type: 'number', filledBy: 'respondent' },
];

export type DraftFieldOption = {
  id: string;
  internalValue: string;
  displayLabel: string;
};

export type DraftField = {
  id: string;
  code: string;
  label: string;
  fieldType: FormFieldType;
  required: boolean;
  isSensitive: boolean;
  options: DraftFieldOption[];
  settingsJson: FieldSettings;
  conditionsJson: FieldConditions;
  visibilityRules: VisibilityRule[] | null;
};

export type DraftSectionBranch = {
  id: string;
  fieldCode: string | null;
  optionValue: string | null;
  checkboxValue: boolean | null;
  targetSectionId: string | null;
  targetIsSubmit: boolean;
};

export type DraftSection = {
  id: string;
  /** The real, persisted section id from the last save/load — null for a section
   * created locally that has never been saved. Needed to scope automation rules,
   * which reference a real backend section id. */
  serverId: string | null;
  title: string;
  description: string;
  nextSectionId: string | null;
  nextIsSubmit: boolean;
  /**
   * Posição no canvas da aba Fluxo, em pixel. Nula = nunca posicionada a mão
   * — a tela calcula a linha reta padrão nesse caso.
   */
  flowPositionX: number | null;
  flowPositionY: number | null;
  branches: DraftSectionBranch[];
  fields: DraftField[];
};

export type FormDraft = {
  name: string;
  description: string;
  category: string;
  area: string;
  assignedUserIds: string[];
  googleSheetsEnabled: boolean;
  googleSheetsAutoCreateOnSave: boolean;
  settingsJson: FormVersionSettings;
  sections: DraftSection[];
};

export type BuilderLoadedForm = {
  form: FormDetail | null;
  latestVersionName: string;
};

export type FieldTypeGroupDef = {
  group: string;
  options: Array<{ value: FormFieldType; label: string }>;
};

export const fieldTypeGroups: FieldTypeGroupDef[] = [
  {
    group: 'Texto e Formato',
    options: [
      { value: 'short_text', label: 'Texto Curto' },
      { value: 'long_text', label: 'Texto Longo' },
      { value: 'email', label: 'E-mail' },
      { value: 'phone', label: 'Telefone' },
      { value: 'cep', label: 'CEP' },
    ],
  },
  {
    group: 'Documentos',
    options: [
      { value: 'cpf', label: 'CPF' },
      { value: 'cnpj', label: 'CNPJ' },
    ],
  },
  {
    group: 'Números e Valores',
    options: [
      { value: 'number', label: 'Número' },
      { value: 'currency', label: 'Valor Monetário' },
      { value: 'calculated', label: 'Cálculo (Fórmula)' },
    ],
  },
  {
    group: 'Data e Hora',
    options: [
      { value: 'date', label: 'Data' },
      { value: 'time', label: 'Hora' },
      { value: 'datetime', label: 'Data e Hora' },
    ],
  },
  {
    group: 'Seleção',
    options: [
      { value: 'single_select', label: 'Seleção Única' },
      { value: 'multi_select', label: 'Múltipla Seleção' },
      { value: 'checkbox', label: 'Checkbox' },
      { value: 'erp_lookup', label: 'Lista do ERP' },
    ],
  },
  {
    group: 'Avaliação',
    options: [
      { value: 'scale', label: 'Escala' },
      { value: 'rating', label: 'Avaliação' },
    ],
  },
  {
    group: 'Tabelas e Listas',
    options: [
      { value: 'product_table', label: 'Tabela de Produtos' },
      { value: 'erp_table', label: 'Tabela dinâmica do ERP' },
      { value: 'item_order', label: 'Pedido de itens' },
    ],
  },
  {
    group: 'Outros',
    options: [
      { value: 'file_upload', label: 'Upload de Arquivo' },
      { value: 'file_download', label: 'Arquivo para baixar' },
      { value: 'title', label: 'Título' },
      { value: 'description', label: 'Descrição' },
      { value: 'divider', label: 'Divisor' },
    ],
  },
];

export const fieldTypeOptions: Array<{ value: FormFieldType; label: string }> =
  fieldTypeGroups.flatMap((g) => g.options);

/**
 * "Lista suspensa" aparece no seletor como um tipo à parte, mas é a seleção única/múltipla com
 * `displayAs: 'dropdown'` — validação, exportação, fluxos e painéis tratam igual à seleção.
 */
export type FieldTypePreset =
  | 'dropdown_single'
  | 'dropdown_multi'
  | 'section_score'
  | 'score_result'
  | 'hours_total'
  | 'user_email';
export type FieldTypeChoice = FormFieldType | FieldTypePreset;

export const FIELD_TYPE_PRESETS: Record<
  FieldTypePreset,
  { fieldType: FormFieldType; label: string; settings: FieldSettings }
> = {
  dropdown_single: {
    fieldType: 'single_select',
    label: 'Lista Suspensa',
    settings: { displayAs: 'dropdown' },
  },
  dropdown_multi: {
    fieldType: 'multi_select',
    label: 'Lista Suspensa (várias)',
    settings: { displayAs: 'dropdown' },
  },
  // Pontuação: campos calculados com a fórmula gerada pelo construtor (lib/score-fields.ts).
  section_score: {
    fieldType: 'calculated',
    label: 'Pontuação da seção',
    settings: { scoreMode: 'section', formulaDecimals: 1, formulaSuffix: '%' },
  },
  score_result: {
    fieldType: 'calculated',
    label: 'Resultado da pontuação',
    settings: {
      scoreMode: 'result',
      scoreResultMeasure: 'reached',
      scoreMark: DEFAULT_SCORE_MARK,
      formulaDecimals: 1,
      formulaSuffix: '%',
    },
  },
  // Horas entre dois campos de Hora (ex.: chegada e saída): cálculo com DURACAO e resultado em 8h30.
  // As casas não valem em horas: getFormulaDecimals guarda tudo, para horas × valor da hora fechar
  // no centavo.
  hours_total: {
    fieldType: 'calculated',
    label: 'Total de horas',
    settings: { formulaFormat: 'hours', formulaDecimals: 4 },
  },
  // E-mail que sugere usuários do sistema (todos, ou só as pessoas escolhidas). O valor continua
  // sendo um e-mail: notificações e `{{campo}}` tratam igual ao E-mail.
  user_email: {
    fieldType: 'email',
    label: 'E-mail de usuário',
    settings: { userSuggestions: { userIds: [], onlySuggested: false } },
  },
};

function isFieldTypePreset(choice: FieldTypeChoice): choice is FieldTypePreset {
  return Object.prototype.hasOwnProperty.call(FIELD_TYPE_PRESETS, choice);
}

/**
 * Grupos do seletor de tipo: os tipos de verdade mais a "Lista suspensa" logo após a seleção, as
 * duas de pontuação logo após o cálculo e o "Total de horas" logo após a hora.
 */
export const fieldTypePickerGroups: Array<{
  group: string;
  options: Array<{ value: FieldTypeChoice; label: string }>;
}> = fieldTypeGroups.map((group) =>
  group.group === 'Números e Valores'
    ? {
        ...group,
        options: group.options.flatMap((option) =>
          option.value === 'calculated'
            ? [
                option,
                { value: 'section_score' as const, label: FIELD_TYPE_PRESETS.section_score.label },
                { value: 'score_result' as const, label: FIELD_TYPE_PRESETS.score_result.label },
              ]
            : [option],
        ),
      }
    : group.group === 'Seleção'
    ? {
        ...group,
        options: group.options.flatMap((option) =>
          option.value === 'multi_select'
            ? [
                option,
                { value: 'dropdown_single' as const, label: FIELD_TYPE_PRESETS.dropdown_single.label },
                { value: 'dropdown_multi' as const, label: FIELD_TYPE_PRESETS.dropdown_multi.label },
              ]
            : [option],
        ),
      }
    : group.group === 'Texto e Formato'
    ? {
        ...group,
        options: group.options.flatMap((option) =>
          option.value === 'email'
            ? [option, { value: 'user_email' as const, label: FIELD_TYPE_PRESETS.user_email.label }]
            : [option],
        ),
      }
    : group.group === 'Data e Hora'
    ? {
        ...group,
        options: group.options.flatMap((option) =>
          option.value === 'time'
            ? [option, { value: 'hours_total' as const, label: FIELD_TYPE_PRESETS.hours_total.label }]
            : [option],
        ),
      }
    : group,
);

export const fieldTypePickerOptions = fieldTypePickerGroups.flatMap((group) => group.options);

export function isDropdownField(field: { fieldType: FormFieldType; settingsJson?: FieldSettings | null }) {
  return (
    (field.fieldType === 'single_select' || field.fieldType === 'multi_select') &&
    field.settingsJson?.displayAs === 'dropdown'
  );
}

/** "E-mail de usuário": campo E-mail com sugestões de usuários do sistema. */
export function isUserEmailField(field: { fieldType: FormFieldType; settingsJson?: FieldSettings | null }) {
  return field.fieldType === 'email' && !!field.settingsJson?.userSuggestions;
}

/** O que o seletor de tipo mostra para um campo salvo. */
export function fieldTypeChoiceOf(fieldType: FormFieldType, settings?: FieldSettings | null): FieldTypeChoice {
  const scoreMode = scoreModeOf({ fieldType, settingsJson: settings });
  if (scoreMode) return scoreMode === 'section' ? 'section_score' : 'score_result';
  if (fieldType === 'calculated' && settings?.formulaFormat === 'hours') return 'hours_total';
  if (isUserEmailField({ fieldType, settingsJson: settings })) return 'user_email';
  if (!isDropdownField({ fieldType, settingsJson: settings })) return fieldType;
  return fieldType === 'multi_select' ? 'dropdown_multi' : 'dropdown_single';
}

export function fieldTypeChoiceLabel(fieldType: FormFieldType, settings?: FieldSettings | null): string {
  const choice = fieldTypeChoiceOf(fieldType, settings);
  return fieldTypePickerOptions.find((option) => option.value === choice)?.label ?? fieldType;
}

/** Ícone de cada opção do seletor de tipo — a mesma fonte para o nó do fluxo, a linha e o popover. */
export const fieldTypeIcon: Record<FieldTypeChoice, LucideIcon> = {
  short_text: Type,
  long_text: AlignLeft,
  email: Mail,
  phone: Phone,
  cep: MapPin,
  cpf: IdCard,
  cnpj: Building2,
  number: Hash,
  currency: CircleDollarSign,
  calculated: Calculator,
  date: Calendar,
  time: Clock,
  datetime: CalendarClock,
  single_select: CircleDot,
  multi_select: ListChecks,
  dropdown_single: SquareChevronDown,
  dropdown_multi: ListCollapse,
  section_score: ClipboardCheck,
  score_result: Target,
  hours_total: Timer,
  user_email: UserRoundSearch,
  checkbox: SquareCheck,
  erp_lookup: Database,
  scale: SlidersHorizontal,
  rating: Star,
  product_table: Table,
  erp_table: Sheet,
  item_order: ShoppingCart,
  file_upload: Paperclip,
  file_download: FileDown,
  title: Heading,
  description: Text,
  divider: Minus,
};

/** Ícone de um campo salvo (a "Lista suspensa" usa o ícone dela, não o da seleção). */
export function fieldTypeIconOf(fieldType: FormFieldType, settings?: FieldSettings | null): LucideIcon {
  return fieldTypeIcon[fieldTypeChoiceOf(fieldType, settings)];
}

/**
 * Título, descrição e divisor só organizam o formulário; o "Arquivo para baixar" só entrega um
 * arquivo. Nenhum recebe resposta.
 */
export function isDecorativeFieldType(fieldType: FormFieldType): boolean {
  return (
    fieldType === 'title' ||
    fieldType === 'description' ||
    fieldType === 'divider' ||
    fieldType === 'file_download'
  );
}

/** Texto para busca: minúsculo e sem acento ("Seção" encontra "secao"). */
export function normalizeSearchText(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

/** Tipo e configuração ao escolher uma opção do seletor, partindo da configuração atual. */
export function applyFieldTypeChoice(
  choice: FieldTypeChoice,
  current?: FieldSettings | null,
): { fieldType: FormFieldType; settingsJson: FieldSettings } {
  if (isFieldTypePreset(choice)) {
    const preset = FIELD_TYPE_PRESETS[choice];
    const settingsJson = { ...sanitizeFieldSettings(preset.fieldType, current), ...preset.settings };
    // O formato em horas é o que identifica o "Total de horas": sai ao trocar para outra pontuação.
    if (!preset.settings.formulaFormat) delete settingsJson.formulaFormat;
    return { fieldType: preset.fieldType, settingsJson };
  }
  const settingsJson = sanitizeFieldSettings(choice, current);
  delete settingsJson.displayAs;
  // "E-mail" puro: sem sugestões de usuários.
  delete settingsJson.userSuggestions;
  // "Cálculo (Fórmula)" puro: a fórmula gerada fica, para editar à mão; o modo de pontuação sai.
  delete settingsJson.scoreMode;
  delete settingsJson.scoreResultMeasure;
  delete settingsJson.scoreMark;
  delete settingsJson.formulaFormat;
  return { fieldType: choice, settingsJson };
}

/**
 * Tipos que só existem em formulário: campo de fase e pergunta padrão não aceitam (o backend
 * recusa). "Lista do ERP" é conferida no ERP no envio do formulário, e só lá; o "Pedido de itens"
 * confere os itens na lista também só no envio do formulário.
 */
export const FORM_ONLY_FIELD_TYPES: ReadonlySet<FormFieldType> = new Set([
  'erp_lookup',
  'erp_table',
  'item_order',
  // O arquivo é enviado pelo construtor do formulário de abertura.
  'file_download',
]);

/** Para os editores de campos de fase e de perguntas padrão. */
export const sharedFieldTypeOptions = fieldTypeOptions.filter(
  (option) => !FORM_ONLY_FIELD_TYPES.has(option.value),
);

export const ERP_LOOKUP_MIN_CHARS_DEFAULT = 3;

/** "Pedido de itens" novo: já vem com a quantidade, obrigatória e a partir de 1. */
export const DEFAULT_ITEM_ORDER_INPUT_COLUMNS: ErpTableInputColumn[] = [
  { id: 'quantidade', label: 'Quantidade', type: 'number', required: true, min: 1, decimals: 0 },
];

export function supportsOptions(fieldType: FormFieldType) {
  return (
    fieldType === 'single_select' || fieldType === 'multi_select' || fieldType === 'product_table'
  );
}

export function supportsAdvancedSettings(fieldType: FormFieldType) {
  return [
    'number',
    'scale',
    'rating',
    'short_text',
    'long_text',
    'file_upload',
    'date',
    'calculated',
    'product_table',
    'erp_lookup',
    'erp_table',
    'item_order',
  ].includes(fieldType);
}

/** Campo cujo valor vem de uma fórmula — o respondente não digita nada nele. */
export function isCalculatedField(fieldType: FormFieldType) {
  return fieldType === 'calculated';
}

export function getDefaultFieldSettings(fieldType: FormFieldType): FieldSettings {
  switch (fieldType) {
    case 'scale':
    case 'rating':
      return { max: 5 };
    case 'file_upload':
      return {
        allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
        requireFileLabel: true,
      };
    case 'calculated':
      return { formula: '', formulaDecimals: DEFAULT_FORMULA_DECIMALS };
    case 'product_table':
      return { productTableColumns: DEFAULT_PRODUCT_TABLE_COLUMNS };
    case 'erp_lookup':
      // Decisão de 2026-10-07: login começa desligado.
      return { modo: 'pesquisa', minCaracteres: ERP_LOOKUP_MIN_CHARS_DEFAULT, exigirLogin: false };
    case 'erp_table':
      return { parameterBindings: [], sourceColumns: [], inputColumns: [], exigirLogin: false };
    case 'item_order':
      return { itemColumns: [], inputColumns: DEFAULT_ITEM_ORDER_INPUT_COLUMNS };
    default:
      return {};
  }
}

export function sanitizeFieldSettings(
  fieldType: FormFieldType,
  settingsJson?: FieldSettings | null,
): FieldSettings {
  const current = settingsJson ?? {};
  const base = getDefaultFieldSettings(fieldType);

  if (fieldType === 'single_select' || fieldType === 'multi_select') {
    // Opções vindas de uma lista de itens: o vínculo (e as opções escondidas) acompanham o campo,
    // inclusive ao trocar entre botões, lista suspensa, única e múltipla.
    const linked = current.itemListId
      ? {
          itemListId: current.itemListId,
          ...(current.hiddenOptionValues?.length
            ? { hiddenOptionValues: current.hiddenOptionValues }
            : {}),
        }
      : {};
    return { ...base, ...(current.displayAs === 'dropdown' ? { displayAs: 'dropdown' as const } : {}), ...linked };
  }

  if (fieldType === 'number') {
    return {
      ...base,
      min: current.min,
      max: current.max,
      decimals: current.decimals,
    };
  }

  if (fieldType === 'scale' || fieldType === 'rating') {
    return {
      ...base,
      max: current.max ?? base.max,
    };
  }

  if (fieldType === 'short_text') {
    return {
      ...base,
      minLength: current.minLength,
      maxLength: current.maxLength,
    };
  }

  if (fieldType === 'long_text') {
    return {
      ...base,
      maxLength: current.maxLength,
    };
  }

  if (fieldType === 'file_upload') {
    return {
      ...base,
      // Sem maxSizeInBytes/maxFiles: o campo não limita mais tamanho nem quantidade, e salvar de
      // novo um campo antigo limpa as chaves.
      allowedMimeTypes: current.allowedMimeTypes ?? base.allowedMimeTypes,
      requireFileLabel: current.requireFileLabel ?? base.requireFileLabel,
    };
  }

  if (fieldType === 'email') {
    // "E-mail de usuário": só ids (sem repetir) e a trava; `users` é do formulário publicado.
    const suggestions = current.userSuggestions;
    if (!suggestions) return base;
    return {
      ...base,
      userSuggestions: {
        userIds: [...new Set((suggestions.userIds ?? []).filter((id) => typeof id === 'string' && id))],
        onlySuggested: suggestions.onlySuggested === true,
      },
    };
  }

  if (fieldType === 'file_download') {
    // Só o arquivo enviado; o backend confere o caminho ao salvar.
    return current.downloadFile ? { downloadFile: current.downloadFile } : {};
  }

  if (fieldType === 'date') {
    return {
      ...base,
      minDate: current.minDate,
      maxDate: current.maxDate,
    };
  }

  if (fieldType === 'calculated') {
    return {
      ...base,
      formula: current.formula ?? '',
      formulaDecimals: current.formulaDecimals ?? DEFAULT_FORMULA_DECIMALS,
      formulaPrefix: current.formulaPrefix,
      formulaSuffix: current.formulaSuffix,
      formulaFormat: current.formulaFormat,
      optionScores: current.optionScores,
      scoreRanges: current.scoreRanges,
      scoreMode: current.scoreMode,
      scoreResultMeasure: current.scoreResultMeasure,
      scoreMark: current.scoreMark,
      hideFromRespondent: current.hideFromRespondent,
      scoreLimit: current.scoreLimit,
      scoreAlert: current.scoreAlert,
    };
  }

  if (fieldType === 'product_table') {
    const columns = (current.productTableColumns ?? [])
      .map((column) => ({
        id: column.id,
        label: column.label.trim(),
        type: column.type === 'text' ? ('text' as const) : ('number' as const),
        filledBy: column.filledBy === 'creator' ? ('creator' as const) : ('respondent' as const),
      }))
      .filter((column) => column.label.length > 0);
    return {
      ...base,
      productTableColumns: columns.length > 0 ? columns : DEFAULT_PRODUCT_TABLE_COLUMNS,
      productTableProductValues:
        current.productTableProductValues && typeof current.productTableProductValues === 'object'
          ? current.productTableProductValues
          : undefined,
    };
  }

  if (fieldType === 'erp_lookup') {
    const minCaracteres =
      typeof current.minCaracteres === 'number' && Number.isInteger(current.minCaracteres)
        ? Math.min(Math.max(current.minCaracteres, 2), 20)
        : base.minCaracteres;
    return {
      ...base,
      erpConnectorId: current.erpConnectorId || undefined,
      fonte: current.fonte || undefined,
      modo: current.modo === 'lista' ? 'lista' : 'pesquisa',
      minCaracteres,
      exigirLogin: current.exigirLogin === true,
      placeholder: current.placeholder?.trim() ? current.placeholder : undefined,
    };
  }

  if (fieldType === 'item_order') {
    return {
      ...base,
      itemListId: current.itemListId || undefined,
      itemColumns: current.itemColumns ?? [],
      inputColumns: current.inputColumns ?? base.inputColumns,
      totalPriceColumn: current.totalPriceColumn || undefined,
      totalQuantityColumn: current.totalQuantityColumn || undefined,
    };
  }

  if (fieldType === 'erp_table') {
    return {
      ...base,
      erpConnectorId: current.erpConnectorId || undefined,
      fonte: current.fonte || undefined,
      dataset: current.dataset || undefined,
      parameterBindings: (current.parameterBindings ?? []).filter(
        (binding) => binding.parameter && binding.fieldCode,
      ),
      sourceColumns: current.sourceColumns ?? [],
      inputColumns: current.inputColumns ?? [],
      maxRows: current.maxRows,
      exigirLogin: current.exigirLogin === true,
    };
  }

  return base;
}

export function mapDraftToCreatePayload(draft: FormDraft): CreateFormInput {
  // Campos de pontuação: pontos e fórmula saem do formulário como ele está agora.
  const sections = syncScoreFields(draft.sections);
  const sectionIndexById = new Map(sections.map((section, index) => [section.id, index]));
  const resolveTargetIndex = (targetSectionId: string | null, isSubmit: boolean): number | null =>
    isSubmit || !targetSectionId ? null : (sectionIndexById.get(targetSectionId) ?? null);

  return {
    name: draft.name.trim(),
    description: draft.description.trim() || undefined,
    category: draft.category.trim() || undefined,
    area: draft.area.trim() || undefined,
    assignedUserIds: draft.assignedUserIds,
    googleSheets: {
      enabled: draft.googleSheetsEnabled,
      autoCreateOnSave: draft.googleSheetsAutoCreateOnSave,
    },
    settingsJson: draft.settingsJson,
    sections: sections.map((section) => ({
      title: section.title.trim(),
      description: section.description.trim() || undefined,
      nextSectionIndex: resolveTargetIndex(section.nextSectionId, section.nextIsSubmit),
      flowPositionX: section.flowPositionX,
      flowPositionY: section.flowPositionY,
      branches: section.branches
        .filter((branch) => branch.fieldCode)
        .map((branch) => ({
          fieldCode: branch.fieldCode as string,
          optionValue: branch.optionValue ?? undefined,
          checkboxValue: branch.checkboxValue ?? undefined,
          targetSectionIndex: resolveTargetIndex(branch.targetSectionId, branch.targetIsSubmit),
        })),
      fields: section.fields.map((field) => ({
        code: field.code.trim(),
        label: field.label.trim(),
        fieldType: field.fieldType,
        required: field.required,
        isSensitive: field.isSensitive,
        settingsJson: sanitizeFieldSettings(field.fieldType, field.settingsJson),
        conditionsJson: field.conditionsJson,
        visibilityRules: field.visibilityRules ?? null,
        options: supportsOptions(field.fieldType)
          ? field.options
              .filter((option) => option.displayLabel.trim())
              .map((option) => ({
                internalValue: option.internalValue,
                displayLabel: option.displayLabel.trim(),
              }))
          : undefined,
      })),
    })),
  };
}
