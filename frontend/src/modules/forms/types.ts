export type FormStatus = 'draft' | 'published' | 'paused' | 'expired' | 'archived';

export type FormFieldType =
  | 'short_text'
  | 'long_text'
  | 'number'
  | 'date'
  | 'time'
  | 'datetime'
  | 'email'
  | 'phone'
  | 'cpf'
  | 'cnpj'
  | 'cep'
  | 'currency'
  | 'calculated'
  | 'single_select'
  | 'multi_select'
  | 'checkbox'
  | 'file_upload'
  | 'product_table'
  | 'erp_lookup'
  | 'erp_table'
  | 'item_order'
  | 'scale'
  | 'rating'
  | 'title'
  | 'description'
  | 'divider'
  | 'file_download';

export type FieldConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'is_empty'
  | 'is_not_empty'
  | 'contains';

export type FieldConditionRule = {
  fieldCode: string;
  operator: FieldConditionOperator;
  value?: unknown;
};

export type FieldConditions = {
  show_if?: FieldConditionRule[];
};

export type VisibilityConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'greater_than'
  | 'less_than'
  | 'is_empty'
  | 'is_not_empty';

export type VisibilityCondition = {
  fieldCode: string;
  operator: VisibilityConditionOperator;
  value?: string | number;
};

export type VisibilityRule = {
  operator: 'and' | 'or';
  conditions: VisibilityCondition[];
  action: 'show' | 'hide';
};

/** Uma coluna extra da tabela de produtos, além do nome fixo do produto. */
export type ProductTableColumn = {
  id: string;
  label: string;
  type: 'number' | 'text';
  /** 'creator': valor fixo, definido por produto no builder. 'respondent': preenchido por quem responde. */
  filledBy: 'creator' | 'respondent';
};

export type ChoiceDisplay = 'buttons' | 'dropdown';

/** Destinatário do aviso de pontuação (mesmo formato do nó "Notificação" dos fluxos). */
export type ScoreAlertRecipient = { type: 'users'; userIds: string[] } | { type: 'custom'; value: string };

export type ScoreAlertSettings = {
  enabled?: boolean;
  /** Quando mandar: só quando algo ficar abaixo (padrão) ou sempre que o formulário for respondido. */
  trigger?: 'below' | 'always';
  /** Pergunta que identifica a auditoria (ex.: a unidade): a resposta vai no assunto e no topo do e-mail. */
  labelFieldCode?: string | null;
  /** Assunto próprio da mensagem; `{unidade}` vira a resposta da pergunta acima. Vazio = o padrão. */
  subject?: string | null;
  /** Alguma seção abaixo do limite dela (próprio, ou o marco do resultado). */
  sectionsBelow?: boolean;
  /** Este resultado abaixo deste valor (%); vazio = não avisa pelo resultado. */
  resultBelow?: number | null;
  channel?: 'email' | 'in_app' | 'whatsapp';
  recipients?: ScoreAlertRecipient[];
  /** Arte de fundo do e-mail só deste formulário (id da imagem enviada); vazio = a arte geral. */
  backgroundImageId?: string | null;
};

/** Faixa do resultado de um campo calculado: de `from` (inclusive) até a próxima faixa. */
export type ScoreRange = {
  id: string;
  from: number;
  /** Nome opcional, mostrado no histórico do card (ex.: "Risco alto"). */
  label?: string;
  /** Fase do Kanban em que o card nasce. */
  phaseId?: string;
};

/** Pessoa sugerida num campo "E-mail de usuário" (o formulário publicado recebe só isto). */
export type SuggestedUser = { name: string; email: string };

/**
 * "E-mail de usuário": campo E-mail que sugere usuários do sistema enquanto se digita.
 * `userIds` vazio = qualquer usuário ativo; `onlySuggested` = só aceita e-mail sugerido.
 * O formulário publicado não recebe `userIds`: recebe `users` (nome e e-mail das pessoas
 * escolhidas) ou nada (pesquisa entre todos os usuários).
 */
export type UserSuggestionsSettings = {
  userIds?: string[];
  onlySuggested?: boolean;
  users?: SuggestedUser[];
};

