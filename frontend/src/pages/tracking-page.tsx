import {
  CheckCircle,
  Clock,
  Download,
  FileText,
  Paperclip,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { brand } from '../brand';
import {
  addPublicComment,
  decideProposal,
  fetchPublicComments,
  fetchTrackingSolicitation,
  getPublicDownloadUrl,
  type AddPublicCommentInput,
  type TrackingAttachment,
  type TrackingComment,
  type TrackingSolicitation,
  type TrackingTimelineEvent,
} from '../services/public-tracking-api';

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_CLASS: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  new: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  in_analysis: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  waiting: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
  waiting_approval: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
  waiting_integration: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
  resolved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  approved: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  canceled: 'bg-bg-s2 text-tx-secondary',
  cancelled: 'bg-bg-s2 text-tx-secondary',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
};

const SLA_CLASS: Record<string, string> = {
  on_track: 'text-green-700',
  warning: 'text-amber-600',
  breached: 'text-red-600',
  paused: 'text-tx-muted',
  completed: 'text-green-700',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function relativeTime(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ];
  const fmt = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto', style: 'short' });
  for (const [unit, ms] of units) {
    if (absMs >= ms) return fmt.format(Math.round(diffMs / ms), unit);
  }
  return fmt.format(Math.round(diffMs / 1000), 'second');
}

// ── Timeline icon ─────────────────────────────────────────────────────────────

