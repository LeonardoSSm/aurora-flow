import type { CardDisplay, CardDisplaySource } from '../kanban-phases/lib/card-display';

export type SolicitationStatus = 'open' | 'in_progress' | 'waiting' | 'resolved' | 'canceled';

export type SolicitationPriority = 'low' | 'medium' | 'high' | 'urgent';

export type SolicitationOriginType = 'manual' | 'form_submission' | 'webhook' | 'process_handoff';

export type SolicitationExternalRefs = {
  [key: string]: unknown;
};

export type SolicitationHistoryEventType =
  | 'created'
  | 'status_changed'
  | 'assignee_changed'
  | 'priority_changed'
  | 'phase_changed'
  | 'comment'
  | 'proposal_sent'
  | 'proposal_approved'
  | 'proposal_rejected'
  | 'phase_approval_requested'
  | 'phase_approval_approved'
  | 'phase_approval_rejected'
  | 'phase_sla_extended'
  | 'phase_advance_blocked'
  | 'forwarded';

export type UserSummary = {
  id: string;
  fullName: string;
  email: string;
  role: string;
};

export type SolicitationForm = {
  id: string;
  name: string;
};

export type SolicitationSubmission = {
  id: string;
  responderName: string | null;
  responderEmail: string | null;
  submittedAt: string | null;
};

export type RequesterContact = {
  name: string | null;
  email: string | null;
  phone: string | null;
};

