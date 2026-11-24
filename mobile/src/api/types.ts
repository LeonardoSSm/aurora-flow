/**
 * Tipos da API usados pelo app. Espelham os `types.ts` de `frontend/src/modules` (o que o backend manda
 * hoje), só com o que o app lê.
 */

export type PermissionScope = 'none' | 'own' | 'assigned' | 'area' | 'all';
export type ProcessPermissionScope = 'all' | 'own';
export type ProcessPermissionMap = Record<string, Record<string, ProcessPermissionScope>>;

export type AuthUser = {
  id: string;
  fullName: string;
  email: string;
  /** Código do perfil — qualquer perfil cadastrado, não só os quatro padrão. */
  role: string;
};

/** Resposta do login e do refresh: tokens + o que a pessoa pode fazer. */
export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
  permissions: Record<string, PermissionScope>;
  processPermissions: ProcessPermissionMap;
  processesFullAccess: boolean;
};

export type UserSummary = { id: string; fullName: string; email: string; role?: string };

export type SolicitationPriority = 'low' | 'medium' | 'high' | 'urgent';
export type SlaStatus = 'on_track' | 'warning' | 'breached' | 'paused' | 'completed';

export type Solicitation = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: SolicitationPriority;
  originType: string;
  formId: string | null;
  form: { id: string; name?: string; title?: string } | null;
  submissionId: string | null;
  submission?: { id: string; responderName: string | null; responderEmail: string | null; submittedAt: string | null } | null;
  requesterContact?: { name: string | null; email: string | null; phone: string | null } | null;
  createdBy: string | null;
  createdByUser: UserSummary | null;
  assigneeId: string | null;
  assignee: UserSummary | null;
  metadata: Record<string, unknown> | null;
  currentPhaseId?: string | null;
  /** Quando o card entrou na fase atual: só as aprovações desta passagem valem para sair dela. */
  phaseEnteredAt?: string | null;
  phaseDueAt?: string | null;
  slaStatus: SlaStatus | null;
  slaDueAt: string | null;
  trackingToken: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SolicitationsPage = {
  data: Solicitation[];
  total: number;
  page: number;
  limit: number;
  totalPages?: number;
};

export type HistoryEvent = {
  id: string;
  eventType: string;
  actor: UserSummary | null;
  fromValue: string | null;
  toValue: string | null;
  message: string | null;
  createdAt: string;
};

export type LabelValidationFieldStatus = 'OK' | 'DIVERGENTE' | 'AUSENTE' | 'ATENCAO';
export type LabelValidationResult = {
  aprovada: boolean;
  lote: { valor: string; status: LabelValidationFieldStatus };
  fabricacao: { valor: string; status: LabelValidationFieldStatus };
  validade: { valor: string; status: LabelValidationFieldStatus };
  tipo: string;
  mensagem: string;
};

export type Attachment = {
  id: string;
  originalName: string;
  /** O que o arquivo é, nas palavras de quem enviou. Anexos antigos não têm. */
  description?: string | null;
  mimeType: string;
  sizeBytes: number;
  solicitationId: string | null;
  submissionId: string | null;
  uploadedByUserId?: string | null;
  uploadedByUser?: { id: string; fullName: string } | null;
  phaseId: string | null;
  validationResult: LabelValidationResult | null;
  createdAt: string;
};

export type Comment = {
  id: string;
  content: string;
  isInternal: boolean;
  authorType: 'requester' | 'team';
  authorName: string | null;
  authorUserId: string | null;
  createdAt: string;
};

// ── Kanban ───────────────────────────────────────────────────────────────────

export type CardIndicator =
  | 'process'
  | 'priority'
  | 'value'
  | 'sla'
  | 'phase_sla'
  | 'assignee'
  | 'updated_at'
  | 'requester'
  | 'created_at'
  | 'time_in_phase'
  | 'number';

export type CardDisplay = { indicators: CardIndicator[]; fields: Array<{ fieldCode: string; label: string | null }> };

export type KanbanCardPhaseSla = {
  enteredAt: string;
  dueAt: string;
  businessHours: boolean;
  extended: boolean;
  state: 'on_track' | 'warning' | 'breached';
  percentUsed: number;
  minutesRemaining: number;
};

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
  slaStatus?: SlaStatus | null;
  currentStage: string | null;
  phaseId?: string | null;
  updatedAt: string;
  originType: string;
  hasIntegrationError: boolean;
  value?: number | null;
  phaseSla?: KanbanCardPhaseSla;
  phaseEnteredAt?: string;
  createdAt?: string;
  fields?: Array<{ code: string; label: string; text: string }>;
};

export type KanbanColumn = {
  id: string;
  label: string;
  color?: string;
  blockMoveBack?: boolean;
  totalValue?: number;
  cardDisplay?: CardDisplay;
  cards: KanbanCard[];
};

export type KanbanBoard = {
  groupBy: 'phase' | 'stage';
  formName?: string;
  valueField?: string;
  columns: KanbanColumn[];
};

export type KanbanFormSummary = {
  formId: string | null;
  formName: string;
  totalCards: number;
  urgentCount: number;
};

export type KanbanDefaultStage = 'novo' | 'pendente' | 'concluido';

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

export type HandoffLink = { id: string; title: string; formId: string | null; formName: string | null; createdAt: string };
export type HandoffLinks = { source: HandoffLink | null; forwarded: HandoffLink[] };

// ── Fases ────────────────────────────────────────────────────────────────────

export type PhasePeople = { roleCodes: string[]; userIds: string[]; order?: string[] };