function TimelineIcon({ eventType }: { eventType: string }): React.ReactNode {
  if (eventType === 'created')
    return <FileText className="h-4 w-4 text-blue-500" />;
  if (eventType === 'approval_approved' || eventType === 'proposal_approved')
    return <CheckCircle className="h-4 w-4 text-green-600" />;
  if (eventType === 'approval_rejected' || eventType === 'proposal_rejected')
    return <XCircle className="h-4 w-4 text-red-600" />;
  if (
    eventType === 'waiting_approval' ||
    eventType === 'approval_created' ||
    eventType === 'proposal_sent'
  )
    return <Clock className="h-4 w-4 text-amber-500" />;
  return <RefreshCw className="h-4 w-4 text-tx-muted" />;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function TrackingSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="rounded-2xl bg-bg-surface p-6 shadow-sm">
        <div className="mb-3 h-5 w-32 rounded bg-bg-s3" />
        <div className="mb-2 h-8 w-3/4 rounded bg-bg-s3" />
        <div className="h-5 w-24 rounded-full bg-bg-s3" />
      </div>
      <div className="rounded-2xl bg-bg-surface p-6 shadow-sm">
        <div className="mb-4 h-4 w-24 rounded bg-bg-s3" />
        {[1, 2, 3].map((n) => (
          <div key={n} className="mb-3 flex gap-3">
            <div className="mt-1 h-4 w-4 shrink-0 rounded-full bg-bg-s3" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-2/3 rounded bg-bg-s3" />
              <div className="h-3 w-1/3 rounded bg-bg-s2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type PageState =
  | { kind: 'loading' }
  | { kind: 'not_found' }
  | { kind: 'error' }
  | { kind: 'ok'; data: TrackingSolicitation };

export function TrackingPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<PageState>({ kind: 'loading' });

  const load = useCallback(async () => {
    if (!token) {
      setState({ kind: 'not_found' });
      return;
    }
    setState({ kind: 'loading' });
    try {
      const data = await fetchTrackingSolicitation(token);
      setState({ kind: 'ok', data });
    } catch (err: unknown) {
      const status =
        typeof err === 'object' &&
        err !== null &&
        'response' in err &&
        typeof (err as { response?: { status?: number } }).response?.status === 'number'
          ? (err as { response: { status: number } }).response.status
          : null;
      setState(status === 404 ? { kind: 'not_found' } : { kind: 'error' });
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-screen bg-bg-base">
      {/* Header */}
      <header className="border-b border-border-default bg-bg-surface px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <img
            src={brand.logos.horizontalColor}
            alt={brand.company.name}
            className="h-8 w-auto"
          />
          <Link
            to="/login"
            className="text-xs font-medium text-tx-muted hover:text-primary"
          >
            Fazer login
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-6 text-center text-xl font-bold text-tx-primary">
          Acompanhamento de Solicitação
        </h1>

        {state.kind === 'loading' && <TrackingSkeleton />}

        {state.kind === 'not_found' && (
          <div className="rounded-2xl bg-bg-surface p-8 text-center shadow-sm">
            <XCircle className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <p className="font-semibold text-tx-primary">Solicitação não encontrada.</p>
            <p className="mt-1 text-sm text-tx-muted">
              Verifique o link recebido e tente novamente.
            </p>
          </div>
        )}

        {state.kind === 'error' && (
          <div className="rounded-2xl bg-bg-surface p-8 text-center shadow-sm">
            <RefreshCw className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <p className="font-semibold text-tx-primary">Não foi possível carregar.</p>
            <p className="mt-1 text-sm text-tx-muted">Verifique sua conexão e tente novamente.</p>
            <button
              type="button"
              onClick={() => { void load(); }}
              className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {state.kind === 'ok' && <TrackingContent token={token ?? ''} data={state.data} />}
      </main>

      {/* Footer */}
      <footer className="mt-8 border-t border-border-default px-4 py-6 text-center text-xs text-tx-muted">
        <p>Para mais informações, entre em contato com o suporte.</p>
        <p className="mt-1">{brand.company.name}</p>
      </footer>
    </div>
  );
}

// ── Content when loaded ───────────────────────────────────────────────────────

function TrackingContent({ token, data }: { token: string; data: TrackingSolicitation }) {
  const slaClass = data.slaStatus ? (SLA_CLASS[data.slaStatus] ?? 'text-tx-muted') : '';

  return (
    <div className="space-y-4">
      {/* Main status card */}
      <div className="rounded-2xl bg-bg-surface p-6 shadow-sm">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-tx-muted">
          {data.formName}
        </p>
        <h2 className="mb-3 text-2xl font-bold text-tx-primary">
          #{data.number.slice(0, 8).toUpperCase()}
        </h2>
        <p className="mb-3 text-base text-tx-secondary">{data.title}</p>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={[
              'inline-flex rounded-full px-3 py-1 text-sm font-bold',
              STATUS_CLASS[data.status] ?? 'bg-bg-s2 text-tx-secondary',
            ].join(' ')}
          >
            {data.statusLabel}
          </span>
          {data.currentStage ? (
            <span className="rounded-full border border-border-default px-3 py-1 text-sm text-tx-secondary">
              {data.currentStage}
            </span>
          ) : null}
        </div>

        {data.slaDueAt ? (
          <p className={['mt-3 text-sm font-medium', slaClass].join(' ')}>
            Prazo:{' '}
            {new Date(data.slaDueAt).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            })}
          </p>
        ) : null}
      </div>

      {/* Timeline */}
      {data.timeline.length > 0 ? (
        <div className="rounded-2xl bg-bg-surface p-6 shadow-sm">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-tx-muted">
            Histórico
          </h3>
          <TimelineList events={[...data.timeline].reverse()} />
        </div>
      ) : null}

      {/* Attachments */}
      {data.attachments.length > 0 ? (
        <div className="rounded-2xl bg-bg-surface p-6 shadow-sm">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-tx-muted">
            Anexos
          </h3>
          <AttachmentList token={token} attachments={data.attachments} />
        </div>
      ) : null}

      {/* Comments */}
      <CommentsSection token={token} status={data.status} />
    </div>
  );
}

// ── Timeline list ─────────────────────────────────────────────────────────────

function TimelineList({ events }: { events: TrackingTimelineEvent[] }) {
  return (
    <ol className="space-y-0">
      {events.map((event, idx) => (
        <li key={`${event.eventType}-${event.createdAt}`} className="flex gap-3">
          {/* Connector column */}
          <div className="flex flex-col items-center">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bg-s2">
              <TimelineIcon eventType={event.eventType} />
            </div>
            {idx < events.length - 1 ? (
              <div className="mt-1 w-px flex-1 bg-bg-s3" style={{ minHeight: '1.5rem' }} />
            ) : null}
          </div>

          {/* Content */}
          <div className="pb-4 pt-1">
            <p className="text-sm font-medium text-tx-primary">{event.label}</p>
            <p className="text-xs text-tx-muted">{relativeTime(event.createdAt)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ── Proposal decision ─────────────────────────────────────────────────────────

function ProposalBadge({
  status,
  rejectionReason,
}: {
  status: 'approved' | 'rejected';
  rejectionReason?: string | null;
}) {
  if (status === 'approved') {
    return (
      <span className="mt-1 inline-flex items-center gap-0.5 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
        ✅ Você aprovou esta resposta
      </span>
    );
  }
  return (
    <span className="mt-1 inline-flex items-center gap-0.5 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
      ❌ Reprovada{rejectionReason ? `: ${rejectionReason}` : ''}
    </span>
  );
}

function ProposalActions({
  token,
  commentId,
  onDecided,
}: {
  token: string;
  commentId: string;
  onDecided: (comment: TrackingComment) => void;
}) {
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleApprove() {
    setSubmitting(true);
    try {
      const comment = await decideProposal(token, commentId, { decision: 'approved' });
      onDecided(comment);
    } catch {
      setError('Não foi possível registrar a aprovação. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReject() {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError('Informe o motivo da reprovação.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const comment = await decideProposal(token, commentId, {
        decision: 'rejected',
        comment: trimmed,
      });
      onDecided(comment);
    } catch {
      setError('Não foi possível registrar a reprovação. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-2 grid gap-2 rounded-xl bg-amber-50 p-3">
      <p className="text-xs font-semibold text-amber-700">
        Esta resposta precisa da sua aprovação.
      </p>
      {showRejectForm ? (
        <div className="grid gap-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Explique o motivo da reprovação..."
            className="w-full resize-none rounded-lg border border-border-default px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleReject()}
              disabled={submitting}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {submitting ? 'Enviando...' : 'Confirmar reprovação'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowRejectForm(false);
                setError(null);
              }}
              className="text-xs font-semibold text-tx-muted hover:text-tx-primary"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleApprove()}
            disabled={submitting}
            className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
          >
            Aprovar
          </button>
          <button
            type="button"
            onClick={() => setShowRejectForm(true)}
            disabled={submitting}
            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Reprovar
          </button>
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
        </div>
      )}
    </div>
  );
}

// ── Comments section ──────────────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'canceled', 'rejected']);

function CommentsSection({ token, status }: { token: string; status: string }) {
  const [comments, setComments] = useState<TrackingComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isTerminal = TERMINAL_STATUSES.has(status);

  useEffect(() => {
    setLoadingComments(true);
    fetchPublicComments(token)
      .then(setComments)
      .catch(() => {})
      .finally(() => setLoadingComments(false));
  }, [token]);

  // Hide entire section if terminal status and no comments yet
  if (!loadingComments && isTerminal && comments.length === 0) return null;

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    const trimmed = content.trim();
    if (!name.trim()) { setFormError('Informe seu nome.'); return; }
    if (!trimmed) { setFormError('O comentário não pode estar vazio.'); return; }
    if (trimmed.length > 2000) { setFormError('Comentário muito longo (máx 2000 caracteres).'); return; }
    setFormError(null);
    setSubmitting(true);
    try {
      const dto: AddPublicCommentInput = {
        content: trimmed,
        authorName: name.trim(),
        ...(email.trim() ? { authorEmail: email.trim() } : {}),
      };
      const comment = await addPublicComment(token, dto);
      setComments((prev) => [...prev, comment]);
      setName('');
      setEmail('');
      setContent('');
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch {
      setFormError('Não foi possível enviar o comentário. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl bg-bg-surface p-6 shadow-sm">
      <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-tx-muted">
        Comentários
      </h3>

      {loadingComments ? (
        <div className="space-y-3">
          {[1, 2].map((n) => (
            <div key={n} className="h-12 animate-pulse rounded-xl bg-bg-s2" />
          ))}
        </div>
      ) : (
        <div className="mb-4 space-y-3">
          {comments.length === 0 ? (
            <p className="text-sm text-tx-muted">Nenhum comentário ainda. Seja o primeiro!</p>
          ) : (
            comments.map((c) => {
              // Nesta página quem está vendo é sempre o solicitante, então as mensagens
              // DELE (isMine) ficam à direita, coloridas — como "minhas mensagens" em
              // qualquer app de chat. As da equipe ficam à esquerda, neutras.
              const isMine = c.authorType === 'requester';
              return (
                <div key={c.id} className="grid gap-1">
                  <div className={['flex', isMine ? 'justify-end' : 'justify-start'].join(' ')}>
                    <div
                      className={[
                        'max-w-[78%] rounded-2xl px-4 py-2 text-sm',
                        isMine
                          ? 'rounded-tr-none bg-blue-600 text-white'
                          : 'rounded-tl-none bg-bg-s2 text-tx-primary',
                      ].join(' ')}
                    >
                      <p className={[
                        'mb-1 text-xs font-semibold',
                        isMine ? 'text-blue-200' : 'text-tx-muted',
                      ].join(' ')}>
                        {c.authorType === 'team' ? 'Equipe' : (c.authorName ?? 'Solicitante')}
                      </p>
                      <p
                        className={[
                          'whitespace-pre-wrap',
                          isMine ? 'text-white' : 'text-tx-primary',
                        ].join(' ')}
                      >
                        {c.content}
                      </p>
                      <p className={[
                        'mt-1 text-right text-xs',
                        isMine ? 'text-blue-200' : 'text-tx-muted',
                      ].join(' ')}>
                        {relativeTime(c.createdAt)}
                      </p>
                    </div>
                  </div>
                  {c.proposalStatus === 'pending' ? (
                    <ProposalActions
                      token={token}
                      commentId={c.id}
                      onDecided={(updated) =>
                        setComments((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
                      }
                    />
                  ) : null}
                  {c.proposalStatus === 'approved' || c.proposalStatus === 'rejected' ? (
                    <div className="flex justify-start">
                      <ProposalBadge
                        status={c.proposalStatus}
                        rejectionReason={c.proposalRejectionReason}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {isTerminal ? null : <form
        onSubmit={(e) => { void handleSubmit(e); }}
        className="space-y-3 border-t border-border-default pt-4"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-tx-secondary">
              Seu nome <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="João Silva"
              maxLength={150}
              className="w-full rounded-xl border border-border-default bg-bg-input px-3 py-2 text-sm text-tx-primary placeholder:text-tx-ph focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-tx-secondary">
              E-mail (opcional)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="joao@email.com"
              className="w-full rounded-xl border border-border-default bg-bg-input px-3 py-2 text-sm text-tx-primary placeholder:text-tx-ph focus:border-primary focus:outline-none"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-tx-secondary">
            Comentário <span className="text-red-500">*</span>
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Escreva sua mensagem..."
            className="w-full resize-none rounded-xl border border-border-default bg-bg-input px-3 py-2 text-sm text-tx-primary placeholder:text-tx-ph focus:border-primary focus:outline-none"
          />
          <p className={[
            'text-right text-xs',
            content.length > 1900 ? 'text-amber-600' : 'text-tx-muted',
          ].join(' ')}>
            {content.length}/2000
          </p>
        </div>
        {formError ? <p className="text-xs text-red-600">{formError}</p> : null}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? 'Enviando...' : 'Enviar comentário'}
        </button>
      </form>}
    </div>
  );
}

// ── Attachments list ──────────────────────────────────────────────────────────

function AttachmentList({
  token,
  attachments,
}: {
  token: string;
  attachments: TrackingAttachment[];
}) {
  return (
    <ul className="space-y-2">
      {attachments.map((a) => (
        <li
          key={a.id}
          className="flex items-center gap-3 rounded-xl border border-border-default bg-bg-base px-3 py-2"
        >
          <Paperclip className="h-4 w-4 shrink-0 text-tx-muted" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-tx-primary">{a.originalName}</p>
            <p className="text-xs text-tx-muted">{formatBytes(a.sizeBytes)}</p>
          </div>
          <a
            href={getPublicDownloadUrl(token, a.id)}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded p-1 text-tx-muted hover:text-primary"
            title="Baixar"
          >
            <Download className="h-4 w-4" />
          </a>
        </li>
      ))}
    </ul>
  );
}
