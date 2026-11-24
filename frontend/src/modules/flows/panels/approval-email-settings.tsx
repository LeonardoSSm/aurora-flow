import { Check, Loader2, Mail, Pencil, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFlowFormFields } from '../hooks/use-flow-form-fields';
import { useNotificationPreview } from '../hooks/use-notification-preview';
import {
  APPROVAL_EMAIL_BODY_MAX,
  APPROVAL_EMAIL_SUBJECT_MAX,
  DEFAULT_APPROVAL_EMAIL_BODY,
  DEFAULT_APPROVAL_EMAIL_SUBJECT,
  readApprovalEmail,
  type ApprovalEmailConfig,
} from '../lib/approval-email';
import { fieldVariables } from '../lib/field-variables';
import { hasMalformedTokens, NOTIFICATION_BUILTIN_VARIABLES } from '../lib/notification-config';
import type { FlowNodeData } from '../types/flow.types';
import { inputCls } from './node-config/fields';

/** Variáveis mais úteis num aviso de aprovação, em destaque no topo da lista. */
const APPROVAL_VARIABLES = ['approval_title', 'approval_description', 'approval_link', 'solicitation_title', 'tracking_url'];

/**
 * Modal "Editar e-mail": assunto e texto com variáveis e a prévia renderizada pelo backend (a mesma
 * renderização do envio, com dados de exemplo). "Restaurar padrão" volta ao texto de fábrica.
 */