export type KanbanPhaseField = {
  id: string;
  code: string;
  label: string;
  fieldType: string;
  required: boolean;
  order: number;
  settingsJson: Record<string, unknown> | null;
  optionsJson: Array<{ value: string; label: string }> | null;
};

export type PhaseSectionRoute = {
  section: string;
  next?: string | null;
  branches: Array<{ fieldCode: string; optionValue: string | null; checkboxValue: boolean | null; target: string | null }>;
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
  actorRoleCode: string | null;
  requiresApproval: boolean;
  approverRoleCode: string | null;
  actors?: PhasePeople | null;
  approvers?: PhasePeople | null;
  approvalMode?: 'any' | 'all' | 'sequential';
  requireFieldsToExit?: boolean;
  requireAssigneeToExit?: boolean;
  blockMoveBack?: boolean;
  slaHours?: number | null;
  slaBusinessHours?: boolean;
  fields: KanbanPhaseField[];
  sectionFlow?: PhaseSectionRoute[] | null;
};

export type PhaseFieldValue = {
  id: string;
  phaseFieldId: string | null;
  fieldCode: string;
  valueText: string | null;
  valueNumber: number | null;
  valueBoolean: boolean | null;
  valueJson: unknown | null;
};

export type SavePhaseFieldValueInput = {
  phaseFieldId: string;
  fieldCode: string;
  valueText?: string | null;
  valueNumber?: number | null;
  valueBoolean?: boolean | null;
  valueJson?: unknown;
};

// ── Aprovações ───────────────────────────────────────────────────────────────

export type ApprovalDecision = {
  id: string;
  decision: 'approved' | 'rejected';
  comment: string | null;
  decidedAt: string;
  decidedByEmail?: string | null;
};

export type ApprovalStep = {
  id: string;
  approvalId: string;
  assignedUserId: string | null;
  assignedUser: UserSummary | null;
  assignedRoleCode: string | null;
  assignedRole: { code: string; name: string } | null;
  assignedEmail?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'skipped' | 'waiting';
  order: number;
  decidedAt: string | null;
  decision: ApprovalDecision | null;
};

export type Approval = {
  id: string;
  solicitationId: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  mode?: 'parallel' | 'sequential';
  title: string;
  description: string | null;
  requiredDecisions?: number;
  phaseId?: string | null;
  createdAt: string;
  completedAt: string | null;
  steps?: ApprovalStep[];
  solicitation?: ApprovalSolicitationSummary;
};

export type ApprovalSolicitationSummary = {
  id: string;
  title: string;
  status: string;
  priority: SolicitationPriority;
  slaStatus: SlaStatus | null;
  slaDueAt: string | null;
  createdAt: string;
  createdByUser: UserSummary | null;
  formId: string | null;
  submissionId: string | null;
  history?: HistoryEvent[];
};

/** Item de GET /approvals/my-pending: a etapa com a aprovação (e a solicitação) junto. */
export type MyPendingStep = ApprovalStep & {
  approval: Approval & { solicitation?: ApprovalSolicitationSummary };
};

// ── Formulários ──────────────────────────────────────────────────────────────

export type FormListItem = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  category: string | null;
  area: string | null;
  createdAt: string;
  updatedAt: string;
  submissionCount?: number;
};

export type FieldOption = { id: string; internalValue: string; displayLabel: string; order: number };

export type FormField = {
  id: string;
  code: string;
  label: string;
  fieldType: string;
  required: boolean;
  order: number;
  helpText?: string | null;
  placeholder?: string | null;
  settingsJson: Record<string, unknown> | null;
  conditionsJson: Record<string, unknown> | null;
  options: FieldOption[];
};

export type FormSection = {
  id: string;
  title: string;
  description: string | null;
  order: number;
  fields: FormField[];
  /** Caminho entre seções do formulário de abertura (ramificação). */
  settingsJson?: Record<string, unknown> | null;
};

export type PublicForm = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  activeVersion: {
    id: string;
    versionNumber: number;
    titleDisplay: string;
    descriptionDisplay: string | null;
    settingsJson: Record<string, unknown>;
    sections: FormSection[];
  };
};

/** GET /forms/:id — só o que a tela de respostas usa (rótulos das perguntas por versão). */
export type FormDetail = {
  id: string;
  name: string;
  versions: Array<{ id: string; versionNumber: number; sections: FormSection[] }>;
};

export type SubmitItem = {
  fieldId: string;
  fieldCode: string;
  valueText?: string;
  valueNumber?: number;
  valueBoolean?: boolean;
  valueJson?: unknown;
};

export type ResponseItem = {
  id: string;
  fieldId: string;
  fieldCode: string;
  valueText: string | null;
  valueNumber: number | null;
  valueBoolean: boolean | null;
  valueJson: unknown | null;
};

export type ResponseRecord = {
  id: string;
  formId: string;
  formVersionId: string;
  status: string;
  responderName: string | null;
  responderEmail: string | null;
  submittedAt: string | null;
  items: ResponseItem[];
};

// ── Avisos ───────────────────────────────────────────────────────────────────

export type InboxItem = {
  id: string;
  title: string | null;
  message: string;
  /** Caminho interno que o aviso abre (a solicitação, a aprovação); nulo = só texto. */
  link: string | null;
  isRead: boolean;
  createdAt: string;
};

export type InboxPage = { data: InboxItem[]; total: number; page: number; limit: number; totalPages: number };

/** Arquivo escolhido no aparelho, ainda não enviado. */
export type LocalFile = { uri: string; name: string; mimeType: string; size?: number };

export type UploadLabel = { name?: string; description?: string };
