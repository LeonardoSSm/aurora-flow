import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import * as api from './endpoints';
import type { LocalFile, SavePhaseFieldValueInput, SolicitationPriority, UploadLabel } from './types';

/** Chaves do cache num lugar só — invalidar depois de uma ação fica fácil de acertar. */
export const keys = {
  solicitations: (params: object) => ['solicitations', params] as const,
  solicitation: (id: string) => ['solicitation', id] as const,
  history: (id: string) => ['solicitation', id, 'history'] as const,
  timeline: (id: string) => ['solicitation', id, 'timeline'] as const,
  handoffs: (id: string) => ['solicitation', id, 'handoffs'] as const,
  approvalsOf: (id: string) => ['solicitation', id, 'approvals'] as const,
  comments: (id: string) => ['solicitation', id, 'comments'] as const,
  attachments: (id: string) => ['solicitation', id, 'attachments'] as const,
  phaseValues: (id: string) => ['solicitation', id, 'phase-values'] as const,
  kanbanSummary: ['kanban', 'summary'] as const,
  board: (formId: string) => ['kanban', 'board', formId] as const,
  phases: (formId: string) => ['kanban', 'phases', formId] as const,
  myPending: ['approvals', 'my-pending'] as const,
  approval: (id: string) => ['approval', id] as const,
  forms: (search: string) => ['forms', search] as const,
  publicForm: (id: string) => ['public-form', id] as const,
  formDetail: (id: string) => ['form-detail', id] as const,
  response: (id: string) => ['response', id] as const,
  inbox: ['inbox'] as const,
  unread: ['inbox', 'unread'] as const,
  assignable: ['users', 'assignable'] as const,
};

/** Depois de mexer num card: tudo o que mostra ele (detalhe, quadro, listas, aprovações). */
export function invalidateSolicitation(queryClient: QueryClient, id: string): void {
  void queryClient.invalidateQueries({ queryKey: ['solicitation', id] });
  void queryClient.invalidateQueries({ queryKey: ['kanban'] });
  void queryClient.invalidateQueries({ queryKey: ['solicitations'] });
  void queryClient.invalidateQueries({ queryKey: keys.myPending });
}

// ── Leituras ────────────────────────────────────────────────────────────────

export function useSolicitations(params: api.SolicitationsQuery, enabled = true) {
  return useQuery({ queryKey: keys.solicitations(params), queryFn: () => api.fetchSolicitations(params), enabled });
}

export function useSolicitation(id: string) {
  return useQuery({ queryKey: keys.solicitation(id), queryFn: () => api.fetchSolicitation(id) });
}

export function useHistory(id: string) {
  return useQuery({ queryKey: keys.history(id), queryFn: () => api.fetchHistory(id) });
}

export function usePhaseTimeline(id: string, enabled = true) {
  return useQuery({ queryKey: keys.timeline(id), queryFn: () => api.fetchPhaseTimeline(id), enabled, retry: false });
}

export function useHandoffs(id: string) {
  return useQuery({ queryKey: keys.handoffs(id), queryFn: () => api.fetchHandoffs(id), retry: false });
}

export function useSolicitationApprovals(id: string) {
  return useQuery({ queryKey: keys.approvalsOf(id), queryFn: () => api.fetchSolicitationApprovals(id) });
}

export function useComments(id: string) {
  return useQuery({ queryKey: keys.comments(id), queryFn: () => api.fetchComments(id) });
}

export function useAttachments(id: string) {
  return useQuery({ queryKey: keys.attachments(id), queryFn: () => api.fetchAttachments(id) });
}

export function usePhaseValues(id: string) {
  return useQuery({ queryKey: keys.phaseValues(id), queryFn: () => api.fetchPhaseFieldValues(id) });
}

export function useKanbanSummary() {
  return useQuery({ queryKey: keys.kanbanSummary, queryFn: api.fetchKanbanSummary });
}

export function useBoard(formId: string) {
  return useQuery({ queryKey: keys.board(formId), queryFn: () => api.fetchKanbanBoard(formId) });
}

export function usePhases(formId: string | null | undefined) {
  return useQuery({
    queryKey: keys.phases(formId ?? ''),
    queryFn: () => api.fetchKanbanPhases(formId as string),
    enabled: Boolean(formId),
    staleTime: 60_000,
  });
}

