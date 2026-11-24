import type { FieldSettings, FormFieldType } from '../forms/types';

export type KanbanPhaseFieldOption = {
  value: string;
  label: string;
};

export type KanbanPhaseField = {
  id: string;
  code: string;
  label: string;
  fieldType: FormFieldType;
  required: boolean;
  order: number;
  settingsJson: FieldSettings | null;
  optionsJson: KanbanPhaseFieldOption[] | null;
};

/** Uma regra do filtro de cards: quem (perfis/usuários) vê os cards com um destes valores no campo. */
export type KanbanPhaseCardVisibilityRule = {
  fieldCode: string;
  /** Valores aceitos (opção da lista, "true"/"false" na caixa, texto digitado); basta um. */
  values: string[];
  roleCodes: string[];
  userIds: string[];
};

/** Filtro de cards da fase pela resposta. */
export type KanbanPhaseCardVisibility = {
  rules: KanbanPhaseCardVisibilityRule[];
  /** Quem não está em nenhuma regra: true = vê todos os cards da fase; false = nenhum. */
  othersSeeAll: boolean;
};

export type KanbanPhase = {
  id: string;
  formId: string;
  key: string;
  label: string;
  color: string;
  description: string | null;
  order: number;
  isTerminal: boolean;
  /** Perfil esperado para atuar (preencher campos/avançar) nesta fase. Null = qualquer perfil com acesso. */
  actorRoleCode: string | null;
  /** Se true, sair desta fase exige uma aprovação aprovada do approverRoleCode. */
  requiresApproval: boolean;
  approverRoleCode: string | null;
  /** Quem atua: perfis e/ou usuários (basta um). Null = qualquer um com acesso. Fases antigas só têm actorRoleCode. */
  actors?: KanbanPhasePeople | null;
  /** Quem aprova a saída da fase: perfis e/ou usuários. Fases antigas só têm approverRoleCode. */
  approvers?: KanbanPhasePeople | null;
  /** Regra da aprovação (ausente = 'any', basta um). */
  approvalMode?: KanbanPhaseApprovalMode;
  /** Quando pedir a aprovação (ausente = 'manual', só pelo botão). */
  approvalRequest?: KanbanPhaseApprovalRequest;
  /** Depois de aprovada (ausente = 'stay'). */
  approvalOnApproved?: KanbanPhaseApprovalApproved;
  /** Depois de reprovada (ausente = 'stay'). */
  approvalOnRejected?: KanbanPhaseApprovalRejected;
  /** O card só avança com os campos obrigatórios desta fase preenchidos (ausente = não trava). */
  requireFieldsToExit?: boolean;
  /** O card só avança com alguém atribuído (ausente = não trava). */
  requireAssigneeToExit?: boolean;
  /** Ponto sem volta: chegando aqui, o card não volta para uma fase anterior (ausente = volta livre). */
  blockMoveBack?: boolean;
  /** Quem vê a fase no Kanban (basta casar um critério). Null = todos com acesso ao formulário. */
  visibleTo?: KanbanPhaseVisibility | null;
  /** Filtro de cards dentro da fase pela resposta (botão de configurações da coluna no Kanban). */
  cardVisibility?: KanbanPhaseCardVisibility | null;
  /** Prazo do card nesta fase, em horas. Null/ausente = sem prazo. */
  slaHours?: number | null;
  /** O prazo conta só horas úteis (seg–sex, 08h–18h). */
  slaBusinessHours?: boolean;
  /** % do prazo a partir do qual o card fica em alerta. Null = 80. */
  slaWarningPercent?: number | null;
  fields: KanbanPhaseField[];
  /** Caminho entre as seções do formulário da fase. Null/ausente = todas as seções, em ordem. */
  sectionFlow?: KanbanPhaseSectionRoute[] | null;
};

/**
 * Ramificação de uma seção do formulário da fase (como o backend guarda): se o campo tiver a
 * opção/o valor, segue para `target` (código do "Título" da seção; null = fim).
 */
export type KanbanPhaseSectionBranch = {
  fieldCode: string;
  optionValue: string | null;
  checkboxValue: boolean | null;
  target: string | null;
};

/**
 * Para onde uma seção leva. `section` = código do "Título" (ou `__inicio__`). `next` ausente = a
 * seção seguinte; null = fim; texto = outra seção.
 */
export type KanbanPhaseSectionRoute = {
  section: string;
  next?: string | null;
  branches: KanbanPhaseSectionBranch[];
};

export type KanbanPhasePeople = {
  roleCodes: string[];
  userIds: string[];
  /** Só em "quem aprova" com a regra "em ordem": chaves `role:<código>` / `user:<id>`. */
  order?: string[];
};