export type FieldSettings = {
  /** Campo E-mail com sugestões de usuários do sistema (tipo "E-mail de usuário" do construtor). */
  userSuggestions?: UserSuggestionsSettings;
  /**
   * Seleção única/múltipla: 'dropdown' mostra as opções numa lista suspensa com busca (o tipo
   * "Lista suspensa" do construtor); ausente = botões, como sempre foi. Só muda a aparência — o
   * valor salvo é o mesmo da seleção.
   */
  displayAs?: ChoiceDisplay;
  /**
   * Seleção ligada a uma lista de itens (módulo "Listas de itens"): as opções vêm da lista e são
   * mantidas pelo servidor. As que saíram da lista ficam no campo, escondidas, para respostas antigas.
   */
  itemListId?: string;
  hiddenOptionValues?: string[];
  min?: number;
  max?: number;
  decimals?: number;
  minLength?: number;
  maxLength?: number;
  allowedMimeTypes?: string[];
  /** Antigo: o campo de arquivo não limita mais tamanho nem quantidade. Ignorado onde aparecer. */
  maxSizeInBytes?: number;
  /** Antigo: o campo de arquivo não limita mais tamanho nem quantidade. Ignorado onde aparecer. */
  maxFiles?: number;
  /**
   * Campo de arquivo: cada arquivo enviado precisa ser renomeado ou descrito. Ausente = sim (o pedido
   * foi "obrigatório"); só `false` desliga.
   */
  requireFileLabel?: boolean;
  minDate?: string;
  maxDate?: string;
  /** Campo calculado: expressão com referências no formato {codigo_do_campo}. */
  formula?: string;
  formulaDecimals?: number;
  formulaPrefix?: string;
  formulaSuffix?: string;
  /** Campo calculado: 'hours' mostra o resultado (em horas) no relógio — 8,5 vira "8h30". */
  formulaFormat?: 'hours';
  /**
   * Campo calculado: pontos de cada opção das perguntas de escolha usadas na fórmula —
   * `{ codigo_da_pergunta: { valor_interno_da_opcao: pontos } }`. `null` = a opção "não conta"
   * (ex.: Não se aplica): fica fora da pontuação e do máximo da CONFORMIDADE.
   */
  optionScores?: Record<string, Record<string, number | null>>;
  /** Campo calculado: faixas do resultado e a fase em que o card nasce em cada uma (só no envio). */
  scoreRanges?: ScoreRange[];
  /**
   * Campo calculado de pontuação, com fórmula gerada pelo construtor: 'section' = "Pontuação da
   * seção" (conformidade das perguntas da seção); 'result' = "Resultado da pontuação" (sobre as
   * pontuações de seção). Ausente = cálculo com fórmula livre.
   */
  scoreMode?: 'section' | 'result';
  /** "Resultado da pontuação": % das seções que atingiram o marco, ou média das seções. */
  scoreResultMeasure?: 'reached' | 'average';
  /** "Resultado da pontuação": marco de cada seção, em % (igual ou acima atingiu). */
  scoreMark?: number;
  /**
   * Campo calculado fora da tela de quem responde (ex.: notas de auditoria): o backend calcula e
   * grava igual no envio; só quem consulta a resposta vê. Ausente/false = aparece, como sempre.
   */
  hideFromRespondent?: boolean;
  /** "Pontuação da seção": limite próprio para o aviso (vazio = o marco do resultado). */
  scoreLimit?: number;
  /** "Resultado da pontuação": aviso no envio quando seção ou resultado ficar abaixo do limite. */
  scoreAlert?: ScoreAlertSettings;
  /** Tabela de produtos: colunas configuráveis pelo criador, além do nome do produto. */
  productTableColumns?: ProductTableColumn[];
  /**
   * Tabela de produtos: valores fixos por produto para colunas com filledBy: 'creator'.
   * Chave externa = option.internalValue (produto), chave interna = column.id.
   */
  productTableProductValues?: Record<string, Record<string, string | number>>;
  /** Campo de foto de uma fase do Kanban: valida a etiqueta com IA ao ser enviado. */
  validateLabelWithAi?: boolean;
  /**
   * Lista do ERP (Docs/campo_lista_erp_plano.md). Conector e lista só existem no construtor:
   * o formulário público recebe modo, mínimo de caracteres, exigirLogin e placeholder.
   */
  erpConnectorId?: string;
  fonte?: string;
  modo?: ErpLookupMode;
  minCaracteres?: number;
  exigirLogin?: boolean;
  placeholder?: string | null;
  /**
   * Tabela dinâmica do ERP (Docs/campo_tabela_dinamica_erp_implantacao.md). `erpConnectorId`,
   * `fonte`, `dataset` e `parameterBindings` só existem no construtor; o formulário público
   * recebe `dependsOn` (códigos dos campos de que a tabela depende) no lugar deles.
   */
  dataset?: string;
  parameterBindings?: ErpTableParameterBinding[];
  sourceColumns?: ErpTableSourceColumn[];
  inputColumns?: ErpTableInputColumn[];
  maxRows?: number;
  dependsOn?: string[];
  /**
   * Pedido de itens (`item_order`, usa também `itemListId` e `inputColumns`): colunas da lista
   * mostradas além do nome ('code' ou id da coluna) e o total (preço da lista × coluna preenchida).
   * O formulário público recebe no lugar `sourceColumns` resolvidas, `items` e `total`.
   */
  itemColumns?: string[];
  totalPriceColumn?: string | null;
  totalQuantityColumn?: string | null;
  items?: Array<{ key: string; values: Record<string, string | number | boolean | null> }>;
  total?: { priceColumn: string; quantityColumn: string; type: 'number' | 'currency' } | null;
  /**
   * Arquivo para baixar (`file_download`): o arquivo enviado pelo construtor. `path` é o caminho
   * gerado pelo servidor (ver `downloadFileUrl`); `name` é o que aparece no botão.
   */
  downloadFile?: DownloadFileSettings;
};

