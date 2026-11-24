import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  GitMerge,
  Loader2,
  XCircle,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import { queryKeys } from '../../../lib/query-keys';
import { fetchFlowExecutions } from '../services/flows-api';
import type { FlowExecution } from '../types/flow.types';

function formatDt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mo} ${hh}:${mm}`;
}

function durationMs(exec: FlowExecution): string {
  if (!exec.startedAt || !exec.completedAt) return '—';
  const ms = new Date(exec.completedAt).getTime() - new Date(exec.startedAt).getTime();
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function StatusIcon({ status }: { status: FlowExecution['status'] }) {
  if (status === 'success') return <CheckCircle2 className="h-4 w-4 text-[#16a34a]" />;
  if (status === 'failed') return <XCircle className="h-4 w-4 text-[#ef4444]" />;
  if (status === 'partial_failure') return <AlertTriangle className="h-4 w-4 text-[#d97706]" />;
  return <Loader2 className="h-4 w-4 animate-spin text-tx-secondary" />;
}

interface Props {
  flowId: string;
  selectedExecutionId: string | null;
  onSelectExecution: (exec: FlowExecution) => void;
}

export function FlowHistoryPanel({ flowId, selectedExecutionId, onSelectExecution }: Props) {
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.flows.executions(flowId),
    queryFn: () => fetchFlowExecutions(flowId, 1, 10),
    enabled: open,
    refetchInterval: open ? 10_000 : false,
  });

  const executions = data?.data ?? [];

  return (
    <div className="shrink-0 border-t border-border-strong bg-bg-surface">
      {/* Toggle bar */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2 text-xs font-bold text-tx-secondary hover:bg-bg-s2"
      >
        <Zap className="h-3.5 w-3.5 text-primary" />
        <span className="flex-1 text-left">
          Histórico de execuções
          {data && data.total > 0 && (
            <span className="ml-1.5 rounded-full bg-bg-hover px-1.5 py-0.5 text-[10px] text-primary">
              {data.total}
            </span>
          )}
        </span>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
      </button>

      {/* List */}
      {open && (
        <div className="max-h-[200px] overflow-y-auto border-t border-border-default">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-4 text-xs text-tx-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Carregando execuções...
            </div>
          )}

          {!isLoading && executions.length === 0 && (
            <p className="py-4 text-center text-xs text-tx-muted">Nenhuma execução registrada.</p>
          )}

          {executions.map((exec) => {
            const isSelected = exec.id === selectedExecutionId;
            return (
              <button
                key={exec.id}
                type="button"
                onClick={() => onSelectExecution(exec)}
                className={[
                  'flex w-full items-center gap-3 border-b border-border-subtle px-4 py-2.5 text-left hover:bg-bg-s2',
                  isSelected ? 'bg-bg-hover' : '',
                ].join(' ')}
              >
                <StatusIcon status={exec.status} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-tx-primary">
                    {formatDt(exec.startedAt)}
                    {!exec.submissionId && (
                      <span className="ml-2 rounded bg-[#f0fdf4] px-1 text-[10px] text-[#16a34a]">
                        teste
                      </span>
                    )}
                    {exec.parentExecutionId && (
                      <span
                        className="ml-2 inline-flex items-center gap-0.5 rounded bg-violet-100 px-1 text-[10px] text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
                        title="Sub-execução disparada por outro fluxo"
                      >
                        <GitMerge className="h-2.5 w-2.5" />
                        sub-fluxo
                      </span>
                    )}
                  </p>
                  {exec.errorMessage && (
                    <p className="truncate text-[11px] text-[#ef4444]">{exec.errorMessage}</p>
                  )}
                </div>
                <span className="shrink-0 text-[11px] text-tx-muted">
                  {durationMs(exec)} · {exec.nodeResults?.length ?? 0} nós
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
