import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { AlertTriangle, ArrowLeft, CalendarDays, CheckCircle, Clock, EyeOff, Filter, Hourglass, Inbox, LayoutList, Loader2, Lock, MoreVertical, RefreshCw, Settings2, TableProperties, User, UserMinus, UserPlus } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../../../app/auth-context';
import { useToast } from '../../../components/ui';
import { cn } from '../../../lib/cn';
import { formatBRL, formatBRLCompact } from '../../../lib/money';
import { queryKeys } from '../../../lib/query-keys';
import { CardDisplayModal } from '../../kanban-phases/components/card-display-modal';
import { PhaseCardFilterModal } from '../../kanban-phases/components/phase-card-filter-modal';
import { PhaseFieldsModal } from '../../kanban-phases/components/phase-fields-modal';
import { PhaseSlaBadge } from '../../kanban-phases/components/phase-sla-badge';
import { moveBackBarrier, moveBackMessage } from '../../kanban-phases/lib/phase-move-back';
import { PhaseApprovalBlockDialog } from '../../kanban-phases/components/phase-approval-block-dialog';
import { phaseApprovalBlockOf, type PhaseApprovalBlock } from '../../kanban-phases/lib/phase-approval-block';
import {
  cardNumber,
  displayOrDefault,
  formatElapsed,
  formatShortDate,
  type CardDisplay,
} from '../../kanban-phases/lib/card-display';
import { phaseColorHex } from '../../kanban-phases/types';
import { useMyPendingApprovalsQuery } from '../../approvals/hooks/use-my-pending-approvals-query';
import { fetchAssignableUsers } from '../../users/services/users-api';
import { SolicitationDetailModal } from '../components/solicitation-detail-modal';
import { useMoveKanbanStageMutation } from '../hooks/use-move-kanban-stage-mutation';
import { useMoveKanbanPhaseMutation } from '../hooks/use-move-kanban-phase-mutation';
import { useKanbanBoardQuery } from '../hooks/use-kanban-board-query';
import { formatRelativeTime } from '../lib/kanban-formatters';
import { getTimeRemaining } from '../lib/sla.utils';
import { updateSolicitationAssignee, type KanbanDefaultStage } from '../services/solicitations-api';
import type { KanbanCard, KanbanColumn, SolicitationPriority } from '../types';

// ── Column display config ─────────────────────────────────────────────────

/** Colunas do esqueleto de carregamento: as fases padrão com que todo board nasce. */
const SKELETON_COLUMN_LABELS = ['Novo', 'Pendente', 'Concluído'];

// ── Priority config ───────────────────────────────────────────────────────

const PRIORITY_BORDER_COLOR: Record<SolicitationPriority, string> = {
  urgent: '#DC2626',
  high: '#EA580C',
  medium: '#CA8A04',
  low: '#6B7280',
};

const PRIORITY_CONFIG: Record<SolicitationPriority, { label: string; className: string }> = {
  low: { label: 'Baixa', className: 'bg-slate-100 text-slate-600' },
  medium: { label: 'Média', className: 'bg-yellow-100 text-yellow-700' },
  high: { label: 'Alta', className: 'bg-orange-100 text-orange-700' },
  urgent: { label: 'Urgente', className: 'bg-red-100 text-red-700' },
};

function PriorityBadge({ priority }: { priority: SolicitationPriority }) {
  const config = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.medium;
  return (
    <span
      className={cn(
        'inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
        config.className,
      )}
    >
      {config.label}
    </span>
  );
}

// ── SLA badge ─────────────────────────────────────────────────────────────

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function SlaBadge({
  slaDueAt,
  slaStatus,
}: {
  slaDueAt: string | null;
  slaStatus: string | null;
}) {
  if (!slaDueAt || !slaStatus) return null;
  if (!['breached', 'warning', 'on_track'].includes(slaStatus)) return null;

  const diffMs = new Date(slaDueAt).getTime() - Date.now();
  const isBreached = slaStatus === 'breached';
  const isWarning = slaStatus === 'warning';
  const isOnTrack = slaStatus === 'on_track';

  if (isOnTrack && diffMs > ONE_DAY_MS) return null;

  let text: string;
  if (isBreached) {
    const absDiff = Math.abs(diffMs);
    const hours = Math.floor(absDiff / 3_600_000);
    const mins = Math.floor((absDiff % 3_600_000) / 60_000);
    text = hours >= 1 ? `Vencido há ${hours}h` : `Vencido há ${mins}m`;
  } else {
    text = `Vence em ${getTimeRemaining(slaDueAt)}`;
  }

  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
        isBreached && 'animate-pulse bg-red-100 text-red-700',
        isWarning && 'bg-amber-100 text-amber-700',
        isOnTrack && 'bg-green-100 text-green-700',
      )}
    >
      <Clock className="h-3 w-3 shrink-0" />
      {text}
    </span>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-bg-s3 text-[9px] font-bold text-tx-secondary">
      {initials}
    </span>
  );
}

