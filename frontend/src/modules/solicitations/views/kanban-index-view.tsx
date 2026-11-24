import { AlertTriangle, ClipboardList, Inbox, RefreshCw, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../../../lib/cn';
import { useMyPendingApprovalsQuery } from '../../approvals/hooks/use-my-pending-approvals-query';
import { useKanbanSummaryQuery } from '../hooks/use-kanban-summary-query';
import type { KanbanFormSummary } from '../types';

export const UNASSIGNED_FORM_PARAM = 'unassigned';

function formToParam(formId: string | null): string {
  return formId ?? UNASSIGNED_FORM_PARAM;
}

function SkeletonBlock() {
  return (
    <div className="animate-pulse rounded-[10px] border border-border-default bg-bg-surface p-5 dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-3 h-4 w-2/3 rounded bg-border-default dark:bg-slate-600" />
      <div className="h-8 w-16 rounded bg-border-default dark:bg-slate-600" />
    </div>
  );
}

function FormBlockCard({ summary }: { summary: KanbanFormSummary }) {
  return (
    <Link
      to={`/kanban/${formToParam(summary.formId)}`}
      className="group flex min-w-0 flex-col gap-4 rounded-[10px] border border-border-default bg-bg-surface p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md dark:border-slate-700 dark:bg-slate-800"
    >
      {/* `min-w-0` na cadeia toda: o nome do formulário usa truncate (nowrap) e
          sem isso o min-content dele alarga o card além da tela no celular. */}
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] bg-primary/10 text-primary">
            <ClipboardList className="h-4.5 w-4.5" />
          </span>
          <p className="truncate text-[15px] font-bold text-tx-primary dark:text-slate-100" title={summary.formName}>
            {summary.formName}
          </p>
        </div>
        {summary.urgentCount > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700">
            <AlertTriangle className="h-3 w-3" />
            {summary.urgentCount} urgente{summary.urgentCount > 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="flex min-w-0 items-end justify-between gap-3">
        <div>
          <p className="text-3xl font-extrabold text-tx-primary dark:text-slate-100">{summary.totalCards}</p>
          <p className="text-xs text-tx-secondary dark:text-slate-400">
            solicitaç{summary.totalCards === 1 ? 'ão ativa' : 'ões ativas'}
          </p>
        </div>
        <span className="text-sm font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100">
          Abrir board →
        </span>
      </div>
    </Link>
  );
}

export function KanbanIndexView() {
  const { data, isLoading, isError, refetch, isFetching } = useKanbanSummaryQuery();
  // A tela de Aprovações saiu do menu: a pendência aparece aqui e nos cards de cada board.
  const { data: pendingApprovalSteps = [] } = useMyPendingApprovalsQuery();
  const pendingCount = new Set(pendingApprovalSteps.map((step) => step.approval.solicitationId)).size;

  return (
    <section className="grid gap-5">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-tx-primary">Kanban</h1>
          <p className="mt-1 text-sm text-tx-secondary">
            Escolha um processo para abrir o board das solicitações dele.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          title="Atualizar"
          className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-border-default bg-bg-surface px-3 text-sm font-semibold text-tx-secondary transition-colors hover:bg-bg-s2 disabled:opacity-50"
        >
          <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          Atualizar
        </button>
      </header>

      {pendingCount > 0 ? (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>
            <strong>
              {pendingCount} {pendingCount === 1 ? 'solicitação aguarda' : 'solicitações aguardam'} sua aprovação.
            </strong>{' '}
            Abra o board do processo: os cards pendentes ficam marcados e o filtro “Minhas aprovações” mostra só eles.
          </span>
        </div>
      ) : null}

      {isError && (
        <div className="flex flex-col items-center gap-3 rounded-[10px] border border-[#fecaca] bg-[#fef2f2] px-6 py-10 text-center">
          <p className="text-sm font-bold text-[#dc2626]">
            Não foi possível carregar os processos. Verifique sua conexão e tente novamente.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[#fecaca] bg-bg-surface px-4 text-sm font-bold text-[#dc2626] hover:bg-[#fef2f2]"
          >
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </button>
        </div>
      )}

      {!isError && (
        isLoading ? (
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonBlock key={i} />
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-[10px] border border-border-default bg-bg-s2 px-6 py-16 text-center dark:border-slate-700 dark:bg-slate-800">
            <Inbox className="h-10 w-10 text-tx-ph dark:text-slate-600" />
            <p className="text-sm font-semibold text-tx-secondary dark:text-slate-300">
              Nenhuma solicitação ativa no momento.
            </p>
          </div>
        ) : (
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((summary) => (
              <FormBlockCard key={formToParam(summary.formId)} summary={summary} />
            ))}
          </div>
        )
      )}
    </section>
  );
}
