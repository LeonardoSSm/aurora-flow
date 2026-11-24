import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, ChevronDown, History } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../../app/auth-context';
import { useToast } from '../../../components/ui';
import { cn } from '../../../lib/cn';
import { queryKeys } from '../../../lib/query-keys';
import { getApiErrorMessage } from '../../approvals/components/approval-modal-utils';
import { extendPhaseSla, fetchPhaseTimeline } from '../../solicitations/services/solicitations-api';
import type { PhaseTimelineEntry } from '../../solicitations/types';
import { formatDuration } from '../lib/phase-sla';

const STATUS: Record<PhaseTimelineEntry['status'], { label: string; cls: string }> = {
  no_sla: { label: 'Sem prazo', cls: 'bg-bg-s2 text-tx-secondary' },
  on_time: { label: 'No prazo', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' },
  late: { label: 'Fora do prazo', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200' },
  on_track: { label: 'No prazo', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' },
  warning: { label: 'Perto de vencer', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' },
  breached: { label: 'Vencido', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200' },
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "2026-10-15T18:00" no fuso do navegador, para o input datetime-local. */
function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function ExtendForm({
  solicitationId,
  current,
  boardFormId,
  onDone,
}: {
  solicitationId: string;
  current: PhaseTimelineEntry;
  boardFormId: string | null;
  onDone: () => void;
}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [dueAt, setDueAt] = useState(() => toLocalInput(current.dueAt ?? new Date().toISOString()));
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: () => extendPhaseSla(solicitationId, { dueAt: new Date(dueAt).toISOString(), reason: reason.trim() || undefined }),
    onSuccess: (timeline) => {
      queryClient.setQueryData(queryKeys.solicitations.phaseTimeline(solicitationId), timeline);
      void queryClient.invalidateQueries({ queryKey: queryKeys.solicitations.kanbanBoard(boardFormId ?? undefined) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.solicitations.history(solicitationId) });
      showToast({ title: 'Prazo da fase alterado', variant: 'success' });
      onDone();
    },
    onError: (error) =>
      showToast({
        title: 'Não foi possível alterar o prazo',
        description: getApiErrorMessage(error, 'Tente novamente em instantes.'),
        variant: 'error',
      }),
  });

  return (
    <div className="grid gap-2 rounded-[8px] border border-dashed border-border-strong p-2.5">
      <label className="grid gap-1 text-xs font-semibold text-tx-secondary">
        Novo prazo da fase
        <input
          type="datetime-local"
          value={dueAt}
          onChange={(event) => setDueAt(event.target.value)}
          className="h-9 rounded-[8px] border border-border-default bg-bg-surface px-2.5 text-sm text-tx-primary outline-none focus:border-primary"
        />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-tx-secondary">
        Motivo (fica no histórico)
        <input
          value={reason}
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Ex.: fornecedor pediu mais um dia"
          className="h-9 rounded-[8px] border border-border-default bg-bg-surface px-2.5 text-sm text-tx-primary outline-none focus:border-primary"
        />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="h-8 rounded-[6px] px-3 text-xs font-bold text-tx-secondary hover:bg-bg-hover">
          Cancelar
        </button>
        <button
          type="button"
          disabled={!dueAt || mutation.isPending}
          onClick={() => mutation.mutate()}
          className="h-8 rounded-[6px] bg-primary px-3 text-xs font-bold text-white disabled:opacity-50"
        >
          {mutation.isPending ? 'Salvando…' : 'Salvar prazo'}
        </button>
      </div>
    </div>
  );
}

/**
 * Linha do tempo do card: cada fase por onde passou, quanto tempo ficou, o prazo que valia e se
 * cumpriu. Quem gerencia as fases pode prorrogar o prazo da fase atual.
 */
export function PhaseTimeline({
  solicitationId,
  formId,
  defaultOpen = false,
}: {
  solicitationId: string;
  formId: string | null;
  defaultOpen?: boolean;
}) {
  const { can } = useAuth();
  const [open, setOpen] = useState(defaultOpen);
  const [extending, setExtending] = useState(false);
  const timelineQuery = useQuery({
    queryKey: queryKeys.solicitations.phaseTimeline(solicitationId),
    queryFn: () => fetchPhaseTimeline(solicitationId),
    enabled: open,
  });
  const entries = timelineQuery.data ?? [];
  // Prorrogar o prazo é configurar as fases DESTE processo.
  const canExtend = can('kanban_phases.manage', formId);

  return (
    <section className="grid gap-2 rounded-xl border border-border-default/60 p-3">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex items-center gap-2 text-left text-xs font-bold uppercase tracking-wide text-tx-secondary"
      >
        <History className="h-4 w-4" />
        <span className="flex-1">Linha do tempo das fases</span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>

      {open ? (
        timelineQuery.isLoading ? (
          <p className="text-xs text-tx-muted">Carregando…</p>
        ) : timelineQuery.isError ? (
          <p className="text-xs text-error">Não foi possível carregar a linha do tempo.</p>
        ) : (
          <ol className="grid gap-2">
            {entries.map((entry, index) => {
              const status = STATUS[entry.status];
              return (
                <li
                  key={`${entry.phaseId ?? entry.phaseLabel}-${entry.enteredAt}-${index}`}
                  className={cn(
                    'grid gap-1 rounded-[8px] border px-3 py-2',
                    entry.current ? 'border-primary/50 bg-primary/5' : 'border-border-default',
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-tx-primary">{entry.phaseLabel}</span>
                    {entry.current ? (
                      <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Atual</span>
                    ) : null}
                    <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold', status.cls)}>{status.label}</span>
                    <span className="ml-auto text-xs font-semibold tabular-nums text-tx-secondary">
                      {formatDuration(entry.durationMinutes)}
                    </span>
                  </div>
                  <p className="text-xs text-tx-secondary">
                    {formatDateTime(entry.enteredAt)}
                    {' → '}
                    {entry.leftAt ? formatDateTime(entry.leftAt) : 'agora'}
                    {entry.dueAt ? (
                      <>
                        {' · prazo '}
                        {formatDateTime(entry.dueAt)}
                        {entry.businessHours ? ' (úteis)' : ''}
                        {entry.extended ? ' · prorrogado' : ''}
                      </>
                    ) : null}
                  </p>
                  {entry.current && entry.dueAt && canExtend ? (
                    extending ? (
                      <ExtendForm
                        solicitationId={solicitationId}
                        current={entry}
                        boardFormId={formId}
                        onDone={() => setExtending(false)}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setExtending(true)}
                        className="inline-flex w-fit items-center gap-1 text-xs font-bold text-primary hover:underline dark:text-blue-300"
                      >
                        <CalendarClock className="h-3.5 w-3.5" />
                        Alterar prazo desta fase
                      </button>
                    )
                  ) : null}
                </li>
              );
            })}
          </ol>
        )
      ) : null}
    </section>
  );
}
