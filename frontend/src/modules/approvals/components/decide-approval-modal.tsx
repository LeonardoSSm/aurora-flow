import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Button, FieldLabel, useToast } from '../../../components/ui';
import { queryKeys } from '../../../lib/query-keys';
import { PhaseFieldValuesSummary } from '../../kanban-phases/components/phase-field-values-summary';
import { useKanbanPhasesQuery } from '../../kanban-phases/hooks/use-kanban-phases-query';
import { AttachmentPreview } from '../../solicitations/components/attachment-display';
import { usePhaseAttachmentsQuery } from '../../solicitations/hooks/use-solicitation-attachments';
import {
  fetchPhaseFieldValues,
  fetchSolicitationById,
} from '../../solicitations/services/solicitations-api';
import type { Approval, Solicitation } from '../../solicitations/types';
import { useSolicitationApprovalsQuery } from '../hooks/use-solicitation-approvals-query';
import { useDecideApprovalStepMutation } from '../hooks/use-decide-approval-step-mutation';
import { getApiErrorMessage } from './approval-modal-utils';
import { ApprovalModalShell } from './approval-modal-shell';
import { SolicitationErpDetails } from '../../solicitations/components/solicitation-erp-details';

export type DecideApprovalTarget = {
  stepId: string;
  approvalId: string;
  solicitationId: string;
  approvalTitle: string;
  approvalDescription?: string | null;
  solicitation?: Solicitation | null;
};

type DecideApprovalModalProps = {
  target: DecideApprovalTarget;
  onClose: () => void;
};

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-1 rounded-xl bg-surface-container-low px-3 py-2">
      <span className="text-xs font-bold uppercase text-tx-secondary">{label}</span>
      <span className="break-words text-sm text-tx-primary">{value}</span>
    </div>
  );
}

