import { useMutation, useQuery } from '@tanstack/react-query';
import { queryClient } from '../../../lib/query-client';
import { queryKeys } from '../../../lib/query-keys';
import {
  deleteAttachment,
  fetchSolicitationAttachments,
  requestPhaseApproval,
  updateAttachment,
  uploadPhaseAttachment,
  uploadSolicitationAttachment,
} from '../services/solicitations-api';
import type { UploadLabel } from '../../../lib/attachment-upload';

type UploadInput = { file: File; label?: UploadLabel };

export function useSolicitationAttachmentsQuery(solicitationId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.solicitations.attachments(solicitationId ?? ''),
    queryFn: () => fetchSolicitationAttachments(solicitationId ?? ''),
    enabled: Boolean(solicitationId),
  });
}

/** Anexos vinculados a uma fase específica da solicitação (ex.: a foto de validação de uma etapa que exige aprovação). */
export function usePhaseAttachmentsQuery(solicitationId: string | undefined, phaseId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.solicitations.attachmentsByPhase(solicitationId ?? '', phaseId ?? ''),
    queryFn: () => fetchSolicitationAttachments(solicitationId ?? '', phaseId),
    enabled: Boolean(solicitationId) && Boolean(phaseId),
  });
}

export function useUploadPhaseAttachmentMutation(solicitationId: string, phaseId: string | undefined) {
  return useMutation({
    mutationFn: ({ file, label }: UploadInput) => uploadPhaseAttachment(solicitationId, phaseId ?? '', file, label),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.solicitations.attachments(solicitationId),
      });
      if (phaseId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.solicitations.attachmentsByPhase(solicitationId, phaseId),
        });
      }
    },
  });
}

export function useRequestPhaseApprovalMutation(solicitationId: string) {
  return useMutation({
    mutationFn: () => requestPhaseApproval(solicitationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.approvals.bySolicitation(solicitationId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.solicitations.history(solicitationId),
      });
    },
  });
}

export function useUploadAttachmentMutation(solicitationId: string) {
  return useMutation({
    mutationFn: ({ file, label }: UploadInput) => uploadSolicitationAttachment(solicitationId, file, label),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.solicitations.attachments(solicitationId),
      });
    },
  });
}

export function useUpdateAttachmentMutation(solicitationId: string) {
  return useMutation({
    mutationFn: ({ id, name, description }: { id: string; name?: string; description?: string }) =>
      updateAttachment(id, { name, description }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.solicitations.attachments(solicitationId),
      });
    },
  });
}

export function useDeleteAttachmentMutation(solicitationId: string) {
  return useMutation({
    mutationFn: (attachmentId: string) => deleteAttachment(attachmentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.solicitations.attachments(solicitationId),
      });
    },
  });
}