// ── Assignee button + dropdown ────────────────────────────────────────────────

function AssigneeButton({
  cardId,
  responsibleUserId,
  responsibleName,
  canAssign,
  isDragging,
}: {
  cardId: string;
  responsibleUserId: string | null;
  responsibleName: string | null;
  canAssign: boolean;
  isDragging: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const qc = useQueryClient();
  const { data: users = [] } = useQuery({
    queryKey: ['users', 'assignable', 'solicitations.manage'],
    queryFn: () => fetchAssignableUsers('solicitations.manage'),
    staleTime: 5 * 60_000,
    enabled: canAssign,
  });

  const assignMut = useMutation({
    mutationFn: (assigneeId: string | null) =>
      updateSolicitationAssignee(cardId, assigneeId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.solicitations.kanbanBoard() }),
  });

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  function handleAssign(assigneeId: string | null) {
    setOpen(false);
    setSearch('');
    assignMut.mutate(assigneeId);
  }

  const filteredUsers = search
    ? users.filter((u) => u.fullName.toLowerCase().includes(search.toLowerCase()))
    : users;

  // In drag overlay or viewer role — static display only
  if (isDragging || !canAssign) {
    return responsibleName ? (
      <div className="flex min-w-0 items-center gap-1.5">
        <Avatar name={responsibleName} />
        <span className="truncate text-[11px] text-tx-secondary dark:text-slate-300">{responsibleName}</span>
      </div>
    ) : (
      <span />
    );
  }

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1">
      {responsibleName ? (
        <button
          type="button"
          disabled={assignMut.isPending}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          className="flex min-w-0 max-w-full items-center gap-1.5 rounded px-0.5 py-0.5 hover:bg-bg-hover disabled:opacity-50"
        >
          {assignMut.isPending ? (
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-tx-secondary" />
          ) : (
            <Avatar name={responsibleName} />
          )}
          <span className="truncate text-[11px] text-tx-secondary dark:text-slate-300">{responsibleName}</span>
        </button>
      ) : (
        <button
          type="button"
          disabled={assignMut.isPending}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          className="flex items-center gap-1 rounded px-1 py-0.5 text-[11px] text-tx-muted transition-colors hover:bg-bg-hover hover:text-tx-secondary disabled:opacity-50"
        >
          {assignMut.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <UserPlus className="h-3 w-3 shrink-0" />
          )}
          {assignMut.isPending ? 'Atribuindo...' : '+ Atribuir'}
        </button>
      )}

      {open && (
        <div
          className="absolute bottom-full left-0 z-50 mb-1 w-52 rounded-[8px] border border-border-default bg-bg-surface shadow-lg dark:border-slate-600 dark:bg-slate-800"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-border-default p-2 dark:border-slate-600">
            <input
              autoFocus
              className="h-7 w-full rounded-[6px] border border-border-default bg-bg-s2 px-2 text-[12px] text-tx-primary outline-none focus:border-primary dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              placeholder="Buscar usuário..."
              value={search}
              onChange={(e) => {
                e.stopPropagation();
                setSearch(e.target.value);
              }}
            />
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {responsibleUserId && (
              <>
                <button
                  type="button"
                  onClick={() => handleAssign(null)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-[#ef4444] transition-colors hover:bg-[#fef2f2]"
                >
                  <UserMinus className="h-3.5 w-3.5 shrink-0" />
                  Remover responsável
                </button>
                <div className="my-0.5 border-t border-border-subtle" />
              </>
            )}
            {filteredUsers.length === 0 ? (
              <p className="px-3 py-2 text-[12px] text-tx-muted">Nenhum usuário encontrado</p>
            ) : (
              filteredUsers.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => handleAssign(u.id)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] transition-colors hover:bg-bg-s2 dark:hover:bg-slate-700',
                    u.id === responsibleUserId ? 'font-bold text-tx-primary dark:text-slate-100' : 'text-tx-secondary dark:text-slate-300',
                  )}
                >
                  <Avatar name={u.fullName} />
                  <span className="min-w-0 flex-1 truncate">{u.fullName}</span>
                  {u.id === responsibleUserId && (
                    <CheckCircle className="h-3.5 w-3.5 shrink-0 text-primary" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Actions dropdown ──────────────────────────────────────────────────────

function ActionsDropdown({
  moveTargets,
  onMove,
  isMoving,
}: {
  moveTargets: { id: string; label: string }[];
  onMove: (toColumnId: string) => void;
  isMoving: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  if (moveTargets.length === 0) return null;

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        disabled={isMoving}
        title="Mover card"
        className="grid h-6 w-6 place-items-center rounded-md text-tx-muted transition-colors hover:bg-bg-hover hover:text-tx-secondary disabled:opacity-40"
      >
        {isMoving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <MoreVertical className="h-3.5 w-3.5" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded-[8px] border border-border-default bg-bg-surface py-1 shadow-lg dark:border-slate-600 dark:bg-slate-800">
          {moveTargets.map((target) => (
            <button
              key={target.id}
              type="button"
              onClick={(e) => {
                // Sem isso o clique sobe até o card e abre o detalhe junto com o movimento.
                e.stopPropagation();
                setOpen(false);
                onMove(target.id);
              }}
              className="block w-full px-3 py-2 text-left text-xs font-semibold text-tx-primary transition-colors hover:bg-bg-s2 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              {target.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────

function KanbanCardContent({
  card,
  isMoving,
  canMove,
  hasMyPendingApproval,
  moveTargets,
  onMove,
  onOpenDetail,
  isDragging = false,
  display: displayConfig,
}: {
  card: KanbanCard;
  isMoving: boolean;
  canMove: boolean;
  hasMyPendingApproval: boolean;
  moveTargets: { id: string; label: string }[];
  onMove: (toColumnId: string) => void;
  onOpenDetail?: () => void;
  isDragging?: boolean;
  /** "Personalizar card" da fase; ausente = o card de sempre. */
  display?: CardDisplay;
}) {
  const relativeTime = formatRelativeTime(card.updatedAt);
  const display = displayOrDefault(displayConfig);
  const show = (key: CardDisplay['indicators'][number]) => display.indicators.includes(key);
  // A cor da borda é a prioridade: some junto com o indicador.
  const borderColor = show('priority') ? (PRIORITY_BORDER_COLOR[card.priority] ?? '#6B7280') : 'transparent';
  const fields = card.fields ?? [];
  const metaItems: Array<{ key: string; icon: ReactNode; text: string; title: string }> = [];
  if (show('created_at') && card.createdAt) {
    metaItems.push({
      key: 'created',
      icon: <CalendarDays className="h-3 w-3 shrink-0" />,
      text: formatShortDate(card.createdAt),
      title: 'Data de abertura',
    });
  }
  if (show('time_in_phase') && card.phaseEnteredAt) {
    metaItems.push({
      key: 'in-phase',
      icon: <Hourglass className="h-3 w-3 shrink-0" />,
      text: `na fase há ${formatElapsed(card.phaseEnteredAt)}`,
      title: 'Tempo na fase',
    });
  }
  const showFooter = show('assignee') || show('updated_at');

  return (
    <article
      onClick={onOpenDetail}
      className={cn(
        'group flex min-w-0 flex-col gap-2 rounded-[8px] border border-border-default bg-bg-surface transition-shadow dark:border-slate-600 dark:bg-slate-700',
        isDragging ? 'rotate-1 opacity-80 shadow-lg' : 'hover:shadow-md',
        isMoving && 'opacity-60',
        onOpenDetail && 'cursor-pointer',
      )}
      style={{ padding: '12px', borderLeft: `3px solid ${borderColor}` }}
    >
      {/* Row 1: form badge left + priority badge + actions (hover-only) */}
      <div className="flex min-w-0 items-center gap-1.5">
        {card.hasIntegrationError && (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Erro de integração" />
        )}
        {show('number') ? (
          <span className="shrink-0 font-mono text-[11px] font-semibold text-tx-muted dark:text-slate-300" title="Número da solicitação">
            {cardNumber(card.id)}
          </span>
        ) : null}
        {show('process') && card.formName && (
          <span className="min-w-0 truncate rounded bg-bg-s2 px-1.5 py-0.5 text-[11px] text-tx-muted dark:bg-slate-600 dark:text-slate-300">
            {card.formName}
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {show('priority') ? <PriorityBadge priority={card.priority} /> : null}
          {canMove && (
            <div className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <ActionsDropdown moveTargets={moveTargets} onMove={onMove} isMoving={isMoving} />
            </div>
          )}
        </div>
      </div>

      {/* Approval pending badge */}
      {hasMyPendingApproval && (
        <span className="w-fit rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
          Sua aprovação pendente
        </span>
      )}

      {/* Row 2: title */}
      <p className="line-clamp-2 text-[14px] font-semibold leading-snug text-tx-primary dark:text-slate-100" title={card.title}>
        {card.title}
      </p>

      {show('requester') && card.requesterName ? (
        <p className="flex min-w-0 items-center gap-1 text-[12px] text-tx-secondary dark:text-slate-300" title="Solicitante">
          <User className="h-3 w-3 shrink-0" />
          <span className="truncate">{card.requesterName}</span>
        </p>
      ) : null}

      {/* "Valor do card" do formulário (R$) */}
      {show('value') && typeof card.value === 'number' ? (
        <p className="text-[15px] font-extrabold tabular-nums text-tx-primary dark:text-slate-100" title="Valor do card">
          {formatBRL(card.value)}
        </p>
      ) : null}

      {/* Campos do processo escolhidos no "Personalizar card" (só os respondidos) */}
      {fields.length ? (
        <dl className="grid gap-1 rounded-[6px] bg-bg-s2 px-2 py-1.5 dark:bg-slate-600/60">
          {fields.map((field) => (
            <div key={field.code} className="flex min-w-0 items-baseline gap-1.5 text-[12px] leading-snug">
              <dt className="max-w-[45%] shrink-0 truncate text-tx-muted dark:text-slate-300" title={field.label}>
                {field.label}
              </dt>
              <dd className="line-clamp-2 min-w-0 break-words font-semibold text-tx-primary dark:text-slate-100" title={field.text}>
                {field.text}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {/* Row 3: SLA badge (only when slaDueAt exists) */}
      {show('sla') && card.slaDueAt && <SlaBadge slaDueAt={card.slaDueAt} slaStatus={card.slaStatus} />}
      {/* Prazo da fase (quando a fase tem prazo) */}
      {show('phase_sla') && card.phaseSla ? <PhaseSlaBadge sla={card.phaseSla} /> : null}

      {metaItems.length ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-tx-muted dark:text-slate-400">
          {metaItems.map((item) => (
            <span key={item.key} className="inline-flex items-center gap-1" title={item.title}>
              {item.icon}
              {item.text}
            </span>
          ))}
        </div>
      ) : null}

      {/* Row 4: footer — assignee left, relative time right */}
      {showFooter ? (
        <div className="flex items-center justify-between gap-2 border-t border-border-default pt-2 dark:border-slate-600">
          {show('assignee') ? (
            <AssigneeButton
              cardId={card.id}
              responsibleUserId={card.responsibleUserId}
              responsibleName={card.responsibleName}
              canAssign={canMove}
              isDragging={isDragging}
            />
          ) : (
            <span />
          )}
          {show('updated_at') ? (
            <span className="shrink-0 text-[12px] text-tx-muted dark:text-slate-400">{relativeTime}</span>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function DraggableKanbanCard({
  card,
  currentColumnId,
  isMoving,
  canMove,
  hasMyPendingApproval,
  moveTargets,
  onMove,
  onOpenDetail,
  display,
}: {
  card: KanbanCard;
  currentColumnId: string;
  isMoving: boolean;
  canMove: boolean;
  hasMyPendingApproval: boolean;
  moveTargets: { id: string; label: string }[];
  onMove: (toColumnId: string) => void;
  onOpenDetail?: () => void;
  display?: CardDisplay;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.id,
    data: { card, currentColumnId },
    disabled: !canMove || isMoving,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ touchAction: 'none', opacity: isDragging ? 0 : 1 }}
      className={canMove && !isMoving ? 'cursor-grab active:cursor-grabbing' : undefined}
    >
      <KanbanCardContent
        card={card}
        isMoving={isMoving}
        canMove={canMove}
        hasMyPendingApproval={hasMyPendingApproval}
        moveTargets={moveTargets}
        onMove={onMove}
        onOpenDetail={onOpenDetail}
        display={display}
      />
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="animate-pulse rounded-[8px] border border-border-default bg-bg-surface p-3 dark:border-slate-700 dark:bg-slate-700">
      <div className="mb-2.5 h-3.5 w-20 rounded-full bg-border-default dark:bg-slate-600" />
      <div className="mb-1.5 h-4 w-full rounded bg-border-default dark:bg-slate-600" />
      <div className="mb-2.5 h-3 w-2/3 rounded bg-bg-hover dark:bg-slate-600" />
      <div className="h-3 w-16 rounded bg-border-default dark:bg-slate-600" />
    </div>
  );
}

function ColumnSkeleton({ label }: { label: string }) {
  return (
    <div
      className="flex w-72 shrink-0 flex-col rounded-[10px] border border-border-default bg-bg-s2 dark:border-slate-700 dark:bg-slate-800"
      style={{ borderTopColor: '#9CA3AF', borderTopWidth: '4px' }}
    >
      <div className="flex items-center justify-between px-3 py-3">
        <span className="text-xs font-bold text-tx-secondary dark:text-slate-200">{label}</span>
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-border-default px-1.5 text-[10px] font-bold text-tx-secondary dark:bg-slate-700 dark:text-slate-300">
          –
        </span>
      </div>
      <div className="flex flex-col gap-2 overflow-y-auto px-3 pb-3">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  );
}

// ── Column ────────────────────────────────────────────────────────────────

function KanbanColumnComponent({
  column,
  cards,
  movingCardIds,
  canMove,
  myPendingSolicitationIds,
  allColumns,
  canMoveBack,
  onMove,
  onOpenDetail,
  onOpenSettings,
  onCustomizeCard,
}: {
  column: KanbanColumn;
  cards: KanbanCard[];
  movingCardIds: Set<string>;
  canMove: boolean;
  myPendingSolicitationIds: Set<string>;
  allColumns: KanbanColumn[];
  /** Passa por cima do "ponto sem volta" (quem configura as fases do processo). */
  canMoveBack: boolean;
  onMove: (cardId: string, toColumnId: string) => void;
  onOpenDetail?: (card: KanbanCard) => void;
  /** Engrenagem da coluna (configurações da fase): só para quem configura as fases do processo. */
  onOpenSettings?: () => void;
  /** "Personalizar card" desta fase (para todos no quadro de um processo). */
  onCustomizeCard?: () => void;
}) {
  const accentColor = phaseColorHex(column.color ?? 'gray');
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  // Pendência que é minha nesta fase: o card espera a minha aprovação.
  const pendingCount = column.cards.filter((card) => myPendingSolicitationIds.has(card.id)).length;

  // "Mover para" não oferece fase anterior a um ponto sem volta (a quem não configura as fases).
  const moveTargets = allColumns
    .filter((c) => c.id !== column.id)
    .filter((c) => canMoveBack || !moveBackBarrier(allColumns, column.id, c.id))
    .map((c) => ({ id: c.id, label: c.label }));

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex w-72 shrink-0 flex-col rounded-[10px] border border-border-default bg-bg-s2 transition-colors dark:border-slate-700 dark:bg-slate-800',
        isOver && 'bg-bg-hover ring-2 ring-primary/20 dark:bg-slate-700',
      )}
      style={{ borderTopColor: accentColor, borderTopWidth: '4px' }}
    >
      {/* Column header */}
      <div className="grid gap-0.5 px-3 py-3">
        <div className="flex items-center justify-between">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-bold text-tx-secondary dark:text-slate-200">
            <span className="truncate">{column.label}</span>
            {column.restrictedVisibility ? (
              <EyeOff
                className="h-3.5 w-3.5 shrink-0 text-tx-muted"
                aria-label="Fase visível só para alguns perfis, áreas ou usuários"
              >
                <title>Fase visível só para alguns perfis, áreas ou usuários</title>
              </EyeOff>
            ) : null}
            {column.cardFilterRules ? (
              <Filter
                className="h-3.5 w-3.5 shrink-0 text-tx-muted"
                aria-label={`Cards filtrados pela resposta (${column.cardFilterRules} ${column.cardFilterRules === 1 ? 'regra' : 'regras'})`}
              >
                <title>{`Cards filtrados pela resposta (${column.cardFilterRules} ${column.cardFilterRules === 1 ? 'regra' : 'regras'})`}</title>
              </Filter>
            ) : null}
            {column.blockMoveBack ? (
              <Lock
                className="h-3.5 w-3.5 shrink-0 text-tx-muted"
                aria-label="Ponto sem volta: o card não volta para uma fase anterior"
              >
                <title>Ponto sem volta: o card não volta para uma fase anterior</title>
              </Lock>
            ) : null}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {pendingCount > 0 ? (
              <span
                className="grid h-5 min-w-5 place-items-center rounded-full bg-amber-100 px-1.5 text-[10px] font-bold text-amber-800"
                title={`${pendingCount} ${pendingCount === 1 ? 'card aguarda' : 'cards aguardam'} sua aprovação`}
              >
                {pendingCount} pend.
              </span>
            ) : null}
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-border-default px-1.5 text-[10px] font-bold text-tx-secondary dark:bg-slate-700 dark:text-slate-300">
              {cards.length}
            </span>
            {onCustomizeCard ? (
              <button
                type="button"
                onClick={onCustomizeCard}
                aria-label={`Personalizar card da fase ${column.label}`}
                title={
                  column.cardDisplaySource === 'personal'
                    ? 'Personalizar card (você ajustou o seu)'
                    : 'Personalizar card'
                }
                className={cn(
                  'relative grid h-6 w-6 place-items-center rounded-[6px] hover:bg-bg-hover hover:text-tx-primary dark:hover:bg-slate-700',
                  column.cardDisplaySource === 'personal' ? 'text-primary dark:text-blue-300' : 'text-tx-muted',
                )}
              >
                <LayoutList className="h-3.5 w-3.5" />
              </button>
            ) : null}
            {onOpenSettings ? (
              <button
                type="button"
                onClick={onOpenSettings}
                aria-label={`Configurações da fase ${column.label}`}
                title="Configurações da fase"
                className="grid h-6 w-6 place-items-center rounded-[6px] text-tx-muted hover:bg-bg-hover hover:text-tx-primary dark:hover:bg-slate-700"
              >
                <Settings2 className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </span>
        </div>
        {typeof column.totalValue === 'number' && displayOrDefault(column.cardDisplay).indicators.includes('value') ? (
          <p
            className="text-[13px] font-extrabold tabular-nums text-tx-primary dark:text-slate-100"
            title={`Total da coluna: ${formatBRL(column.totalValue)}`}
          >
            {formatBRLCompact(column.totalValue)}
          </p>
        ) : null}
      </div>

      {/* Cards */}
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3">
        {cards.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-tx-ph dark:text-slate-600">
            <Inbox className="h-8 w-8" />
            <p className="text-[11px]">Nenhuma solicitação</p>
          </div>
        ) : (
          cards.map((card) => (
            <DraggableKanbanCard
              key={card.id}
              card={card}
              currentColumnId={column.id}
              isMoving={movingCardIds.has(card.id)}
              canMove={canMove}
              hasMyPendingApproval={myPendingSolicitationIds.has(card.id)}
              moveTargets={moveTargets}
              onMove={(toColumnId) => onMove(card.id, toColumnId)}
              onOpenDetail={onOpenDetail ? () => onOpenDetail(card) : undefined}
              display={column.cardDisplay}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Filter chips ──────────────────────────────────────────────────────────

type FilterKey = 'all' | 'my_approvals' | 'high_priority' | 'sla_risk' | 'no_assignee' | 'mine';

const FILTER_CHIPS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'my_approvals', label: 'Minhas aprovações' },
  { key: 'high_priority', label: 'Alta prioridade' },
  { key: 'sla_risk', label: 'SLA em risco' },
  { key: 'no_assignee', label: 'Sem responsável' },
  { key: 'mine', label: 'Minhas' },
];

// ── Main view ─────────────────────────────────────────────────────────────

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const msg = error.response?.data?.message;
    if (typeof msg === 'string') return msg;
    if (Array.isArray(msg)) return msg[0] as string;
  }
  return 'Não foi possível mover o card. Tente novamente.';
}

/** `headerActions`: botões extras no topo, ao lado de "Atualizar" (o modo simplificado põe Etapas e Automações). */
export function KanbanView({ headerActions }: { headerActions?: ReactNode } = {}) {
  const { user, hasPermission, can } = useAuth();
  const { showToast } = useToast();
  const { formId } = useParams<{ formId: string }>();
  const { data, isLoading, isError, error, refetch, isFetching } = useKanbanBoardQuery(formId);
  // 403 = a pessoa não tem acesso a este processo; não é falha de conexão.
  const isDenied = axios.isAxiosError(error) && error.response?.status === 403;
  const { data: pendingApprovalSteps = [] } = useMyPendingApprovalsQuery();
  const moveStageMutation = useMoveKanbanStageMutation(formId);
  const movePhaseMutation = useMoveKanbanPhaseMutation(formId);

  const isPhaseMode = data?.groupBy === 'phase';

  // O board traz o nome do processo (vale também com o quadro vazio ou com tudo escondido pelo
  // filtro de cards). Quem abre pelo card do processo manda o nome junto — serve enquanto carrega.
  const processNameFromLink = (useLocation().state as { processName?: string } | null)?.processName;
  const boardTitle = useMemo(() => {
    if (formId === 'unassigned') return 'Sem processo';
    const firstCard = data?.columns.flatMap((col) => col.cards).find((card) => card.formName);
    return data?.formName ?? firstCard?.formName ?? processNameFromLink ?? 'Kanban';
  }, [data, formId, processNameFromLink]);

  const [movingCardIds, setMovingCardIds] = useState<Set<string>>(new Set());
  const [activeCard, setActiveCard] = useState<{ card: KanbanCard; currentColumnId: string } | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [detailCard, setDetailCard] = useState<KanbanCard | null>(null);
  const [settingsPhaseId, setSettingsPhaseId] = useState<string | null>(null);
  const [cardDisplayColumn, setCardDisplayColumn] = useState<KanbanColumn | null>(null);
  // Card que não saiu da fase por falta de aprovação: o pop-up oferece pedir a aprovação.
  const [approvalBlock, setApprovalBlock] = useState<{ block: PhaseApprovalBlock; cardId: string; cardTitle?: string } | null>(
    null,
  );

  // Mover card é "atuar" NESTE processo. O quadro "Sem processo" só tem os cards da própria pessoa.
  const canMove =
    formId === 'unassigned' ? hasPermission('solicitations.manage') : can('solicitations.act', formId);
  // Engrenagem das colunas: configurar as fases DESTE processo.
  const canConfigurePhases =
    isPhaseMode && !!formId && formId !== 'unassigned' && can('kanban_phases.manage', formId);
  // "Personalizar card": qualquer um que vê o quadro de um processo ajusta o próprio card.
  const canCustomizeCards = isPhaseMode && !!formId && formId !== 'unassigned';
  const myPendingSolicitationIds = useMemo(
    () => new Set(pendingApprovalSteps.map((step) => step.approval.solicitationId)),
    [pendingApprovalSteps],
  );

  const boardPendingCount = useMemo(
    () =>
      (data?.columns ?? []).reduce(
        (total, column) => total + column.cards.filter((card) => myPendingSolicitationIds.has(card.id)).length,
        0,
      ),
    [data, myPendingSolicitationIds],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const filteredCardsByColumn = useMemo(() => {
    const map = new Map<string, KanbanCard[]>();
    if (!data) return map;
    for (const column of data.columns) {
      let filtered = column.cards;
      if (activeFilter === 'high_priority') {
        filtered = column.cards.filter((c) => c.priority === 'urgent' || c.priority === 'high');
      } else if (activeFilter === 'sla_risk') {
        filtered = column.cards.filter((c) => c.slaStatus === 'breached' || c.slaStatus === 'warning');
      } else if (activeFilter === 'no_assignee') {
        filtered = column.cards.filter((c) => !c.responsibleUserId);
      } else if (activeFilter === 'my_approvals') {
        filtered = column.cards.filter((c) => myPendingSolicitationIds.has(c.id));
      } else if (activeFilter === 'mine') {
        filtered = column.cards.filter((c) => c.responsibleUserId === user?.id);
      }
      map.set(column.id, filtered);
    }
    return map;
  }, [data, activeFilter, user?.id, myPendingSolicitationIds]);

  function handleMove(cardId: string, toColumnId: string) {
    // Ponto sem volta: nem tenta (o servidor recusaria). Quem configura as fases passa.
    if (isPhaseMode && !canConfigurePhases && data) {
      const fromColumn = data.columns.find((column) => column.cards.some((card) => card.id === cardId));
      const barrier = fromColumn ? moveBackBarrier(data.columns, fromColumn.id, toColumnId) : null;
      if (barrier) {
        showToast({ title: 'Este card não volta', description: moveBackMessage(barrier), variant: 'error' });
        return;
      }
    }
    setMovingCardIds((prev) => new Set(prev).add(cardId));
    const callbacks = {
      onError: (error: unknown) => {
        // Quem aprova a fase não cai aqui (mover já aprova); os demais veem o pop-up da aprovação.
        const block = phaseApprovalBlockOf(error);
        if (block && block.code !== 'phase_approval_rejected') {
          const cardTitle = data?.columns.flatMap((column) => column.cards).find((card) => card.id === cardId)?.title;
          setApprovalBlock({ block, cardId, cardTitle });
          return;
        }
        showToast({ title: 'Erro ao mover card', description: getErrorMessage(error), variant: 'error' });
      },
      onSettled: () => {
        setMovingCardIds((prev) => {
          const next = new Set(prev);
          next.delete(cardId);
          return next;
        });
      },
    };
    if (isPhaseMode) {
      movePhaseMutation.mutate({ id: cardId, phaseId: toColumnId }, callbacks);
    } else {
      moveStageMutation.mutate({ id: cardId, stage: toColumnId as KanbanDefaultStage }, callbacks);
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const card = event.active.data.current?.card as KanbanCard | undefined;
    const currentColumnId = event.active.data.current?.currentColumnId as string | undefined;
    if (card && currentColumnId) setActiveCard({ card, currentColumnId });
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveCard(null);
    const card = event.active.data.current?.card as KanbanCard | undefined;
    const fromColumnId = event.active.data.current?.currentColumnId as string | undefined;
    const toColumnId = event.over?.id as string | undefined;
    if (!card || !fromColumnId || !toColumnId || toColumnId === fromColumnId) return;
    handleMove(card.id, toColumnId);
  }

  return (
    <section className="grid gap-5">
      {/* Page header */}
      <header className="flex items-end justify-between gap-4">
        <div>
          <Link
            to="/formularios"
            className="mb-1 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-tx-secondary hover:text-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Todos os processos
          </Link>
          <h1 className="text-3xl font-extrabold tracking-tight text-tx-primary">{boardTitle}</h1>
          <p className="mt-1 text-sm text-tx-secondary">
            Acompanhe as solicitações por fase. Clique no card para atuar, ver a solicitação e aprovar.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {headerActions}
          {/* Registros do processo (lista com filtros e relatório) ao lado do quadro. */}
          {formId && formId !== 'unassigned' ? (
            <Link
              to={`/registros/${formId}`}
              title="Consultar, filtrar e exportar os registros do processo"
              className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-border-default bg-bg-surface px-3 text-sm font-semibold text-tx-secondary transition-colors hover:bg-bg-s2"
            >
              <TableProperties className="h-4 w-4" />
              Registros
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            title="Atualizar board"
            className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-border-default bg-bg-surface px-3 text-sm font-semibold text-tx-secondary transition-colors hover:bg-bg-s2 disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            Atualizar
          </button>
        </div>
      </header>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTER_CHIPS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveFilter(key)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
              activeFilter === key
                ? 'border-primary bg-primary text-white'
                : 'border-border-default bg-bg-surface text-tx-secondary hover:border-primary/30 hover:text-tx-secondary',
            )}
          >
            {label}
            {key === 'my_approvals' && boardPendingCount > 0 ? ` (${boardPendingCount})` : ''}
          </button>
        ))}
      </div>

      {/* Error state */}
      {isError && (
        <div className="flex flex-col items-center gap-3 rounded-[10px] border border-[#fecaca] bg-[#fef2f2] px-6 py-10 text-center">
          <p className="text-sm font-bold text-[#dc2626]">
            {isDenied
              ? 'Você não tem acesso a este processo. Peça a quem cuida dele.'
              : 'Não foi possível carregar o board. Verifique sua conexão e tente novamente.'}
          </p>
          {!isDenied && (
            <button
              type="button"
              onClick={() => void refetch()}
              className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[#fecaca] bg-bg-surface px-4 text-sm font-bold text-[#dc2626] hover:bg-[#fef2f2]"
            >
              <RefreshCw className="h-4 w-4" />
              Tentar novamente
            </button>
          )}
        </div>
      )}

      {/* Board — horizontal scroll */}
      {!isError && (
        <div className="overflow-x-auto pb-4">
          {isLoading ? (
            <div className="flex min-w-max gap-4">
              {SKELETON_COLUMN_LABELS.map((label) => (
                <ColumnSkeleton key={label} label={label} />
              ))}
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div className="flex min-w-max gap-4">
                {(data?.columns ?? []).map((column) => (
                  <KanbanColumnComponent
                    key={column.id}
                    column={column}
                    cards={filteredCardsByColumn.get(column.id) ?? []}
                    movingCardIds={movingCardIds}
                    canMove={canMove}
                    myPendingSolicitationIds={myPendingSolicitationIds}
                    allColumns={data?.columns ?? []}
                    canMoveBack={canConfigurePhases}
                    onMove={handleMove}
                    onOpenDetail={setDetailCard}
                    onOpenSettings={canConfigurePhases ? () => setSettingsPhaseId(column.id) : undefined}
                    onCustomizeCard={canCustomizeCards ? () => setCardDisplayColumn(column) : undefined}
                  />
                ))}
              </div>

              <DragOverlay dropAnimation={null}>
                {activeCard ? (
                  <KanbanCardContent
                    card={activeCard.card}
                    isMoving={false}
                    canMove={false}
                    hasMyPendingApproval={myPendingSolicitationIds.has(activeCard.card.id)}
                    moveTargets={[]}
                    onMove={() => undefined}
                    isDragging
                    display={data?.columns.find((column) => column.id === activeCard.currentColumnId)?.cardDisplay}
                  />
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      )}

      {approvalBlock ? (
        <PhaseApprovalBlockDialog
          block={approvalBlock.block}
          solicitationId={approvalBlock.cardId}
          cardTitle={approvalBlock.cardTitle}
          onClose={() => setApprovalBlock(null)}
        />
      ) : null}

      {settingsPhaseId && formId ? (
        <PhaseCardFilterModal formId={formId} phaseId={settingsPhaseId} onClose={() => setSettingsPhaseId(null)} />
      ) : null}

      {cardDisplayColumn && formId ? (
        <CardDisplayModal
          formId={formId}
          phaseId={cardDisplayColumn.id}
          phaseLabel={cardDisplayColumn.label}
          phaseColor={cardDisplayColumn.color}
          canManagePhase={canConfigurePhases}
          onClose={() => setCardDisplayColumn(null)}
        />
      ) : null}

      {detailCard ? (
        isPhaseMode ? (
          <PhaseFieldsModal card={detailCard} onClose={() => setDetailCard(null)} />
        ) : (
          <SolicitationDetailModal
            solicitationId={detailCard.id}
            onClose={() => setDetailCard(null)}
          />
        )
      ) : null}
    </section>
  );
}
