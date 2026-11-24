import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, SectionHeader } from '../../../components/ui';
import {
  DecideApprovalModal,
  type DecideApprovalTarget,
} from '../components/decide-approval-modal';
import { useMyPendingApprovalsQuery } from '../hooks/use-my-pending-approvals-query';
import type { ApprovalStepWithContext } from '../../solicitations/types';

function StepStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300',
    approved: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
    rejected: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
    skipped: 'bg-gray-100 text-gray-600 dark:bg-slate-500/20 dark:text-slate-300',
  };
  const labels: Record<string, string> = {
    pending: 'Pendente',
    approved: 'Aprovado',
    rejected: 'Rejeitado',
    skipped: 'Ignorado',
  };
  return (
    <span className={['inline-flex rounded-full px-2 py-0.5 text-xs font-bold', map[status] ?? 'bg-gray-100 text-gray-600 dark:bg-slate-500/20 dark:text-slate-300'].join(' ')}>
      {labels[status] ?? status}
    </span>
  );
}

function toTarget(step: ApprovalStepWithContext): DecideApprovalTarget {
  return {
    stepId: step.id,
    approvalId: step.approval.id,
    solicitationId: step.approval.solicitationId,
    approvalTitle: step.approval.title,
    approvalDescription: step.approval.description,
  };
}

function PendingStepCard({
  step,
  onDecide,
}: {
  step: ApprovalStepWithContext;
  onDecide: (target: DecideApprovalTarget) => void;
}) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-2 rounded-xl border border-border-default bg-surface-container-low p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 basis-40">
          <p className="break-words text-sm font-bold text-tx-primary">{step.approval.title}</p>
          <p className="mt-0.5 text-xs text-tx-secondary">
            Solicitação #{step.approval.solicitationId.slice(0, 8)}
          </p>
        </div>
        <StepStatusBadge status={step.status} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-tx-secondary">
        <span>Etapa {step.order}</span>
        <span>
          Criada em {new Date(step.approval.createdAt).toLocaleDateString('pt-BR')}
        </span>
      </div>

      <p className="text-xs text-tx-secondary italic">
        Esta etapa aguarda sua decisão.
      </p>

      <div className="flex justify-end">
        <Button
          size="sm"
          className="min-h-11 w-full sm:min-h-0 sm:w-auto"
          onClick={() => onDecide(toTarget(step))}
        >
          Decidir
        </Button>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="grid gap-2 rounded-xl border border-border-default bg-surface-container-low p-4 animate-pulse">
      <div className="h-4 w-2/3 rounded bg-outline-variant/40" />
      <div className="h-3 w-1/3 rounded bg-outline-variant/30" />
      <div className="h-3 w-1/2 rounded bg-outline-variant/20" />
    </div>
  );
}

export function ApprovalsView() {
  const { data: steps, isLoading, isError } = useMyPendingApprovalsQuery();
  const [decisionTarget, setDecisionTarget] = useState<DecideApprovalTarget | null>(null);
  // Link do e-mail "Aprovação pendente" (/aprovacoes?id=<aprovação>): abre a decisão direto.
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedApprovalId = searchParams.get('id');
  const [linkNotFound, setLinkNotFound] = useState(false);
  const handledLinkRef = useRef<string | null>(null);

  useEffect(() => {
    if (!linkedApprovalId || !steps || handledLinkRef.current === linkedApprovalId) return;
    handledLinkRef.current = linkedApprovalId;
    const step = steps.find((item) => item.approval.id === linkedApprovalId);
    if (step) setDecisionTarget(toTarget(step));
    else setLinkNotFound(true);
  }, [linkedApprovalId, steps]);

  function closeDecision() {
    setDecisionTarget(null);
    if (linkedApprovalId) {
      const next = new URLSearchParams(searchParams);
      next.delete('id');
      setSearchParams(next, { replace: true });
    }
  }

  return (
    <section className="grid min-w-0 grid-cols-1 gap-4">
      <SectionHeader
        title="Aprovações"
        description="Etapas de aprovação pendentes atribuídas a você."
        className="md:items-start"
      />

      {linkNotFound ? (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          A aprovação do link não está mais pendente para você — já foi decidida ou não está na sua fila.
        </p>
      ) : null}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm font-semibold text-red-600">
          Erro ao carregar aprovações. Tente novamente.
        </p>
      ) : !steps || steps.length === 0 ? (
        <div className="rounded-xl border border-border-default bg-surface-container-low px-6 py-12 text-center">
          <p className="text-sm font-semibold text-tx-primary">Nenhuma aprovação pendente</p>
          <p className="mt-1 text-xs text-tx-secondary">
            Você não tem etapas aguardando sua decisão no momento.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-tx-secondary">
            <strong>{steps.length}</strong> etapa{steps.length !== 1 ? 's' : ''} pendente
            {steps.length !== 1 ? 's' : ''}.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {steps.map((step) => (
              <PendingStepCard key={step.id} step={step} onDecide={setDecisionTarget} />
            ))}
          </div>
        </>
      )}

      {decisionTarget ? (
        <DecideApprovalModal target={decisionTarget} onClose={closeDecision} />
      ) : null}
    </section>
  );
}
