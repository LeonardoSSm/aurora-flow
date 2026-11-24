import type { VisibilityConditionOperator } from '../../forms/form-definition.utils';

/**
 * O processo inteiro num documento só, como a LOPS IA monta e o Tijuca Flow devolve
 * (Docs/ia_lops_integracao_api.md, seção 4). Tudo por chave legível — seções e fases por `key`,
 * campos por `code`, perfis por código, pessoas por e-mail, áreas por id do catálogo — e o
 * backend troca pelos ids ao gravar.
 */

export const BLUEPRINT_SCHEMA_VERSION = 1;
/** Destino do caminho no formulário de abertura: enviar. */
export const FORM_SUBMIT = 'submit';
/** Destino do caminho no formulário de uma fase: fim do formulário. */
export const PHASE_FORM_END = 'end';
/**
 * Opções do processo (sim/não) que moram no `settingsJson` da versão junto com `mode`. Vão no
 * `form` do processo para a IA não apagá-las quando reconstrói um processo que já existe.
 */
export const FORM_SETTING_FLAGS = [
  'showResponderIdentification',
  'requireResponderIdentification',
  'requiresResponseApproval',
] as const;
export type FormSettingFlag = (typeof FORM_SETTING_FLAGS)[number];

export type BlueprintOption = { value: string; label: string };

export type BlueprintVisibility = {
  action: 'show' | 'hide';
  operator?: 'and' | 'or';
  conditions: Array<{ field: string; op: VisibilityConditionOperator; value?: string | number }>;
};

export type BlueprintField = {
  code: string;
  label: string;
  type: string;
  required?: boolean;
  sensitive?: boolean;
  options?: BlueprintOption[];
  settings?: Record<string, unknown>;
  visibility?: BlueprintVisibility;
};

export type BlueprintBranch = {
  field: string;
  /** Lista: valor da opção. */
  option?: string;
  /** Caixa de seleção: marcada (true) ou não (false). */
  checked?: boolean;
  /** Chave da seção, ou `submit` (abertura) / `end` (fase). */
  goTo: string;
};

export type BlueprintSection = {
  key: string;
  title: string;
  description?: string;
  fields: BlueprintField[];
  next?: {
    /** Ausente = a seção seguinte (ou o fim, na última). */
    default?: string;
    branches?: BlueprintBranch[];
  };
};

/** Perfis por código e pessoas por e-mail. */
export type BlueprintPeople = { roles?: string[]; users?: string[] };

export type BlueprintPhase = {
  key: string;
  label: string;
  description?: string;
  color?: string;
  terminal?: boolean;
  actors?: BlueprintPeople;
  approval?: {
    approvers: BlueprintPeople;
    rule?: 'any' | 'all' | 'sequential';
    /** Só em 'sequential': `role:<código>` e `user:<e-mail>` na ordem. */
    order?: string[];
    /** Quando a fase pede a aprovação sozinha (ausente = só pelo botão). */
    request?: 'manual' | 'on_enter' | 'on_complete';
    /** Aprovada: 'next' = o card vai sozinho para a próxima fase (ausente = espera). */
    onApproved?: 'stay' | 'next';
    /** Reprovada: volta para a anterior, encerra a solicitação ou fica (ausente). */
    onRejected?: 'stay' | 'previous' | 'close';
  };
  visibleTo?: { roles?: string[]; areas?: string[]; users?: string[] };
  /** O card só avança com os campos obrigatórios do formulário da fase preenchidos. */
  requireFieldsToExit?: boolean;
  /** O card só avança com alguém atribuído (responsável). */
  requireAssigneeToExit?: boolean;
  /** Ponto sem volta: chegando aqui, o card não volta para uma fase anterior. */
  blockMoveBack?: boolean;
  sla?: { hours: number; businessHours?: boolean; warningPercent?: number };
  /** Formulário da fase (preenchido no card por quem atua). */
  sections?: BlueprintSection[];
};

export type BlueprintFlowNode = { key: string; type: string; data?: Record<string, unknown> };
export type BlueprintFlowEdge = { from: string; to: string; when?: 'yes' | 'no' };
export type BlueprintFlow = {
  name: string;
  active?: boolean;
  nodes: BlueprintFlowNode[];
  edges: BlueprintFlowEdge[];
  /** Só na exportação: nó de tipo que a IA não cria (fica como está; editar no editor de fluxos). */
  editableByAi?: boolean;
};

/**
 * Formulário de abertura e as opções do processo. Opção ausente = padrão do sistema: mostra o
 * bloco de identificação, não o exige e a resposta do atendente não passa por aprovação.
 */
export type BlueprintForm = {
  mode?: 'single' | 'stepper';
  /** false esconde o bloco de nome/e-mail do formulário público. */
  showResponderIdentification?: boolean;
  /** true torna nome e e-mail obrigatórios no formulário público. */
  requireResponderIdentification?: boolean;
  /** true: a resposta do atendente precisa ser aprovada pelo solicitante. */
  requiresResponseApproval?: boolean;
  sections: BlueprintSection[];
};

export type ProcessBlueprint = {
  schemaVersion?: number;
  name: string;
  description?: string;
  category?: string;
  areaId?: string | null;
  form: BlueprintForm;
  phases: BlueprintPhase[];
  kanban?: { cardValueField?: string | null };
  flows?: BlueprintFlow[];
  /** O que só a pessoa resolve (perfil que não existe, integração a configurar...). */
  pending?: string[];
  sourceDocuments?: Array<{ name: string; summary?: string }>;
};

export type BlueprintIssue = { path: string; message: string };

export type BlueprintCheck = {
  valid: boolean;
  errors: BlueprintIssue[];
  warnings: BlueprintIssue[];
  /** O que o servidor converteu para o formato do manual antes de conferir (normalizeBlueprint). */
  adjusted?: BlueprintIssue[];
};