export function DecideApprovalModal({ target, onClose }: DecideApprovalModalProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const mutation = useDecideApprovalStepMutation(target.solicitationId);
  const [comment, setComment] = useState('');
  const [commentError, setCommentError] = useState('');
  const [apiError, setApiError] = useState('');

  const solicitationQuery = useQuery({
    queryKey: queryKeys.solicitations.byId(target.solicitationId),
    queryFn: () => fetchSolicitationById(target.solicitationId),
    initialData: target.solicitation ?? undefined,
    enabled: !target.solicitation,
  });

  const approvalsQuery = useSolicitationApprovalsQuery(target.solicitationId);
  const approval = useMemo<Approval | null>(() => {
    return approvalsQuery.data?.find((item) => item.id === target.approvalId) ?? null;
  }, [approvalsQuery.data, target.approvalId]);

  const solicitation = solicitationQuery.data ?? target.solicitation ?? null;
  const approvalTitle = approval?.title ?? target.approvalTitle;
  const approvalDescription =
    approval?.description ?? target.approvalDescription ?? 'Sem descricao informada.';

  const phaseAttachmentsQuery = usePhaseAttachmentsQuery(
    target.solicitationId,
    approval?.phaseId ?? undefined,
  );
  const phaseAttachments = phaseAttachmentsQuery.data ?? [];

  // O que o operador enviou nesta fase (ex.: a quantidade produzida) — é o dado que o
  // aprovador precisa ver para decidir, junto com a foto e a validação por IA.
  const phasesQuery = useKanbanPhasesQuery(solicitation?.formId ?? null);
  const phaseValuesQuery = useQuery({
    queryKey: queryKeys.solicitations.phaseFieldValues(target.solicitationId),
    queryFn: () => fetchPhaseFieldValues(target.solicitationId),
    enabled: Boolean(approval?.phaseId),
  });
  const approvalPhase = approval?.phaseId
    ? phasesQuery.data?.find((phase) => phase.id === approval.phaseId)
    : undefined;

  function handleDecision(decision: 'approved' | 'rejected') {
    setCommentError('');
    setApiError('');

    const normalizedComment = comment.trim();
    if (decision === 'rejected' && !normalizedComment) {
      setCommentError('Comentario obrigatorio para reprovar.');
      return;
    }

    mutation.mutate(
      {
        stepId: target.stepId,
        dto: {
          decision,
          comment: normalizedComment || undefined,
        },
      },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.solicitations.kanbanBoard(),
          });
          void queryClient.invalidateQueries({
            queryKey: queryKeys.solicitations.byId(target.solicitationId),
          });
          void queryClient.invalidateQueries({
            queryKey: ['solicitations', target.solicitationId],
          });
          void queryClient.invalidateQueries({
            queryKey: queryKeys.approvals.myPending(),
          });
          void queryClient.invalidateQueries({
            queryKey: queryKeys.approvals.bySolicitation(target.solicitationId),
          });
          showToast({
            title: decision === 'approved' ? 'Aprovacao registrada' : 'Reprovacao registrada',
            variant: 'success',
          });
          onClose();
        },
        onError: (error) => {
          setApiError(getApiErrorMessage(error, 'Nao foi possivel registrar a decisao.'));
        },
      },
    );
  }

  return (
    <ApprovalModalShell
      title={approvalTitle}
      description={approvalDescription}
      onClose={onClose}
      closeDisabled={mutation.isPending}
      footer={
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
          <Button
            variant="subtle"
            size="sm"
            className="order-last col-span-2 min-h-11 sm:order-none sm:col-span-1 sm:min-h-0"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            className="min-h-11 bg-red-600 text-white hover:opacity-90 sm:min-h-0"
            disabled={mutation.isPending}
            onClick={() => handleDecision('rejected')}
          >
            {mutation.isPending ? 'Enviando...' : 'Reprovar'}
          </Button>
          <Button
            size="sm"
            className="min-h-11 bg-emerald-600 text-white hover:opacity-90 sm:min-h-0"
            disabled={mutation.isPending}
            onClick={() => handleDecision('approved')}
          >
            {mutation.isPending ? 'Enviando...' : 'Aprovar'}
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Detail label="Solicitacao" value={solicitation?.title ?? target.solicitationId} />
        <Detail label="Formulario" value={solicitation?.form?.name ?? '-'} />
        <Detail
          label="Solicitante"
          value={
            solicitation?.submission?.responderName ??
            solicitation?.submission?.responderEmail ??
            solicitation?.createdByUser?.fullName ??
            '-'
          }
        />
        <Detail label="Responsavel" value={solicitation?.assignee?.fullName ?? '-'} />
      </div>

      {/* Ficha de cada "Lista do ERP" respondida (ex.: o pedido), para decidir sem sair daqui. */}
      <SolicitationErpDetails solicitationId={target.solicitationId} />

      <PhaseFieldValuesSummary phase={approvalPhase} values={phaseValuesQuery.data ?? []} />

      {approval?.phaseId && phaseAttachments.length > 0 ? (
        <div className="grid grid-cols-1 gap-2">
          <span className="text-xs font-bold uppercase text-tx-secondary">Anexos desta fase</span>
          <div
            className={[
              'grid grid-cols-1 gap-3',
              phaseAttachments.length > 1 ? 'sm:grid-cols-2' : '',
            ].join(' ')}
          >
            {phaseAttachments.map((attachment) => (
              <AttachmentPreview key={attachment.id} attachment={attachment} />
            ))}
          </div>
        </div>
      ) : null}

      <FieldLabel>
        Comentario
        <textarea
          rows={4}
          value={comment}
          placeholder="Informe o motivo em caso de reprovação"
          onChange={(event) => {
            setComment(event.target.value);
            if (commentError) setCommentError('');
          }}
          className={[
            'w-full rounded-xl border bg-surface-container-low px-3 py-2 text-base text-tx-primary outline-none ring-primary/30 placeholder:text-tx-secondary focus:ring-2 sm:text-sm',
            commentError ? 'border-red-300' : 'border-border-default/50',
          ].join(' ')}
        />
        {commentError ? <span className="text-xs font-semibold text-red-600">{commentError}</span> : null}
      </FieldLabel>

      {apiError ? (
        <p className="break-words rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {apiError}
        </p>
      ) : null}
    </ApprovalModalShell>
  );
}