export type DownloadFileSettings = { path: string; name: string; size: number };

export type ErpTableParameterBinding = { parameter: string; fieldCode: string };
export type ErpTableSourceColumnType = 'text' | 'number' | 'currency' | 'date' | 'boolean';
export type ErpTableSourceColumn = { key: string; label: string; type: ErpTableSourceColumnType };
export type ErpTableInputColumnType =
  | 'text'
  | 'long_text'
  | 'number'
  | 'currency'
  | 'date'
  | 'select'
  | 'checkbox';
export type ErpTableInputColumn = {
  id: string;
  label: string;
  type: ErpTableInputColumnType;
  required?: boolean;
  min?: number | null;
  max?: number | null;
  decimals?: number | null;
  maxLength?: number | null;
  options?: string[];
  helpText?: string | null;
  defaultValue?: string | number | boolean | null;
};

/** `lista`: carrega tudo ao abrir. `pesquisa`: busca enquanto digita. */
export type ErpLookupMode = 'lista' | 'pesquisa';

export type FormVersionSettings = {
  mode?: 'single' | 'stepper';
  /** Bloco de nome/e-mail opcional no topo do formulário público. Ausente/undefined
   * equivale a `true` — formulário existente sem essa chave continua mostrando o bloco. */
  showResponderIdentification?: boolean;
  /** Quando `true`, nome e e-mail do bloco de identificação são obrigatórios (e o bloco
   * aparece mesmo com `showResponderIdentification: false`). Ausente equivale a `false`. */
  requireResponderIdentification?: boolean;
  /** Quando `true`, a resposta do atendente a uma solicitação vira uma proposta que
   * precisa ser aprovada pelo solicitante antes de ser considerada concluída. */
  requiresResponseApproval?: boolean;
};

export type FieldErrorMap = Record<string, string>;

export type GoogleConnectionStatus = 'configured' | 'connected' | 'disconnected';
export type FormGoogleSheetsStatus = 'not_configured' | GoogleConnectionStatus;

export type GoogleSheetsJobSummary = {
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
};

export type FormGoogleSheetsState = {
  enabled: boolean;
  autoCreateOnSave: boolean;
  status: FormGoogleSheetsStatus;
  spreadsheetId: string | null;
  spreadsheetUrl: string | null;
  spreadsheetReady: boolean;
  linkedAccountEmail: string | null;
  sheetTitle: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  lastUsedAt: string | null;
  jobs: GoogleSheetsJobSummary;
};

export type FormFieldOption = {
  id: string;
  internalValue: string;
  displayLabel: string;
  order: number;
};

export type FormField = {
  id: string;
  code: string;
  label: string;
  fieldType: FormFieldType;
  required: boolean;
  isSensitive: boolean;
  order: number;
  settingsJson: FieldSettings;
  conditionsJson: FieldConditions;
  visibilityRules: VisibilityRule[] | null;
  options: FormFieldOption[];
};

export type SectionBranch = {
  id: string;
  fieldId: string | null;
  optionId: string | null;
  checkboxValue: boolean | null;
  targetSectionId: string | null;
  targetIsSubmit: boolean;
  order: number;
};

export type FormSection = {
  id: string;
  title: string;
  description: string | null;
  order: number;
  nextSectionId: string | null;
  nextIsSubmit: boolean;
  /** Posição no canvas da aba Fluxo, em pixel. Nula = nunca posicionada a mão. */
  flowPositionX: number | null;
  flowPositionY: number | null;
  branches: SectionBranch[];
  fields: FormField[];
};

