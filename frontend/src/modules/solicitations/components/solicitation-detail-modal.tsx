import { useQuery } from '@tanstack/react-query';
import { FileText, ListChecks, X } from 'lucide-react';
import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../app/auth-context';
import { brandCssVars } from '../../../brand/css-vars';
import { useBrand } from '../../../brand/hooks/useBrand';
import { useEscapeKey } from '../../../hooks/use-escape-key';
import { queryKeys } from '../../../lib/query-keys';
import { ResponseDetailModal } from '../../responses/components/response-detail-modal';
import { CreateApprovalModal } from '../../approvals/components/create-approval-modal';
import {
  DecideApprovalModal,
  type DecideApprovalTarget,
} from '../../approvals/components/decide-approval-modal';
import { useCancelApprovalMutation } from '../../approvals/hooks/use-cancel-approval-mutation';
import { useSolicitationApprovalsQuery } from '../../approvals/hooks/use-solicitation-approvals-query';
import { fetchSolicitationById, fetchSolicitationHistory } from '../services/solicitations-api';
import { SolicitationDetail } from './solicitation-detail';

export function SolicitationDetailModal({
  solicitationId,
  onClose,
}: {
  solicitationId: string;
  onClose: () => void;
}) {
  const brand = useBrand();
  const navigate = useNavigate();
  const { user, can } = useAuth();

  const detailQuery = useQuery({
    queryKey: queryKeys.solicitations.byId(solicitationId),
    queryFn: () => fetchSolicitationById(solicitationId),
  });
  // O que dá para fazer neste card vem do vínculo com o processo dele.
  const cardFormId = detailQuery.data?.formId ?? null;
  const canManageApprovals = can('approvals.manage', cardFormId);
  const canManageAllAttachments = can('attachments.manage_all', cardFormId);
  const canViewInternalComments = can('comments.view_internal', cardFormId);

  const historyQuery = useQuery({
    queryKey: queryKeys.solicitations.history(solicitationId),
    queryFn: () => fetchSolicitationHistory(solicitationId),
  });
  const { data: approvals = [], isLoading: loadingApprovals } =
    useSolicitationApprovalsQuery(solicitationId);
  const cancelMutation = useCancelApprovalMutation(solicitationId);

  const [cancellingApprovalId, setCancellingApprovalId] = useState<string | null>(null);
  const [isCreateApprovalOpen, setIsCreateApprovalOpen] = useState(false);
  const [decisionTarget, setDecisionTarget] = useState<DecideApprovalTarget | null>(null);
  const [showResponses, setShowResponses] = useState(false);
  const titleId = useId();
  useEscapeKey(onClose, !showResponses && !isCreateApprovalOpen && !decisionTarget);

  function handleCancelApproval(approvalId: string) {
    setCancellingApprovalId(approvalId);
    cancelMutation.mutate(approvalId, {
      onSettled: () => setCancellingApprovalId(null),
    });
  }

  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-[#071a38]/50 px-4 py-6"
      style={brandCssVars(brand)}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[90vh] w-full max-w-[960px] flex-col overflow-hidden rounded-[14px] bg-bg-surface shadow-2xl"
      >
        <header className="flex items-center justify-between gap-4 border-b border-border-default px-5 py-4">
          <h3 id={titleId} className="truncate text-lg font-bold text-tx-primary">
            Solicitação
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-bg-hover"
          >
            <X className="h-5 w-5 text-tx-secondary" />
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-2 border-b border-border-default px-5 py-3">
          {detailQuery.data?.formId && (
            <button
              type="button"
              onClick={() => navigate(`/builder?formId=${detailQuery.data?.formId}`)}
              className="inline-flex items-center gap-1.5 rounded-[8px] border border-border-default px-3 py-1.5 text-xs font-bold text-tx-secondary hover:border-primary hover:text-primary"
            >
              <FileText className="h-3.5 w-3.5" />
              Ver processo
            </button>
          )}
          {/* Quem vê o card abre as respostas que o originaram (o backend confere pelo card). */}
          {(
            <button
              type="button"
              onClick={() => setShowResponses(true)}
              className="inline-flex items-center gap-1.5 rounded-[8px] border border-border-default px-3 py-1.5 text-xs font-bold text-tx-secondary hover:border-primary hover:text-primary"
            >
              <ListChecks className="h-3.5 w-3.5" />
              Ver respostas
            </button>
          )}
        </div>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-5 py-5">
          <SolicitationDetail
            solicitation={detailQuery.data ?? null}
            history={historyQuery.data ?? []}
            approvals={approvals}
            loading={detailQuery.isFetching}
            loadingHistory={historyQuery.isFetching}
            loadingApprovals={loadingApprovals}
            canManageApprovals={canManageApprovals}
            canManageTracking={canManageApprovals}
            canUploadAttachments={Boolean(user)}
            currentUserId={user?.id ?? null}
            canManageAllAttachments={canManageAllAttachments}
            canViewInternalComments={canViewInternalComments}
            onCancelApproval={handleCancelApproval}
            cancellingApprovalId={cancellingApprovalId}
            onNewApproval={() => setIsCreateApprovalOpen(true)}
            onDecideApproval={setDecisionTarget}
          />
        </div>
      </section>

      {isCreateApprovalOpen ? (
        <CreateApprovalModal
          solicitationId={solicitationId}
          onClose={() => setIsCreateApprovalOpen(false)}
        />
      ) : null}

      {decisionTarget ? (
        <DecideApprovalModal target={decisionTarget} onClose={() => setDecisionTarget(null)} />
      ) : null}

      {showResponses ? (
        <ResponseDetailModal
          solicitationId={solicitationId}
          formId={detailQuery.data?.formId ?? null}
          onClose={() => setShowResponses(false)}
        />
      ) : null}
    </div>
  );
}