/** Regra da aprovação de fase: basta um, todos, ou todos um depois do outro. */
export type KanbanPhaseApprovalMode = 'any' | 'all' | 'sequential';

/** Quando a fase pede a aprovação: só pelo botão, ao entrar ou com o formulário da fase completo. */
export type KanbanPhaseApprovalRequest = 'manual' | 'on_enter' | 'on_complete';
/** Aprovada: o card espera alguém mover ou vai sozinho para a próxima fase. */
export type KanbanPhaseApprovalApproved = 'stay' | 'next';
/** Reprovada: o card fica, volta para a fase anterior ou a solicitação é encerrada. */
export type KanbanPhaseApprovalRejected = 'stay' | 'previous' | 'close';

export type KanbanPhaseVisibility = {
  roleCodes: string[];
  areaIds: string[];
  userIds: string[];
};

// ── Draft shapes (client-only ids before save) ─────────────────────────────

export type DraftKanbanPhaseField = {
  id: string;
  serverId: string | null;
  code: string;
  label: string;
  fieldType: FormFieldType;
  required: boolean;
  settingsJson: FieldSettings;
  options: DraftKanbanPhaseFieldOption[];
};

/**
 * `isNew`: opção criada nesta edição — o valor interno ainda acompanha o nome. Opção que veio
 * salva mantém o valor: respostas gravadas e condições de fluxo comparam com ele.
 */
export type DraftKanbanPhaseFieldOption = KanbanPhaseFieldOption & { isNew?: boolean };

export type DraftKanbanPhase = {
  id: string;
  serverId: string | null;
  key: string;
  label: string;
  color: string;
  description: string;
  isTerminal: boolean;
  /** Quem atua; listas vazias = qualquer um com acesso. */
  actors: KanbanPhasePeople;
  requiresApproval: boolean;
  /** Quem aprova (só vale com requiresApproval). */
  approvers: KanbanPhasePeople;
  approvalMode: KanbanPhaseApprovalMode;
  approvalRequest: KanbanPhaseApprovalRequest;
  approvalOnApproved: KanbanPhaseApprovalApproved;
  approvalOnRejected: KanbanPhaseApprovalRejected;
  /** O card só avança com os campos obrigatórios desta fase preenchidos. Voltar é livre. */
  requireFieldsToExit: boolean;
  /** O card só avança com alguém atribuído. Voltar é livre. */
  requireAssigneeToExit: boolean;
  /** Ponto sem volta: só quem configura as fases (ou o processo) devolve o card para antes desta fase. */
  blockMoveBack: boolean;
  /** false = todos veem; true = só os perfis/áreas/usuários de `visibleTo`. */
  restrictVisibility: boolean;
  visibleTo: KanbanPhaseVisibility;
  /** Prazo da fase em horas; null = sem prazo. */
  slaHours: number | null;
  slaBusinessHours: boolean;
  slaWarningPercent: number | null;
  fields: DraftKanbanPhaseField[];
  /** Caminho entre as seções do formulário, pelo id da seção no rascunho (ver phase-section-flow.ts). */
  sectionFlow: DraftPhaseSectionFlow;
};

/** Destino especial: a seção seguinte na ordem (só no caminho padrão). */
export const PHASE_SECTION_AUTO = '__seguinte__';
/** Destino especial: fim do formulário da fase. */
export const PHASE_SECTION_END = '__fim__';

/** Ramificação no rascunho: campo pelo id do rascunho (renomear o código não quebra). */
export type DraftPhaseSectionBranch = {
  fieldId: string;
  optionValue: string | null;
  checkboxValue: boolean | null;
  /** Id da seção de destino ou PHASE_SECTION_END. */
  target: string;
};

export type DraftPhaseSectionRoute = {
  /** Id da seção, PHASE_SECTION_AUTO ou PHASE_SECTION_END. */
  next: string;
  branches: DraftPhaseSectionBranch[];
};

/** Por id da seção (o id do campo "Título", ou a seção sem título). Seção ausente = caminho padrão. */
export type DraftPhaseSectionFlow = Record<string, DraftPhaseSectionRoute>;

export const PHASE_COLOR_PALETTE = [
  { value: 'blue', label: 'Azul', hex: '#1A3C8F' },
  { value: 'amber', label: 'Âmbar', hex: '#D97706' },
  { value: 'green', label: 'Verde', hex: '#16A34A' },
  { value: 'red', label: 'Vermelho', hex: '#DC2626' },
  { value: 'purple', label: 'Roxo', hex: '#7C3AED' },
  { value: 'gray', label: 'Cinza', hex: '#6B7280' },
] as const;

export function phaseColorHex(color: string): string {
  return PHASE_COLOR_PALETTE.find((c) => c.value === color)?.hex ?? PHASE_COLOR_PALETTE[0].hex;
}