export type FormVersion = {
  id: string;
  versionNumber: number;
  titleDisplay: string;
  descriptionDisplay: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
  settingsJson: FormVersionSettings;
  sections: FormSection[];
};

export type FormAccessUser = {
  id: string;
  fullName: string;
  email: string;
  role: string;
};

/** Cor (#RRGGBB) e ícone do card do processo; null = padrão. */
export type FormAppearance = {
  color: string | null;
  icon: string | null;
};

export type FormSummary = {
  id: string;
  name: string;
  description: string | null;
  status: FormStatus;
  category: string | null;
  area: string | null;
  createdAt: string;
  updatedAt: string;
  googleSheetsEnabled: boolean;
  /** Ausente em backends antigos. */
  appearance?: FormAppearance | null;
  submissionCount: number;
  latestVersionNumber: number;
  createdByUser: FormAccessUser;
  /** Todas as pessoas atribuídas — qualquer uma tem acesso ao formulário. */
  assignees: FormAccessUser[];
};

export type FormDetail = {
  id: string;
  name: string;
  description: string | null;
  status: FormStatus;
  category: string | null;
  area: string | null;
  createdAt: string;
  createdBy: string;
  createdByUser: FormAccessUser;
  assignees: FormAccessUser[];
  googleSheetsEnabled: boolean;
  googleSheetsAutoCreate: boolean;
  googleSpreadsheetId: string | null;
  googleSpreadsheetUrl: string | null;
  googleSheetTitle: string | null;
  googleLinkedUserId: string | null;
  googleLastSyncedAt: string | null;
  googleLastError: string | null;
  versions: FormVersion[];
};

export type CreateFormFieldOptionInput = {
  internalValue: string;
  displayLabel: string;
};

export type CreateFormFieldInput = {
  code: string;
  label: string;
  fieldType: FormFieldType;
  required: boolean;
  isSensitive?: boolean;
  settingsJson?: FieldSettings;
  conditionsJson?: FieldConditions;
  visibilityRules?: VisibilityRule[] | null;
  options?: CreateFormFieldOptionInput[];
};

export type CreateSectionBranchInput = {
  fieldCode: string;
  optionValue?: string;
  checkboxValue?: boolean;
  targetSectionIndex?: number | null;
};

export type CreateFormSectionInput = {
  title: string;
  description?: string;
  nextSectionIndex?: number | null;
  /** Posição no canvas da aba Fluxo, em pixel. Ausente/nula = nunca posicionada a mão. */
  flowPositionX?: number | null;
  flowPositionY?: number | null;
  branches?: CreateSectionBranchInput[];
  fields: CreateFormFieldInput[];
};

export type CreateFormInput = {
  name: string;
  description?: string;
  category?: string;
  area?: string;
  assignedUserIds?: string[];
  sections: CreateFormSectionInput[];
  googleSheets?: {
    enabled: boolean;
    autoCreateOnSave?: boolean;
  };
  settingsJson?: FormVersionSettings;
};

export const formStatusLabel: Record<FormStatus, string> = {
  draft: 'Rascunho',
  published: 'Publicado',
  paused: 'Pausado',
  archived: 'Arquivado',
  expired: 'Expirado',
};

export const formStatusStyles: Record<FormStatus, string> = {
  published: 'bg-emerald-100 text-emerald-800',
  draft: 'bg-blue-100 text-blue-800',
  paused: 'bg-amber-100 text-amber-800',
  archived: 'bg-slate-200 text-slate-700',
  expired: 'bg-rose-100 text-rose-800',
};

export const FORM_STATUS_TRANSITIONS: Record<
  FormStatus,
  Array<{ label: string; status: FormStatus }>
> = {
  draft: [
    { label: 'Publicar', status: 'published' },
    { label: 'Arquivar', status: 'archived' },
  ],
  published: [
    { label: 'Pausar', status: 'paused' },
    { label: 'Expirar', status: 'expired' },
    { label: 'Arquivar', status: 'archived' },
  ],
  paused: [
    { label: 'Publicar', status: 'published' },
    { label: 'Expirar', status: 'expired' },
    { label: 'Arquivar', status: 'archived' },
  ],
  expired: [
    { label: 'Voltar para Draft', status: 'draft' },
    { label: 'Arquivar', status: 'archived' },
  ],
  archived: [{ label: 'Voltar para Draft', status: 'draft' }],
};
