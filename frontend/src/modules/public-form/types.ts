import type {
  FieldConditions,
  FieldSettings,
  FieldErrorMap,
  FormFieldType,
  FormVersionSettings,
  VisibilityRule,
} from '../forms/types';

export type PublicFormFieldOption = {
  id: string;
  internalValue: string;
  displayLabel: string;
  order: number;
};

export type UploadedPublicFile = {
  url: string;
  name?: string;
  mimeType?: string;
  size?: number;
};

export type ProductTableCellValue = string | number | null;

/** Uma linha da tabela de produtos: nome fixo + valores por coluna (chave = rótulo da coluna). */
export type ProductTableRow = {
  produto: string;
  values: Record<string, ProductTableCellValue>;
};

export type PublicFormField = {
  id: string;
  code: string;
  label: string;
  fieldType: FormFieldType;
  required: boolean;
  order: number;
  settingsJson: FieldSettings;
  conditionsJson: FieldConditions;
  visibilityRules: VisibilityRule[] | null;
  options: PublicFormFieldOption[];
};

export type PublicSectionBranch = {
  id: string;
  fieldCode: string | null;
  optionValue: string | null;
  checkboxValue: boolean | null;
  targetSectionId: string | null;
  targetIsSubmit: boolean;
};

export type PublicFormSection = {
  id: string;
  title: string;
  description: string | null;
  order: number;
  nextSectionId: string | null;
  nextIsSubmit: boolean;
  branches: PublicSectionBranch[];
  fields: PublicFormField[];
};

export type PublicFormVersion = {
  id: string;
  versionNumber: number;
  titleDisplay: string;
  descriptionDisplay: string | null;
  settingsJson: FormVersionSettings;
  sections: PublicFormSection[];
};

export type PublicForm = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  area: string | null;
  status: string;
  activeVersion: PublicFormVersion;
};

/**
 * Opção escolhida num campo "Lista do ERP". O nome fica no estado só para mostrar a escolha
 * (inclusive ao voltar de seção); no envio vai só o código — o nome gravado vem do ERP.
 */
export type ErpLookupAnswer = { value: string; label: string };

export type ErpTableCellValue = string | number | boolean | null;
export type ErpTableSourceRow = { key: string; values: Record<string, ErpTableCellValue> };

/**
 * Estado de um campo "Tabela dinâmica do ERP" enquanto o formulário é preenchido: as linhas
 * carregadas do ERP (só leitura), o hash que o backend confere no envio e o que a pessoa
 * digitou em cada linha, pela chave da linha.
 */
export type ErpTableAnswer = {
  kind: 'erp_table';
  /** Valores dos campos de que a tabela depende quando ela foi carregada (JSON estável). */
  dependencyKey: string;
  sourceHash: string;
  fetchedAt: string;
  rows: ErpTableSourceRow[];
  answers: Record<string, Record<string, ErpTableCellValue>>;
  /** O envio voltou 409: recarregar do ERP mantendo as respostas das linhas que continuam. */
  stale?: boolean;
  /**
   * A pessoa trocou o campo de que a tabela depende (ex.: outro pedido) com respostas já
   * preenchidas: a tabela antiga fica bloqueada até ela confirmar a troca (§10).
   */
  outdated?: boolean;
  /** Depois de recarregar por 409: linhas novas/removidas, até a pessoa confirmar que conferiu. */
  review?: { added: string[]; removed: ErpTableSourceRow[] } | null;
};

/**
 * Estado de um "Pedido de itens": os itens adicionados, na ordem em que entraram (chave = id do
 * item na lista), e o que a pessoa preencheu em cada um.
 */
export type ItemOrderAnswer = {
  kind: 'item_order';
  rows: Array<{ key: string; answers: Record<string, ErpTableCellValue> }>;
};

export type PublicAnswerValue =
  | string
  | number
  | boolean
  | string[]
  | UploadedPublicFile
  | ProductTableRow[]
  | ErpLookupAnswer
  | ErpTableAnswer
  | ItemOrderAnswer
  | null;

export type PublicSubmitItem = {
  fieldId: string;
  fieldCode: string;
  valueText?: string;
  valueNumber?: number;
  valueBoolean?: boolean;
  valueJson?: unknown;
};

export type PublicSubmitPayload = {
  formId: string;
  formVersionId: string;
  responderName?: string;
  responderEmail?: string;
  captchaToken?: string;
  idempotencyKey?: string;
  items: PublicSubmitItem[];
};

export type PublicProgressPayload = {
  formVersionId: string;
  sectionId: string;
  progressId?: string;
  items: PublicSubmitItem[];
};

export type PublicFieldErrorMap = FieldErrorMap;