export function useMyPendingApprovals() {
  return useQuery({ queryKey: keys.myPending, queryFn: api.fetchMyPendingApprovals, refetchInterval: 60_000 });
}

export function useApproval(id: string) {
  return useQuery({ queryKey: keys.approval(id), queryFn: () => api.fetchApproval(id) });
}

export function usePublishedForms(search: string) {
  return useQuery({ queryKey: keys.forms(search), queryFn: () => api.fetchPublishedForms(search || undefined), staleTime: 60_000 });
}

export function usePublicForm(formId: string) {
  return useQuery({ queryKey: keys.publicForm(formId), queryFn: () => api.fetchPublicForm(formId) });
}

export function useFormDetail(formId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: keys.formDetail(formId ?? ''),
    queryFn: () => api.fetchFormDetail(formId as string),
    enabled: Boolean(formId) && enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useResponse(submissionId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: keys.response(submissionId ?? ''),
    queryFn: () => api.fetchResponse(submissionId as string),
    enabled: Boolean(submissionId) && enabled,
    retry: false,
  });
}

export function useInbox() {
  return useQuery({ queryKey: keys.inbox, queryFn: () => api.fetchInbox({ limit: 50 }) });
}

export function useUnreadCount(enabled = true) {
  return useQuery({ queryKey: keys.unread, queryFn: api.fetchUnreadCount, refetchInterval: 60_000, enabled });
}

export function useAssignableUsers(enabled: boolean) {
  return useQuery({ queryKey: keys.assignable, queryFn: () => api.fetchAssignableUsers(), enabled, staleTime: 5 * 60_000 });
}

// ── Ações ───────────────────────────────────────────────────────────────────

export function useMovePhase(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (phaseId: string) => api.movePhase(id, phaseId),
    onSettled: () => invalidateSolicitation(qc, id),
  });
}

export function useSavePhaseValues(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: SavePhaseFieldValueInput[]) => api.savePhaseFieldValues(id, items),
    onSuccess: () => invalidateSolicitation(qc, id),
  });
}

export function useRequestPhaseApproval(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.requestPhaseApproval(id),
    onSettled: () => invalidateSolicitation(qc, id),
  });
}

export function useDecideStep(solicitationId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { stepId: string; decision: 'approved' | 'rejected'; comment?: string }) =>
      api.decideApprovalStep(input.stepId, input.decision, input.comment),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.myPending });
      void qc.invalidateQueries({ queryKey: ['approval'] });
      if (solicitationId) invalidateSolicitation(qc, solicitationId);
      else {
        void qc.invalidateQueries({ queryKey: ['solicitation'] });
        void qc.invalidateQueries({ queryKey: ['kanban'] });
      }
    },
  });
}

export function useAddComment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { content: string; isInternal?: boolean }) => api.addComment(id, input.content, input.isInternal),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.comments(id) });
      void qc.invalidateQueries({ queryKey: keys.history(id) });
    },
  });
}

export function useUploadAttachment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { file: LocalFile; label?: UploadLabel; phaseId?: string }) =>
      api.uploadAttachment(id, input.file, input.label, input.phaseId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.attachments(id) }),
  });
}

export function useUpdateAttachment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { attachmentId: string; patch: UploadLabel }) => api.updateAttachment(input.attachmentId, input.patch),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.attachments(id) }),
  });
}

export function useDeleteAttachment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (attachmentId: string) => api.deleteAttachment(attachmentId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.attachments(id) }),
  });
}

export function useUpdateAssignee(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assigneeId: string | null) => api.updateAssignee(id, assigneeId),
    onSettled: () => invalidateSolicitation(qc, id),
  });
}

export function useUpdatePriority(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (priority: SolicitationPriority) => api.updatePriority(id, priority),
    onSettled: () => invalidateSolicitation(qc, id),
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.markInboxRead(id),
    onSettled: () => void qc.invalidateQueries({ queryKey: keys.inbox }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.markAllInboxRead,
    onSettled: () => void qc.invalidateQueries({ queryKey: keys.inbox }),
  });
}
