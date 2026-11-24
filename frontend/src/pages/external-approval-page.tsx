import { CheckCircle, Clock, Lock, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { brand } from '../brand';
import { isValidEmail } from '../lib/email-list';
import {
  decideExternalApproval,
  fetchExternalApproval,
  parseExternalApprovalError,
  type ExternalApprovalDecision,
  type ExternalApprovalView,
} from '../services/external-approval-api';

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** A URL carrega uma credencial: pede aos buscadores para não indexar e ao navegador para não enviar Referer. */
function useSealedPage(): void {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Aprovação pendente';
    const metas = [
      ['robots', 'noindex, nofollow'],
      ['referrer', 'no-referrer'],
    ].map(([name, content]) => {
      const meta = document.createElement('meta');
      meta.name = name;
      meta.content = content;
      document.head.appendChild(meta);
      return meta;
    });
    return () => {
      document.title = previousTitle;
      metas.forEach((meta) => meta.remove());
    };
  }, []);
}

type PageState =
  | { kind: 'loading' }
  | { kind: 'not_found' }
  | { kind: 'error' }
  | { kind: 'ok'; view: ExternalApprovalView };

const cardCls = 'rounded-2xl bg-bg-surface p-6 shadow-sm';

export function ExternalApprovalPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [state, setState] = useState<PageState>({ kind: 'loading' });
  useSealedPage();

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      setState({ kind: 'ok', view: await fetchExternalApproval(token) });
    } catch (error: unknown) {
      setState(parseExternalApprovalError(error, '').status === 404 ? { kind: 'not_found' } : { kind: 'error' });
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-screen bg-bg-base">
      <header className="border-b border-border-default bg-bg-surface px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <img src={brand.logos.horizontalColor} alt={brand.company.name} className="h-8 w-auto dark:hidden" />
          <img
            src={brand.logos.horizontalWhite}
            alt={brand.company.name}
            className="hidden h-8 w-auto dark:block"
          />
          <span className="inline-flex items-center gap-1 text-xs font-medium text-tx-secondary">
            <Lock className="h-3 w-3" aria-hidden="true" /> Link pessoal e seguro
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-6 text-center text-xl font-bold text-tx-primary">Aprovação</h1>

        {state.kind === 'loading' && (
          <div className={`${cardCls} animate-pulse`} role="status" aria-label="Carregando">
            <div className="mb-3 h-5 w-40 rounded bg-border-default" />
            <div className="mb-2 h-8 w-3/4 rounded bg-border-default" />
            <div className="h-24 rounded bg-bg-s3" />
          </div>
        )}

        {state.kind === 'not_found' && (
          <Notice
            icon={<XCircle className="mx-auto mb-3 h-10 w-10 text-tx-muted" />}
            title="Link inválido."
            text="Confira o endereço recebido por e-mail. Se foi gerado um link mais novo, use o mais recente."
          />
        )}

        {state.kind === 'error' && (
          <div className={`${cardCls} text-center`}>
            <RefreshCw className="mx-auto mb-3 h-10 w-10 text-tx-muted" />
            <p className="font-semibold text-tx-primary">Não foi possível carregar.</p>
            <p className="mt-1 text-sm text-tx-secondary">Verifique sua conexão e tente novamente.</p>
            <button
              type="button"
              onClick={() => {
                void load();
              }}
              className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {state.kind === 'ok' && (
          <ApprovalContent
            token={token}
            view={state.view}
            onChange={(view) => setState({ kind: 'ok', view })}
            onInvalid={() => setState({ kind: 'not_found' })}
          />
        )}
      </main>

      <footer className="mt-8 border-t border-border-default px-4 py-6 text-center text-xs text-tx-muted">
        <p>Este link é pessoal. Não o encaminhe: quem o tiver pode decidir em seu nome.</p>
        <p className="mt-1">{brand.company.name}</p>
      </footer>
    </div>
  );
}

function Notice({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className={`${cardCls} text-center`}>
      {icon}
      <p className="font-semibold text-tx-primary">{title}</p>
      <p className="mt-1 text-sm text-tx-secondary">{text}</p>
    </div>
  );
}

function ApprovalContent({
  token,
  view,
  onChange,
  onInvalid,
}: {
  token: string;
  view: ExternalApprovalView;
  onChange: (view: ExternalApprovalView) => void;
  onInvalid: () => void;
}) {
  if (view.state === 'decided') {
    const approved = view.decision?.decision === 'approved';
    return (
      <Notice
        icon={
          approved ? (
            <CheckCircle className="mx-auto mb-3 h-10 w-10 text-green-600" />
          ) : (
            <XCircle className="mx-auto mb-3 h-10 w-10 text-red-600" />
          )
        }
        title={approved ? 'Aprovação registrada.' : 'Reprovação registrada.'}
        text={`${view.decision?.decidedAt ? `Decisão em ${formatDateTime(view.decision.decidedAt)}. ` : ''}Esta aprovação já foi decidida e não pode ser alterada por este link. Você pode fechar esta página.`}
      />
    );
  }
  if (view.state === 'expired') {
    return (
      <Notice
        icon={<Clock className="mx-auto mb-3 h-10 w-10 text-amber-500" />}
        title="Este link expirou ou foi bloqueado."
        text="Peça um novo link a quem solicitou a aprovação."
      />
    );
  }
  if (view.state === 'closed') {
    return (
      <Notice
        icon={<XCircle className="mx-auto mb-3 h-10 w-10 text-tx-muted" />}
        title="Esta aprovação foi encerrada."
        text="Ela foi cancelada ou já concluída por outro aprovador e não aceita mais decisão."
      />
    );
  }
  return <PendingApproval token={token} view={view} onChange={onChange} onInvalid={onInvalid} />;
}

function PendingApproval({
  token,
  view,
  onChange,
  onInvalid,
}: {
  token: string;
  view: ExternalApprovalView;
  onChange: (view: ExternalApprovalView) => void;
  onInvalid: () => void;
}) {
  const [choice, setChoice] = useState<ExternalApprovalDecision | null>(null);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { approval, solicitation } = view;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!choice) {
      setError('Escolha Aprovar ou Reprovar.');
      return;
    }
    if (!isValidEmail(confirmEmail)) {
      setError('Informe o e-mail que recebeu este link, para confirmar que é você.');
      return;
    }
    if (choice === 'rejected' && !comment.trim()) {
      setError('Informe o motivo da reprovação.');
      return;
    }

    setSubmitting(true);
    try {
      onChange(
        await decideExternalApproval(token, {
          decision: choice,
          comment: comment.trim() || undefined,
          confirmEmail: confirmEmail.trim(),
        }),
      );
    } catch (caught: unknown) {
      const info = parseExternalApprovalError(caught, 'Não foi possível registrar a decisão. Tente novamente.');
      if (info.status === 404) {
        onInvalid();
      } else if (info.status === 410) {
        // Expirou, foi bloqueado, decidido por outra aba ou encerrado: a tela passa a mostrar o estado.
        onChange({ state: info.state ?? 'expired', orgName: view.orgName });
      } else {
        setError(info.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className={cardCls}>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-tx-muted">
          {view.orgName} · aprovação pendente
        </p>
        <h2 className="text-2xl font-bold text-tx-primary">{approval?.title}</h2>
        {approval?.description ? (
          <p className="mt-2 whitespace-pre-wrap text-sm text-tx-secondary">{approval.description}</p>
        ) : null}
        {view.expiresAt ? (
          <p className="mt-3 text-xs text-tx-secondary">Link válido até {formatDateTime(view.expiresAt)}.</p>
        ) : null}
      </div>

      {solicitation ? (
        <div className={cardCls}>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-tx-muted">Solicitação</p>
          <h3 className="text-lg font-bold text-tx-primary">
            #{solicitation.number} · {solicitation.title}
          </h3>
          {solicitation.description ? (
            <p className="mt-2 whitespace-pre-wrap text-sm text-tx-secondary">{solicitation.description}</p>
          ) : null}
          <p className="mt-3 text-xs text-tx-secondary">
            {solicitation.requesterName ? `Solicitante: ${solicitation.requesterName} · ` : ''}
            Aberta em {formatDateTime(solicitation.createdAt)}
          </p>
          {solicitation.answers.length > 0 ? (
            <dl className="mt-4 grid gap-3 border-t border-border-subtle pt-4 sm:grid-cols-2">
              {solicitation.answers.map((answer, index) => (
                <div key={`${answer.label}-${index}`} className="min-w-0">
                  <dt className="text-xs font-semibold text-tx-secondary">{answer.label}</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm text-tx-primary">{answer.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      ) : null}

      <form onSubmit={(event) => void submit(event)} className={`${cardCls} grid gap-4`} noValidate>
        <div>
          <p className="mb-2 text-sm font-bold text-tx-primary">Sua decisão</p>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Sua decisão">
            {(
              [
                ['approved', 'Aprovar', 'border-green-600 bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300'],
                ['rejected', 'Reprovar', 'border-red-600 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300'],
              ] as const
            ).map(([value, label, activeCls]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={choice === value}
                onClick={() => setChoice(value)}
                className={[
                  'min-h-11 rounded-xl border-2 px-3 py-2 text-sm font-bold transition-colors',
                  choice === value ? activeCls : 'border-border-default text-tx-secondary hover:bg-bg-hover',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <label className="grid gap-1.5">
          <span className="text-sm font-bold text-tx-primary">
            Comentário{choice === 'rejected' ? ' (obrigatório)' : ' (opcional)'}
          </span>
          <textarea
            value={comment}
            rows={3}
            maxLength={2000}
            onChange={(event) => setComment(event.target.value)}
            className="w-full rounded-xl border border-border-strong bg-bg-input px-3 py-2 text-base text-tx-primary outline-none ring-primary/30 placeholder:text-tx-ph focus:ring-2 sm:text-sm"
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-sm font-bold text-tx-primary">Confirme seu e-mail</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="off"
            value={confirmEmail}
            onChange={(event) => setConfirmEmail(event.target.value)}
            placeholder={view.emailHint ?? 'seu@email.com'}
            className="w-full rounded-xl border border-border-strong bg-bg-input px-3 py-2 text-base text-tx-primary outline-none ring-primary/30 placeholder:text-tx-ph focus:ring-2 sm:text-sm"
          />
          <span className="inline-flex items-center gap-1 text-xs text-tx-secondary">
            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            Digite o e-mail que recebeu este link{view.emailHint ? ` (${view.emailHint})` : ''}. Protege contra link encaminhado.
          </span>
        </label>

        {error ? (
          <p role="alert" className="break-words rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="min-h-11 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-60"
        >
          {submitting
            ? 'Enviando...'
            : choice === 'approved'
              ? 'Confirmar aprovação'
              : choice === 'rejected'
                ? 'Confirmar reprovação'
                : 'Confirmar decisão'}
        </button>
        <p className="text-center text-xs text-tx-muted">A decisão não pode ser desfeita depois de confirmada.</p>
      </form>
    </div>
  );
}
