import { useState } from 'react';
import { AlertTriangle, FileDown, X } from 'lucide-react';
import { Button, SectionHeader } from '../../../components/ui';
import { useAuth } from '../../../app/auth-context';
import { CreateApprovalModal } from '../../approvals/components/create-approval-modal';
import {
  DecideApprovalModal,
  type DecideApprovalTarget,
} from '../../approvals/components/decide-approval-modal';
import { useSolicitationApprovalsQuery } from '../../approvals/hooks/use-solicitation-approvals-query';
import { useCancelApprovalMutation } from '../../approvals/hooks/use-cancel-approval-mutation';
import { ExportReportModal } from '../../reports/export-report-modal';
import { SolicitationDetail } from '../components/solicitation-detail';
import { SolicitationsList } from '../components/solicitations-list';
import { SolicitationsSummary } from '../components/solicitations-summary';
import { SolicitationsToolbar } from '../components/solicitations-toolbar';
import { useSolicitationsManagement } from '../hooks/use-solicitations-management';

export function SolicitationsView() {
  const { user, hasPermission, can } = useAuth();

  const {
    query,
    statusFilter,
    priorityFilter,
    solicitations,
    totalSolicitations,
    currentPage,
    totalPages,
    selectedSolicitationId,
    selectedSolicitation,
    history,
    loadingList,
    loadingDetail,
    loadingHistory,
    error,
    notice,
    dismissNotice,
    setQuery,
    setStatusFilter,
    setPriorityFilter,
    setPage,
    setSelectedSolicitationId,
    reload,
  } = useSolicitationsManagement();

  // O que dá para fazer na solicitação aberta vem do vínculo com o processo dela.
  const selectedFormId = selectedSolicitation?.formId ?? null;
  const canManageApprovals = can('approvals.manage', selectedFormId);
  const canManageAllAttachments = can('attachments.manage_all', selectedFormId);
  const canViewInternalComments = can('comments.view_internal', selectedFormId);

  const { data: approvals = [], isLoading: loadingApprovals } = useSolicitationApprovalsQuery(
    selectedSolicitationId,
  );
  const cancelMutation = useCancelApprovalMutation(selectedSolicitationId ?? '');
  const [cancellingApprovalId, setCancellingApprovalId] = useState<string | null>(null);
  const [isCreateApprovalOpen, setIsCreateApprovalOpen] = useState(false);
  const [decisionTarget, setDecisionTarget] = useState<DecideApprovalTarget | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  function handleCancelApproval(approvalId: string) {
    setCancellingApprovalId(approvalId);
    cancelMutation.mutate(approvalId, {
      onSettled: () => setCancellingApprovalId(null),
    });
  }

  function handleNewApproval() {
    if (!selectedSolicitationId) return;
    setIsCreateApprovalOpen(true);
  }

  return (
    <section className="grid gap-4">
      <SectionHeader
        title="Solicitações"
        description="Acompanhe solicitações manuais e geradas por submissões de formulários."
        className="md:items-start"
        action={
          hasPermission('approvals.manage') ? (
            <Button variant="subtle" size="sm" onClick={() => setIsExportModalOpen(true)}>
              <FileDown size={15} className="mr-1.5 inline" />
              Exportar relatório
            </Button>
          ) : undefined
        }
      />

      <SolicitationsSummary solicitations={solicitations} total={totalSolicitations} />

      <SolicitationsToolbar
        query={query}
        statusFilter={statusFilter}
        priorityFilter={priorityFilter}
        loading={loadingList}
        onQueryChange={setQuery}
        onStatusChange={setStatusFilter}
        onPriorityChange={setPriorityFilter}
        onReload={reload}
      />

      <p className="text-sm text-tx-secondary">
        Exibindo <strong>{solicitations.length}</strong> de{' '}
        <strong>{totalSolicitations}</strong> solicitacao(oes).
      </p>

      {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}

      {notice ? (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1">{notice}</p>
          <button
            type="button"
            onClick={dismissNotice}
            aria-label="Fechar aviso"
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full hover:bg-amber-100 dark:hover:bg-amber-900/60"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ) : null}

      {/* minmax(0,1fr): sem isso a trilha nunca encolhe abaixo do conteúdo. */}
      <div className="grid min-w-0 gap-4 xl:grid-cols-[420px_minmax(0,1fr)] xl:items-start">
        <SolicitationsList
          solicitations={solicitations}
          selectedId={selectedSolicitationId}
          loading={loadingList}
          onSelect={setSelectedSolicitationId}
        />

        <SolicitationDetail
          solicitation={selectedSolicitation}
          history={history}
          approvals={approvals}
          loading={loadingDetail}
          loadingHistory={loadingHistory}
          loadingApprovals={loadingApprovals}
          canManageApprovals={canManageApprovals}
          canManageTracking={canManageApprovals}
          canUploadAttachments={Boolean(user)}
          currentUserId={user?.id ?? null}
          canManageAllAttachments={canManageAllAttachments}
          canViewInternalComments={canViewInternalComments}
          onCancelApproval={handleCancelApproval}
          cancellingApprovalId={cancellingApprovalId}
          onNewApproval={handleNewApproval}
          onDecideApproval={setDecisionTarget}
        />
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            size="sm"
            variant="subtle"
            disabled={currentPage <= 1 || loadingList}
            onClick={() => setPage(currentPage - 1)}
          >
            ← Anterior
          </Button>
          <span className="text-sm text-tx-secondary">
            Página {currentPage} de {totalPages}
          </span>
          <Button
            size="sm"
            variant="subtle"
            disabled={currentPage >= totalPages || loadingList}
            onClick={() => setPage(currentPage + 1)}
          >
            Próximo →
          </Button>
        </div>
      )}

      {isCreateApprovalOpen && selectedSolicitationId ? (
        <CreateApprovalModal
          solicitationId={selectedSolicitationId}
          onClose={() => setIsCreateApprovalOpen(false)}
        />
      ) : null}

      {decisionTarget ? (
        <DecideApprovalModal target={decisionTarget} onClose={() => setDecisionTarget(null)} />
      ) : null}

      {isExportModalOpen ? (
        <ExportReportModal onClose={() => setIsExportModalOpen(false)} />
      ) : null}
    </section>
  );
}
