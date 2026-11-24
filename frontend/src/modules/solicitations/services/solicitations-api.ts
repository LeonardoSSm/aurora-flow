import { api, apiBaseUrl } from '../../../services/api';
import { appendUploadLabel, type UploadLabel } from '../../../lib/attachment-upload';
import type { ErpLookupDetails } from '../../erp-lookup/erp-lookup-api';
import type {
  Approval,
  Attachment,
  KanbanBoard,
  KanbanFormSummary,
  PaginatedSolicitations,
  PhaseTimelineEntry,
  Solicitation,
  SolicitationComment,
  SolicitationHistoryEntry,
  SolicitationOriginType,
  SolicitationPriority,
  SolicitationStatus,
} from '../types';

export type { SolicitationComment };

export type FetchSolicitationsParams = {
  page?: number;
  limit?: number;
  search?: string;
  status?: SolicitationStatus;
  priority?: SolicitationPriority;
  originType?: SolicitationOriginType;
  assigneeId?: string;
  formId?: string;
};

export type CreateSolicitationInput = {
  title: string;
  description?: string | null;
  priority?: SolicitationPriority;
  assigneeId?: string | null;
  formId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function fetchSolicitations(
  params?: FetchSolicitationsParams,
): Promise<PaginatedSolicitations> {
  const { data } = await api.get<PaginatedSolicitations>('/solicitations', { params });
  return data;
}

export async function fetchSolicitationById(id: string): Promise<Solicitation> {
  const { data } = await api.get<Solicitation>(`/solicitations/${id}`);
  return data;
}

export async function fetchSolicitationHistory(
  id: string,
): Promise<SolicitationHistoryEntry[]> {
  const { data } = await api.get<SolicitationHistoryEntry[]>(`/solicitations/${id}/history`);
  return data;
}

export async function createSolicitation(
  payload: CreateSolicitationInput,
): Promise<Solicitation> {
  const { data } = await api.post<Solicitation>('/solicitations', payload);
  return data;
}

export async function updateSolicitationStatus(
  id: string,
  status: SolicitationStatus,
  note?: string,
): Promise<Solicitation> {
  const { data } = await api.patch<Solicitation>(`/solicitations/${id}/status`, {
    status,
    note,
  });
  return data;
}

export async function updateSolicitationAssignee(
  id: string,
  assigneeId: string | null,
  note?: string,
): Promise<Solicitation> {
  const { data } = await api.patch<Solicitation>(`/solicitations/${id}/assignee`, {
    assigneeId,
    note,
  });
  return data;
}

export async function updateSolicitationPriority(
  id: string,
  priority: SolicitationPriority,
  note?: string,
): Promise<Solicitation> {
  const { data } = await api.patch<Solicitation>(`/solicitations/${id}/priority`, {
    priority,
    note,
  });
  return data;
}

export async function fetchKanbanBoard(formId?: string): Promise<KanbanBoard> {
  const { data } = await api.get<KanbanBoard>('/solicitations/kanban/board', {
    params: formId ? { formId } : undefined,
  });
  return data;
}

export async function fetchKanbanSummary(): Promise<KanbanFormSummary[]> {
  const { data } = await api.get<KanbanFormSummary[]>('/solicitations/kanban/summary');
  return data;
}

export type KanbanDefaultStage = 'novo' | 'pendente' | 'concluido';

/** Só para solicitações sem formulário (board "Sem formulário"); o backend grava o status equivalente. */
export async function moveStageCard(id: string, stage: KanbanDefaultStage): Promise<Solicitation> {
  const { data } = await api.patch<Solicitation>(`/solicitations/${id}/move-stage`, { stage });
  return data;
}

export async function movePhaseCard(id: string, phaseId: string): Promise<Solicitation> {
  const { data } = await api.patch<Solicitation>(`/solicitations/${id}/move-phase`, { phaseId });
  return data;
}

/** Cria a aprovação da fase atual, roteada para o perfil aprovador configurado na fase. */
export async function requestPhaseApproval(id: string): Promise<Approval> {
  const { data } = await api.post<Approval>(`/solicitations/${id}/phase-approvals`);
  return data;
}

export type PhaseFieldValue = {
  id: string;
  solicitationId: string;
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
  valueText?: string;
  valueNumber?: number;
  valueBoolean?: boolean;
  valueJson?: unknown;
};

export async function fetchPhaseFieldValues(solicitationId: string): Promise<PhaseFieldValue[]> {
  const { data } = await api.get<PhaseFieldValue[]>(`/solicitations/${solicitationId}/phase-fields`);
  return data;
}

export async function savePhaseFieldValues(
  solicitationId: string,
  items: SavePhaseFieldValueInput[],
): Promise<PhaseFieldValue[]> {
  const { data } = await api.patch<PhaseFieldValue[]>(
    `/solicitations/${solicitationId}/phase-fields`,
    { items },
  );
  return data;
}

export type StandardAnswer = {
  id: string;
  solicitationId: string;
  questionId: string | null;
  fieldCode: string;
  valueText: string | null;
  valueNumber: number | null;
  valueBoolean: boolean | null;
  valueJson: unknown | null;
};

export type SaveStandardAnswerInput = {
  questionId: string;
  fieldCode: string;
  valueText?: string;
  valueNumber?: number;
  valueBoolean?: boolean;
  valueJson?: unknown;
};

export async function fetchStandardAnswers(solicitationId: string): Promise<StandardAnswer[]> {
  const { data } = await api.get<StandardAnswer[]>(
    `/solicitations/${solicitationId}/standard-answers`,
  );
  return data;
}

export async function saveStandardAnswers(
  solicitationId: string,
  items: SaveStandardAnswerInput[],
): Promise<StandardAnswer[]> {
  const { data } = await api.patch<StandardAnswer[]>(
    `/solicitations/${solicitationId}/standard-answers`,
    { items },
  );
  return data;
}

// ── Tracking token ───────────────────────────────────────────────────────────

export async function regenerateTrackingToken(
  solicitationId: string,
): Promise<{ trackingToken: string }> {
  const { data } = await api.post<{ trackingToken: string }>(
    `/solicitations/${solicitationId}/tracking-token/regenerate`,
  );
  return data;
}

// ── Attachments ──────────────────────────────────────────────────────────────

export async function fetchSolicitationAttachments(
  solicitationId: string,
  phaseId?: string,
): Promise<Attachment[]> {
  const { data } = await api.get<Attachment[]>(`/solicitations/${solicitationId}/attachments`, {
    params: phaseId ? { phaseId } : undefined,
  });
  return data;
}

export async function uploadSolicitationAttachment(
  solicitationId: string,
  file: File,
  label?: UploadLabel,
): Promise<Attachment> {
  const form = new FormData();
  form.append('file', file);
  appendUploadLabel(form, label);
  const { data } = await api.post<Attachment>(
    `/solicitations/${solicitationId}/attachments`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data;
}

/** Sobe um anexo já vinculado a uma fase específica (ex.: foto capturada para uma fase que exige aprovação). */
export async function uploadPhaseAttachment(
  solicitationId: string,
  phaseId: string,
  file: File,
  label?: UploadLabel,
): Promise<Attachment> {
  const form = new FormData();
  form.append('file', file);
  form.append('phaseId', phaseId);
  appendUploadLabel(form, label);
  const { data } = await api.post<Attachment>(
    `/solicitations/${solicitationId}/attachments`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data;
}

/** Renomear ou descrever um anexo já enviado (descrição vazia apaga). */
export async function updateAttachment(
  attachmentId: string,
  patch: { name?: string; description?: string },
): Promise<Attachment> {
  const { data } = await api.patch<Attachment>(`/attachments/${attachmentId}`, patch);
  return data;
}

export async function deleteAttachment(attachmentId: string): Promise<void> {
  await api.delete(`/attachments/${attachmentId}`);
}

export async function downloadAttachment(attachmentId: string, fileName: string): Promise<void> {
  const response = await api.get(`/attachments/${attachmentId}/download`, {
    responseType: 'blob',
  });
  const url = URL.createObjectURL(response.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function getDownloadUrl(attachmentId: string): string {
  return `${apiBaseUrl}/attachments/${attachmentId}/download`;
}

// ── Comments ──────────────────────────────────────────────────────────────────

export type AddCommentInput = {
  content: string;
  isInternal?: boolean;
  asProposal?: boolean;
};

export async function fetchSolicitationComments(id: string): Promise<SolicitationComment[]> {
  const { data } = await api.get<SolicitationComment[]>(`/solicitations/${id}/comments`);
  return data;
}

export async function addSolicitationComment(
  id: string,
  dto: AddCommentInput,
): Promise<SolicitationComment> {
  const { data } = await api.post<SolicitationComment>(`/solicitations/${id}/comments`, dto);
  return data;
}

/** Ficha do ERP de um campo "Lista do ERP" respondido (ver GET /solicitations/:id/erp-details). */
export type SolicitationErpDetail = {
  fieldCode: string;
  fieldLabel: string;
  value: string;
  /** Nome gravado no envio — mostrado mesmo com o ERP fora do ar. */
  label: string;
  status: 'ok' | 'sem_detalhes' | 'indisponivel';
  details: ErpLookupDetails | null;
};

export async function fetchSolicitationErpDetails(solicitationId: string): Promise<SolicitationErpDetail[]> {
  const { data } = await api.get<SolicitationErpDetail[]>(`/solicitations/${solicitationId}/erp-details`);
  return data;
}

/** Linha do tempo das fases do card: entrada, saída, prazo e se cumpriu. */
export async function fetchPhaseTimeline(id: string): Promise<PhaseTimelineEntry[]> {
  const { data } = await api.get<PhaseTimelineEntry[]>(`/solicitations/${id}/phase-timeline`);
  return data;
}

/** Prorroga o prazo do card na fase atual (quem gerencia as fases). Devolve a linha do tempo. */
export async function extendPhaseSla(
  id: string,
  input: { dueAt: string; reason?: string },
): Promise<PhaseTimelineEntry[]> {
  const { data } = await api.post<PhaseTimelineEntry[]>(`/solicitations/${id}/phase-sla/extend`, input);
  return data;
}

/** Card ligado por "Encaminhar para outro processo". */
export type SolicitationHandoffLink = {
  id: string;
  title: string;
  formId: string | null;
  formName: string | null;
  createdAt: string;
};

export type SolicitationHandoffLinks = {
  source: SolicitationHandoffLink | null;
  forwarded: SolicitationHandoffLink[];
};

/** De onde o card veio e para onde foi encaminhado. */
export async function fetchSolicitationHandoffs(solicitationId: string): Promise<SolicitationHandoffLinks> {
  const { data } = await api.get<SolicitationHandoffLinks>(`/solicitations/${solicitationId}/handoffs`);
  return data;
}
