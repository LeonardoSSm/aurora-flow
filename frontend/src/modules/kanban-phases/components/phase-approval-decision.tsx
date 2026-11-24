import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useToast } from '../../../components/ui';
import { queryKeys } from '../../../lib/query-keys';
import { getApiErrorMessage } from '../../approvals/components/approval-modal-utils';
import { stepAssigneeLabel } from '../../approvals/components/external-step-info';
import { useDecideApprovalStepMutation } from '../../approvals/hooks/use-decide-approval-step-mutation';
import type { ApprovalStep } from '../../solicitations/types';

const STEP_STATUS_LABEL: Record<string, string> = {
  pending: 'Aguardando',
  approved: 'Aprovado',
  rejected: 'Reprovado',
  skipped: 'Pulado',
  waiting: 'Na fila',
};

const STEP_STATUS_CLASS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  approved: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
  skipped: 'bg-gray-100 text-gray-500 dark:bg-slate-500/20 dark:text-slate-300',
  waiting: 'bg-gray-100 text-gray-500 dark:bg-slate-500/20 dark:text-slate-300',
};

/** Quem aprova e em que pé está cada um (com o comentário de quem já decidiu). */
export function ApprovalStepsList({ steps }: { steps: ApprovalStep[] }) {
  if (steps.length === 0) return null;
  return (
    <ul className="grid gap-1" aria-label="Aprovadores">
      {[...steps]
        .sort((a, b) => a.order - b.order)
        .map((step) => (
          <li key={step.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="min-w-0 truncate text-tx-secondary">{stepAssigneeLabel(step)}</span>
            <span className="flex min-w-0 items-center gap-2">
              {step.decision?.comment ? (
                <span className="max-w-[200px] truncate italic text-tx-secondary" title={step.decision.comment}>
                  "{step.decision.comment}"
                </span>
              ) : null}
              <span
                className={[
                  'inline-flex shrink-0 rounded-full px-2 py-0.5 font-bold',
                  STEP_STATUS_CLASS[step.status] ?? 'bg-gray-100 text-gray-500 dark:bg-slate-500/20 dark:text-slate-300',
                ].join(' ')}
              >
                {STEP_STATUS_LABEL[step.status] ?? step.status}
              </span>
            </span>
          </li>
        ))}
    </ul>
  );
}

/**
 * Decisão de quem aprova, dentro do card da fase: comentário (obrigatório para reprovar) e os
 * botões. A tela de Aprovações saiu do menu; quem aprova decide aqui, vendo o que foi enviado.
 */
export function PhaseApprovalDecision({
  stepId,
  solicitationId,
  onDecided,
}: {
  stepId: string;
  solicitationId: string;
  onDecided: () => void;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const mutation = useDecideApprovalStepMutation(solicitationId);
  const [comment, setComment] = useState('');
  const [commentError, setCommentError] = useState('');
  const [apiError, setApiError] = useState('');

  function decide(decision: 'approved' | 'rejected') {
    setCommentError('');
    setApiError('');
    const normalized = comment.trim();
    if (decision === 'rejected' && !normalized) {
      setCommentError('Escreva o motivo para reprovar.');
      return;
    }
    mutation.mutate(
      { stepId, dto: { decision, comment: normalized || undefined } },
      {
        onSuccess: () => {
          // "Para você" da Home também lista a pendência.
          void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.panel() });
          showToast({
            title: decision === 'approved' ? 'Aprovação registrada' : 'Reprovação registrada',
            variant: 'success',
          });
          onDecided();
        },
        onError: (error) => setApiError(getApiErrorMessage(error, 'Não foi possível registrar a decisão.')),
      },
    );
  }

  return (
    <div className="grid gap-2">
      <label className="grid gap-1 text-xs font-bold uppercase text-tx-secondary">
        Comentário
        <textarea
          rows={3}
          value={comment}
          placeholder="Obrigatório para reprovar"
          aria-invalid={Boolean(commentError)}
          onChange={(event) => {
            setComment(event.target.value);
            if (commentError) setCommentError('');
          }}
          className={[
            'w-full rounded-xl border bg-bg-surface px-3 py-2 text-base font-normal normal-case text-tx-primary outline-none ring-primary/30 placeholder:text-tx-secondary focus:ring-2 sm:text-sm',
            commentError ? 'border-red-300' : 'border-border-default',
          ].join(' ')}
        />
      </label>
      {commentError ? (
        <p role="alert" className="text-xs font-semibold text-red-600">
          {commentError}
        </p>
      ) : null}
      {apiError ? (
        <p role="alert" className="break-words rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          {apiError}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
        <button
          type="button"
          disabled={mutation.isPending}
          onClick={() => decide('rejected')}
          className="h-11 rounded-[8px] bg-red-600 px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60 sm:h-9"
        >
          Reprovar
        </button>
        <button
          type="button"
          disabled={mutation.isPending}
          onClick={() => decide('approved')}
          className="h-11 rounded-[8px] bg-emerald-600 px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60 sm:h-9"
        >
          {mutation.isPending ? 'Enviando...' : 'Aprovar'}
        </button>
      </div>
    </div>
  );
}