export type Solicitation = {
  id: string;
  title: string;
  description: string | null;
  status: SolicitationStatus;
  priority: SolicitationPriority;
  originType: SolicitationOriginType;
  formId: string | null;
  form: SolicitationForm | null;
  submissionId: string | null;
  submission: SolicitationSubmission | null;
  requesterContact: RequesterContact | null;
  createdBy: string | null;
  createdByUser: UserSummary | null;
  assigneeId: string | null;
  assignee: UserSummary | null;
  metadata: Record<string, unknown> | null;
  externalRefs: SolicitationExternalRefs | null;
  slaStatus: SolicitationSlaStatus | null;
  slaDueAt: string | null;
  slaStartedAt: string | null;
  slaBreachedAt: string | null;
  slaDurationHours: number | null;
  slaWarningThresholdPercent: number | null;
  trackingToken: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SolicitationHistoryEntry = {
  id: string;
  solicitationId: string;
  eventType: SolicitationHistoryEventType;
  actorId: string | null;
  actor: UserSummary | null;
  fromValue: string | null;
  toValue: string | null;
  message: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type PaginatedSolicitations = {
  data: Solicitation[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type AttachmentUploader = {
  id: string;
  fullName: string;
  email: string;
} | null;

export type LabelValidationFieldStatus = 'OK' | 'DIVERGENTE' | 'AUSENTE' | 'ATENCAO';

export type LabelValidationField = {
  valor: string;
  status: LabelValidationFieldStatus;
};

/** Veredito do agente de IA "validador-de-etiquetas" para uma foto de etiqueta. */
export type LabelValidationResult = {
  aprovada: boolean;
  lote: LabelValidationField;
  fabricacao: LabelValidationField;
  validade: LabelValidationField;
  tipo: string;
  mensagem: string;
};

export type Attachment = {
  id: string;
  originalName: string;
  /** O que o arquivo é, nas palavras de quem enviou. Anexos antigos não têm. */
  description?: string | null;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
  storageType: string;
  solicitationId: string | null;
  submissionId: string | null;
  uploadedByUserId: string | null;
  uploadedByUser: AttachmentUploader;
  isPublic: boolean;
  phaseId: string | null;
  validationResult: LabelValidationResult | null;
  validatedAt: string | null;
  createdAt: string;
};

export type SolicitationSlaStatus = 'on_track' | 'warning' | 'breached' | 'paused' | 'completed';

export type KanbanCard = {
  id: string;
  title: string;
  formId: string | null;
  formName: string | null;
  requesterName: string | null;
  requesterEmail: string | null;
  responsibleUserId: string | null;
  responsibleName: string | null;
  priority: SolicitationPriority;
  slaDueAt: string | null;
  slaStatus: SolicitationSlaStatus | null;
  currentStage: string | null;
  phaseId: string | null;
  updatedAt: string;
  originType: SolicitationOriginType;
  hasIntegrationError: boolean;
  /** Valor em R$ do "Valor do card" do formulário; ausente quando o Kanban não tem campo de valor. */
  value?: number | null;
  /** Prazo do card na fase atual; ausente quando a fase não tem prazo. */
  phaseSla?: KanbanCardPhaseSla;
  /** Quando o card entrou na fase atual: só as aprovações desta passagem valem para sair dela. */
  phaseEnteredAt?: string;
  /** Quando a solicitação foi aberta. */
  createdAt?: string;
  /** Campos escolhidos no "Personalizar card" da fase, já como texto (só os respondidos). */
  fields?: KanbanCardFieldValue[];
};

export type KanbanCardFieldValue = { code: string; label: string; text: string };

export type KanbanCardPhaseSla = {
  enteredAt: string;
  dueAt: string;
  businessHours: boolean;
  /** O prazo foi prorrogado por alguém. */
  extended: boolean;
  state: 'on_track' | 'warning' | 'breached';
  percentUsed: number;
  /** Minutos corridos até o vencimento; negativo depois de vencer. */
  minutesRemaining: number;
};

/** Uma passagem do card por uma fase (GET /solicitations/:id/phase-timeline). */
export type PhaseTimelineEntry = {
  phaseId: string | null;
  phaseLabel: string;
  enteredAt: string;
  leftAt: string | null;
  dueAt: string | null;
  businessHours: boolean;
  extended: boolean;
  durationMinutes: number;
  current: boolean;
  status: 'no_sla' | 'on_time' | 'late' | 'on_track' | 'warning' | 'breached';
};

export type KanbanColumn = {
  /** KanbanPhase id quando groupBy é 'phase'; chave da coluna padrão (novo/pendente/concluido) quando é 'stage'. */
  id: string;
  label: string;
  color?: string;
  /** Só chega para quem gerencia fases: esta fase tem "Visível para" (outros podem não vê-la). */
  restrictedVisibility?: boolean;
  /** Só chega para quem gerencia fases: quantas regras o filtro de cards da fase tem. */
  cardFilterRules?: number;
  /** Ponto sem volta: o card que chega a esta fase não volta para uma anterior a ela. */
  blockMoveBack?: boolean;
  /** Soma dos valores dos cards da coluna (R$); só quando o Kanban tem "Valor do card". */
  totalValue?: number;
  /** O que o card mostra nesta fase para quem está vendo; ausente no quadro "Sem processo". */
  cardDisplay?: CardDisplay;
  /** De onde veio `cardDisplay`: ajuste da pessoa, padrão da fase ou padrão do sistema. */
  cardDisplaySource?: CardDisplaySource;
  cards: KanbanCard[];
};

export type KanbanBoard = {
  /** 'phase' = board de um formulário; 'stage' = board "Sem formulário" (colunas padrão pelo status). */
  groupBy: 'phase' | 'stage';
  /** Nome do processo (board por fase) — vem mesmo com o quadro vazio. */
  formName?: string;
  /** Código do campo mostrado em `card.value` e somado em `column.totalValue`. */
  valueField?: string;
  columns: KanbanColumn[];
};

export type KanbanFormSummary = {
  formId: string | null;
  formName: string;
  totalCards: number;
  urgentCount: number;
};

// ── Approvals ─────────────────────────────────────────────────────────────────

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type ApprovalStepStatus = 'pending' | 'approved' | 'rejected' | 'skipped' | 'waiting';
export type ApprovalDecisionValue = 'approved' | 'rejected';

export type ApprovalDecision = {
  id: string;
  decision: ApprovalDecisionValue;
  comment: string | null;
  decidedAt: string;
  decidedByUserId: string | null;
  /** Preenchido quando decidiu um aprovador externo (sem usuário) pelo link enviado por e-mail. */
  decidedByEmail?: string | null;
  decidedVia?: 'system' | 'email_link';
};

export type ApprovalStep = {
  id: string;
  approvalId: string;
  assignedUserId: string | null;
  assignedUser: UserSummary | null;
  assignedRoleCode: string | null;
  assignedRole: { code: string; name: string } | null;
  /** Aprovador externo: decide por um link pessoal enviado a este e-mail. */
  assignedEmail?: string | null;
  /** Quando o servidor de e-mail aceitou o link; nulo = o link ainda não foi enviado. */
  accessLinkSentAt?: string | null;
  accessTokenExpiresAt?: string | null;
  status: ApprovalStepStatus;
  order: number;
  decidedAt: string | null;
  decision: ApprovalDecision | null;
};

export type Approval = {
  id: string;
  solicitationId: string;
  status: ApprovalStatus;
  mode: 'parallel' | 'sequential';
  title: string;
  description: string | null;
  requiredDecisions: number;
  completedAt: string | null;
  cancelledAt: string | null;
  createdBy: string | null;
  /** Setado quando a aprovação é sobre uma fase específica (não a solicitação inteira). */
  phaseId: string | null;
  createdAt: string;
  updatedAt: string;
  steps: ApprovalStep[];
};

export type ApprovalStepWithContext = ApprovalStep & {
  approval: {
    id: string;
    title: string;
    description?: string | null;
    status: ApprovalStatus;
    solicitationId: string;
    createdAt: string;
  };
};

// ── Comments ──────────────────────────────────────────────────────────────────

export type SolicitationComment = {
  id: string;
  solicitationId: string;
  content: string;
  isInternal: boolean;
  authorType: 'requester' | 'team';
  authorName: string | null;
  authorUserId: string | null;
  authorEmail?: string | null;
  createdAt: string;
  proposalStatus?: 'pending' | 'approved' | 'rejected' | null;
  proposalDecidedAt?: string | null;
  proposalRejectionReason?: string | null;
};