function ApprovalEmailModal({
  formId,
  initial,
  onSave,
  onClose,
}: {
  formId: string | null;
  initial: ApprovalEmailConfig;
  onSave: (next: { subject: string; body: string }) => void;
  onClose: () => void;
}) {
  const [subject, setSubject] = useState(initial.subject?.trim() ? initial.subject : DEFAULT_APPROVAL_EMAIL_SUBJECT);
  const [body, setBody] = useState(initial.body?.trim() ? initial.body : DEFAULT_APPROVAL_EMAIL_BODY);
  const [focused, setFocused] = useState<'subject' | 'body'>('body');
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const { data: fields = [] } = useFlowFormFields(formId);
  const formVariables = fieldVariables(fields);
  const builtins = [...NOTIFICATION_BUILTIN_VARIABLES].sort(
    (a, b) => Number(APPROVAL_VARIABLES.includes(b.name)) - Number(APPROVAL_VARIABLES.includes(a.name)),
  );
  const preview = useNotificationPreview({
    channel: 'email',
    title: subject,
    content: body,
    fieldCodes: formVariables.map((variable) => variable.name),
  });

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function insert(name: string) {
    const token = `{{${name}}}`;
    const target = focused === 'subject' ? subjectRef.current : bodyRef.current;
    const value = focused === 'subject' ? subject : body;
    const start = target?.selectionStart ?? value.length;
    const end = target?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    if (focused === 'subject') setSubject(next);
    else setBody(next);
    requestAnimationFrame(() => {
      target?.focus();
      target?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  const subjectError = !subject.trim()
    ? 'Informe o assunto.'
    : subject.length > APPROVAL_EMAIL_SUBJECT_MAX
      ? `Até ${APPROVAL_EMAIL_SUBJECT_MAX} caracteres.`
      : hasMalformedTokens(subject)
        ? 'Variável mal formada (use {{nome}}).'
        : null;
  const bodyError = !body.trim()
    ? 'Informe o texto.'
    : body.length > APPROVAL_EMAIL_BODY_MAX
      ? `Até ${APPROVAL_EMAIL_BODY_MAX} caracteres.`
      : hasMalformedTokens(body)
        ? 'Variável mal formada (use {{nome}}).'
        : null;

  // Portal no body: o painel do nó tem transform, que prenderia o `fixed` dentro dele.
  return createPortal(
    <div className="fixed inset-0 z-[95] grid place-items-center bg-[#071a38]/50 px-4 py-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="approval-email-title"
        className="flex max-h-[90dvh] w-full max-w-[900px] flex-col overflow-hidden rounded-[14px] bg-bg-surface shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border-default px-5 py-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-tx-secondary">Criar aprovação</p>
            <h3 id="approval-email-title" className="text-lg font-bold text-tx-primary">
              E-mail para quem aprova
            </h3>
            <p className="text-xs text-tx-secondary">
              Sai quando a aprovação é criada, para cada aprovador com usuário (nomeado ou pelo perfil).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-bg-hover"
          >
            <X className="h-5 w-5 text-tx-secondary" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto px-5 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
          <div className="grid content-start gap-4">
            <label className="grid gap-1">
              <span className="text-[11px] font-bold uppercase tracking-wide text-tx-secondary">Assunto</span>
              <input
                ref={subjectRef}
                value={subject}
                onFocus={() => setFocused('subject')}
                onChange={(e) => setSubject(e.target.value)}
                aria-label="Assunto do e-mail"
                className={inputCls}
              />
              {subjectError ? <span role="alert" className="text-xs font-semibold text-nc-danger">{subjectError}</span> : null}
            </label>
            <label className="grid gap-1">
              <span className="text-[11px] font-bold uppercase tracking-wide text-tx-secondary">Texto</span>
              <textarea
                ref={bodyRef}
                value={body}
                onFocus={() => setFocused('body')}
                onChange={(e) => setBody(e.target.value)}
                rows={11}
                aria-label="Texto do e-mail"
                className="w-full resize-y rounded-[8px] border border-border-default bg-bg-s2 px-3 py-2 text-sm text-tx-primary outline-none focus:border-primary"
              />
              <span className="flex justify-between text-[11px] text-tx-muted">
                <span>Texto puro: o link da aprovação vira clicável no e-mail.</span>
                <span>{body.length}/{APPROVAL_EMAIL_BODY_MAX}</span>
              </span>
              {bodyError ? <span role="alert" className="text-xs font-semibold text-nc-danger">{bodyError}</span> : null}
            </label>

            <div className="grid gap-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-tx-secondary">
                Inserir variável no {focused === 'subject' ? 'assunto' : 'texto'}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[...builtins, ...formVariables].map((variable) => (
                  <button
                    key={variable.name}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insert(variable.name)}
                    title={`{{${variable.name}}}`}
                    className={[
                      'rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                      APPROVAL_VARIABLES.includes(variable.name)
                        ? 'border-primary/40 bg-primary/10 text-primary dark:bg-blue-900/40 dark:text-blue-300'
                        : 'border-border-default bg-bg-s2 text-tx-secondary hover:border-primary/50',
                    ].join(' ')}
                  >
                    {variable.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <aside className="grid content-start gap-2" aria-label="Prévia do e-mail">
            <p className="text-[11px] font-bold uppercase tracking-wide text-tx-secondary">Prévia (dados de exemplo)</p>
            <div className="grid gap-2 rounded-[10px] border border-border-default bg-bg-s2 p-3">
              {preview.isFetching || preview.isDebouncing ? (
                <p className="flex items-center gap-1.5 text-xs text-tx-muted">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Atualizando...
                </p>
              ) : preview.data ? (
                <>
                  <p className="break-words text-sm font-bold text-tx-primary">{preview.data.title}</p>
                  <p className="whitespace-pre-wrap break-words text-xs text-tx-secondary">{preview.data.body}</p>
                  {preview.data.missingVariables.length ? (
                    <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                      Variáveis desconhecidas (sairiam vazias): {preview.data.missingVariables.join(', ')}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-xs text-tx-muted">A prévia aparece aqui.</p>
              )}
            </div>
          </aside>
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-border-default px-5 py-4">
          <button
            type="button"
            onClick={() => {
              setSubject(DEFAULT_APPROVAL_EMAIL_SUBJECT);
              setBody(DEFAULT_APPROVAL_EMAIL_BODY);
            }}
            className="mr-auto text-xs font-bold text-tx-secondary hover:text-tx-primary"
          >
            Restaurar padrão
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-[8px] px-4 text-sm font-bold text-tx-secondary hover:bg-bg-hover"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={Boolean(subjectError || bodyError)}
            onClick={() => {
              onSave({ subject, body });
              onClose();
            }}
            className="h-10 rounded-[8px] bg-primary px-4 text-sm font-bold text-white disabled:opacity-60"
          >
            Salvar e-mail
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

/**
 * Seção "Avisar quem aprova por e-mail" do nó Criar aprovação: liga/desliga e mostra o assunto atual;
 * "Editar e-mail" abre o modal. Aprovador externo (sem usuário) já recebe o link pessoal à parte.
 */
export function ApprovalEmailSettings({
  d,
  formId,
  set,
}: {
  d: FlowNodeData;
  formId: string | null;
  set: (k: string, v: unknown) => void;
}) {
  const config = readApprovalEmail(d.emailApprovers);
  const enabled = config.enabled === true;
  const [editing, setEditing] = useState(false);
  const subject = config.subject?.trim() ? config.subject : DEFAULT_APPROVAL_EMAIL_SUBJECT;
  const customized = Boolean(config.subject?.trim() || config.body?.trim());

  return (
    <div className="col-span-full flex min-w-0 items-center gap-3 rounded-[10px] border border-border-default px-3.5 py-3">
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => set('emailApprovers', { ...config, enabled: e.target.checked })}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className={[
            'grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border-[1.5px] peer-focus-visible:shadow-nc-ring',
            enabled ? 'border-nc-btn bg-nc-btn' : 'border-border-strong bg-nc-input',
          ].join(' ')}
        >
          {enabled && <Check className="h-[11px] w-[11px] text-white" strokeWidth={3} />}
        </span>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-nc-accent-soft text-nc-accent">
          <Mail className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold text-tx-primary">
            Avisar quem aprova por e-mail
          </span>
          <span className="block truncate text-xs text-tx-muted" title={enabled ? subject : undefined}>
            {enabled
              ? `Assunto: ${subject}${customized ? '' : ' (padrão)'}`
              : 'Cada aprovador com usuário recebe um e-mail com o link para decidir.'}
          </span>
        </span>
      </label>
      {enabled ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border-default bg-bg-surface px-3 text-[13px] font-medium text-tx-primary hover:bg-bg-s2"
        >
          <Pencil className="h-3.5 w-3.5" /> Editar e-mail
        </button>
      ) : null}
      {editing ? (
        <ApprovalEmailModal
          formId={formId}
          initial={config}
          onSave={(next) => set('emailApprovers', { ...config, enabled: true, ...next })}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </div>
  );
}
