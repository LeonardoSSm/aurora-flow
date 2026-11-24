import { ChevronDown, ChevronRight, History, Pencil, Plus, Trash2, X, Zap } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '../../../components/ui';
import { fetchAssignableUsers } from '../../users/services/users-api';
import type { AutomationRuleInput } from '../services/automations-api';
import { useAutomationExecutions, useAutomations } from '../hooks/use-automations';
import type { AutomationExecution, AutomationRule } from '../types';

// ─── Local form state types ────────────────────────────────────────────────

type HeaderRow = { id: string; key: string; value: string };
type ConditionRow = { id: string; fieldCode: string; operator: string; value: string };

type ActionRow =
  | { id: string; type: 'send_email'; to: string; subject: string; body: string }
  | {
      id: string;
      type: 'webhook';
      url: string;
      method: 'POST' | 'GET' | 'PUT';
      headers: HeaderRow[];
      body: string;
    }
  | { id: string; type: 'notify_users'; userIds: string[]; message: string };

type RuleForm = {
  name: string;
  conditionsExpanded: boolean;
  conditionMatch: 'all' | 'any';
  conditions: ConditionRow[];
  actions: ActionRow[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function emptyForm(): RuleForm {
  return {
    name: '',
    conditionsExpanded: false,
    conditionMatch: 'all',
    conditions: [],
    actions: [{ id: uid(), type: 'send_email', to: '', subject: '', body: '' }],
  };
}

function ruleToForm(rule: AutomationRule): RuleForm {
  const actions: ActionRow[] = rule.actions.map((a) => {
    if (a.type === 'send_email') {
      return { id: uid(), type: 'send_email', to: a.to, subject: a.subject, body: a.body };
    }
    if (a.type === 'webhook') {
      const headers = Object.entries(a.headers ?? {}).map(([key, value]) => ({
        id: uid(),
        key,
        value,
      }));
      return {
        id: uid(),
        type: 'webhook',
        url: a.url,
        method: (a.method ?? 'POST') as 'POST' | 'GET' | 'PUT',
        headers,
        body: a.body ?? '',
      };
    }
    return { id: uid(), type: 'notify_users', userIds: a.userIds, message: a.message };
  });

  return {
    name: rule.name,
    conditionsExpanded: (rule.conditions?.rules?.length ?? 0) > 0,
    conditionMatch: rule.conditions?.match ?? 'all',
    conditions: (rule.conditions?.rules ?? []).map((r) => ({
      id: uid(),
      fieldCode: r.fieldCode,
      operator: r.operator,
      value: r.value ?? '',
    })),
    actions:
      actions.length > 0
        ? actions
        : [{ id: uid(), type: 'send_email', to: '', subject: '', body: '' }],
  };
}

function formToPayload(form: RuleForm): AutomationRuleInput {
  const conditions =
    form.conditions.length > 0
      ? {
          match: form.conditionMatch,
          rules: form.conditions.map(({ fieldCode, operator, value }) => ({
            fieldCode,
            operator,
            value,
          })),
        }
      : null;

  const actions: Record<string, unknown>[] = form.actions.map((action) => {
    if (action.type === 'send_email') {
      return { type: 'send_email', to: action.to, subject: action.subject, body: action.body };
    }
    if (action.type === 'webhook') {
      const headers: Record<string, string> = {};
      action.headers
        .filter((h) => h.key)
        .forEach((h) => {
          headers[h.key] = h.value;
        });
      return {
        type: 'webhook',
        url: action.url,
        method: action.method,
        headers,
        ...(action.body ? { body: action.body } : {}),
      };
    }
    return { type: 'notify_users', userIds: action.userIds, message: action.message };
  });

  return { name: form.name.trim(), conditions, actions };
}

function actionLabel(type: string) {
  if (type === 'send_email') return 'Enviar e-mail';
  if (type === 'webhook') return 'Chamar webhook';
  if (type === 'notify_users') return 'Notificar usuários';
  return type;
}

// ─── Input style shared ───────────────────────────────────────────────────

const inp =
  'h-9 w-full rounded-[8px] border border-border-default bg-bg-s2 px-3 text-sm text-tx-primary outline-none focus:border-primary placeholder:text-tx-muted';

const selectCls =
  'h-9 w-full rounded-[8px] border border-border-default bg-bg-s2 px-3 text-sm text-tx-primary outline-none focus:border-primary';

// ─── SwitchControl (reused pattern from builder) ──────────────────────────

function Switch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={[
        'relative h-6 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-bg-hover',
      ].join(' ')}
    >
      <span
        className={[
          'absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-6' : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  );
}

// ─── Executions panel ─────────────────────────────────────────────────────

function statusBadge(status: AutomationExecution['status']) {
  const map = {
    success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
    failed: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300',
    running: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300',
    pending: 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-200',
  };
  const labels = {
    success: '✓ Sucesso',
    failed: '✗ Erro',
    running: '⟳ Em execução',
    pending: '○ Pendente',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${map[status]}`}>
      {labels[status]}
    </span>
  );
}

function ExecutionsPanel({ ruleId }: { ruleId: string }) {
  const { data, isLoading } = useAutomationExecutions(ruleId, true);

  if (isLoading) {
    return <p className="py-3 text-sm text-tx-secondary">Carregando histórico...</p>;
  }

  if (!data || data.length === 0) {
    return (
      <p className="py-3 text-sm text-tx-secondary">Nenhuma execução registrada para esta regra.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px] text-sm">
        <thead>
          <tr className="border-b border-border-default text-xs text-tx-secondary">
            <th className="py-2 pr-4 text-left font-semibold">Data</th>
            <th className="py-2 pr-4 text-left font-semibold">Status</th>
            <th className="py-2 pr-4 text-left font-semibold">Ações executadas</th>
            <th className="py-2 text-left font-semibold">Mensagem de erro</th>
          </tr>
        </thead>
        <tbody>
          {data.map((ex) => (
            <tr key={ex.id} className="border-b border-[#f0f4f9] last:border-0">
              <td className="py-2 pr-4 text-tx-primary">
                {new Date(ex.startedAt).toLocaleString('pt-BR')}
              </td>
              <td className="py-2 pr-4">{statusBadge(ex.status)}</td>
              <td className="py-2 pr-4 text-tx-secondary">{ex.actionsExecuted.length}</td>
              <td className="py-2 text-rose-600">
                {ex.errorMessage ? (
                  <span title={ex.errorMessage} className="line-clamp-1 max-w-[260px]">
                    {ex.errorMessage}
                  </span>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Action form card ──────────────────────────────────────────────────────

function ActionCard({
  action,
  formFields: _formFields,
  canRemove,
  onUpdate,
  onRemove,
}: {
  action: ActionRow;
  formFields: { code: string; label: string }[];
  canRemove: boolean;
  onUpdate: (patch: Partial<ActionRow>) => void;
  onRemove: () => void;
}) {
  const usersQuery = useQuery({
    queryKey: ['users', 'assignable'],
    queryFn: () => fetchAssignableUsers(),
    enabled: action.type === 'notify_users',
  });

  return (
    <div className="rounded-[10px] border border-border-default bg-bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <select
          value={action.type}
          onChange={(e) => {
            const t = e.target.value;
            if (t === 'send_email') {
              onUpdate({
                id: action.id,
                type: 'send_email',
                to: '',
                subject: '',
                body: '',
              } as ActionRow);
            } else if (t === 'webhook') {
              onUpdate({
                id: action.id,
                type: 'webhook',
                url: '',
                method: 'POST',
                headers: [],
                body: '',
              } as ActionRow);
            } else {
              onUpdate({
                id: action.id,
                type: 'notify_users',
                userIds: [],
                message: '',
              } as ActionRow);
            }
          }}
          className={selectCls + ' max-w-[220px]'}
        >
          <option value="send_email">Enviar e-mail</option>
          <option value="webhook">Chamar webhook</option>
          <option value="notify_users">Notificar usuários</option>
        </select>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="grid h-7 w-7 place-items-center rounded-[6px] text-tx-secondary hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {action.type === 'send_email' && (
        <div className="grid gap-3">
          <div className="grid gap-1">
            <label className="text-xs font-semibold text-tx-secondary">Para (e-mail)</label>
            <div className="flex gap-2">
              <input
                value={action.to}
                onChange={(e) => onUpdate({ ...action, to: e.target.value })}
                placeholder="destino@email.com ou {{responderEmail}}"
                className={inp + ' flex-1'}
              />
              <button
                type="button"
                onClick={() =>
                  onUpdate({
                    ...action,
                    to: action.to ? `${action.to},{{responderEmail}}` : '{{responderEmail}}',
                  })
                }
                className="h-9 shrink-0 rounded-[8px] bg-bg-hover px-3 text-xs font-bold text-primary"
              >
                + Respondente
              </button>
            </div>
          </div>
          <div className="grid gap-1">
            <label className="text-xs font-semibold text-tx-secondary">Assunto</label>
            <input
              value={action.subject}
              onChange={(e) => onUpdate({ ...action, subject: e.target.value })}
              placeholder="Nova resposta em {{formId}}"
              className={inp}
            />
          </div>
          <div className="grid gap-1">
            <label className="text-xs font-semibold text-tx-secondary">Corpo</label>
            <textarea
              rows={4}
              value={action.body}
              onChange={(e) => onUpdate({ ...action, body: e.target.value })}
              placeholder="Olá! {{responderName}} enviou uma resposta."
              className="w-full rounded-[8px] border border-border-default bg-bg-s2 px-3 py-2 text-sm text-tx-primary outline-none focus:border-primary placeholder:text-tx-muted"
            />
          </div>
        </div>
      )}

      {action.type === 'webhook' && (
        <div className="grid gap-3">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div className="grid gap-1">
              <label className="text-xs font-semibold text-tx-secondary">URL</label>
              <input
                value={action.url}
                onChange={(e) => onUpdate({ ...action, url: e.target.value })}
                placeholder="https://exemplo.com/webhook"
                className={inp}
              />
            </div>
            <div className="grid gap-1">
              <label className="text-xs font-semibold text-tx-secondary">Método</label>
              <select
                value={action.method}
                onChange={(e) =>
                  onUpdate({ ...action, method: e.target.value as 'POST' | 'GET' | 'PUT' })
                }
                className={selectCls + ' w-24'}
              >
                <option value="POST">POST</option>
                <option value="GET">GET</option>
                <option value="PUT">PUT</option>
              </select>
            </div>
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-tx-secondary">Headers (opcional)</label>
              <button
                type="button"
                onClick={() =>
                  onUpdate({
                    ...action,
                    headers: [...action.headers, { id: uid(), key: '', value: '' }],
                  })
                }
                className="text-xs font-bold text-primary"
              >
                + Adicionar
              </button>
            </div>
            {action.headers.map((h) => (
              <div key={h.id} className="flex gap-2">
                <input
                  value={h.key}
                  onChange={(e) =>
                    onUpdate({
                      ...action,
                      headers: action.headers.map((x) =>
                        x.id === h.id ? { ...x, key: e.target.value } : x,
                      ),
                    })
                  }
                  placeholder="Content-Type"
                  className={inp + ' flex-1'}
                />
                <input
                  value={h.value}
                  onChange={(e) =>
                    onUpdate({
                      ...action,
                      headers: action.headers.map((x) =>
                        x.id === h.id ? { ...x, value: e.target.value } : x,
                      ),
                    })
                  }
                  placeholder="application/json"
                  className={inp + ' flex-1'}
                />
                <button
                  type="button"
                  onClick={() =>
                    onUpdate({ ...action, headers: action.headers.filter((x) => x.id !== h.id) })
                  }
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] text-tx-secondary hover:bg-rose-50 hover:text-rose-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="grid gap-1">
            <label className="text-xs font-semibold text-tx-secondary">Body (opcional)</label>
            <textarea
              rows={3}
              value={action.body}
              onChange={(e) => onUpdate({ ...action, body: e.target.value })}
              placeholder='{"submission":"{{submissionId}}"}'
              className="w-full rounded-[8px] border border-border-default bg-bg-s2 px-3 py-2 font-mono text-sm text-tx-primary outline-none focus:border-primary placeholder:text-tx-muted"
            />
          </div>
        </div>
      )}

      {action.type === 'notify_users' && (
        <div className="grid gap-3">
          <div className="grid gap-1">
            <label className="text-xs font-semibold text-tx-secondary">Usuários</label>
            <div className="max-h-36 overflow-y-auto rounded-[8px] border border-border-default bg-bg-s2 p-2">
              {usersQuery.isLoading ? (
                <p className="text-xs text-tx-secondary">Carregando...</p>
              ) : (usersQuery.data ?? []).length === 0 ? (
                <p className="text-xs text-tx-secondary">Nenhum usuário disponível.</p>
              ) : (
                (usersQuery.data ?? []).map((user) => (
                  <label
                    key={user.id}
                    className="flex cursor-pointer items-center gap-2 py-1 text-sm text-tx-primary"
                  >
                    <input
                      type="checkbox"
                      checked={action.userIds.includes(user.id)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...action.userIds, user.id]
                          : action.userIds.filter((id) => id !== user.id);
                        onUpdate({ ...action, userIds: next });
                      }}
                    />
                    {user.fullName} <span className="text-xs text-tx-secondary">({user.email})</span>
                  </label>
                ))
              )}
            </div>
          </div>
          <div className="grid gap-1">
            <label className="text-xs font-semibold text-tx-secondary">Mensagem</label>
            <input
              value={action.message}
              onChange={(e) => onUpdate({ ...action, message: e.target.value })}
              placeholder="Nova resposta de {{responderName}}"
              className={inp}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Variables panel ──────────────────────────────────────────────────────

function VariablesPanel({ formFields }: { formFields: { code: string; label: string }[] }) {
  const vars = [
    { variable: '{{submissionId}}', desc: 'ID da submissão' },
    { variable: '{{formId}}', desc: 'ID do formulário' },
    { variable: '{{responderName}}', desc: 'Nome do respondente' },
    { variable: '{{responderEmail}}', desc: 'E-mail do respondente' },
    ...formFields.map((f) => ({
      variable: `{{field.${f.code}}}`,
      desc: f.label || f.code,
    })),
  ];

  return (
    <div className="sticky top-4 w-60 shrink-0">
      <div className="rounded-[10px] border border-border-strong bg-bg-s2 p-4">
        <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-tx-secondary">
          Variáveis disponíveis
        </h4>
        <div className="grid gap-2">
          {vars.map((v) => (
            <div key={v.variable}>
              <code className="block rounded bg-bg-hover px-1.5 py-0.5 text-[11px] font-mono text-primary">
                {v.variable}
              </code>
              <span className="mt-0.5 block text-[11px] text-tx-secondary">{v.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Rule modal ───────────────────────────────────────────────────────────

function RuleModal({
  formId: _formId,
  editingRule,
  formFields,
  saving,
  onSave,
  onClose,
}: {
  formId: string;
  editingRule: AutomationRule | null;
  formFields: { code: string; label: string }[];
  saving: boolean;
  onSave: (payload: AutomationRuleInput) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<RuleForm>(() =>
    editingRule ? ruleToForm(editingRule) : emptyForm(),
  );
  const [error, setError] = useState('');

  function patchForm(patch: Partial<RuleForm>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  function updateAction(id: string, next: ActionRow) {
    setForm((f) => ({ ...f, actions: f.actions.map((a) => (a.id === id ? next : a)) }));
  }

  function removeAction(id: string) {
    setForm((f) => ({ ...f, actions: f.actions.filter((a) => a.id !== id) }));
  }

  function addAction() {
    setForm((f) => ({
      ...f,
      actions: [...f.actions, { id: uid(), type: 'send_email', to: '', subject: '', body: '' }],
    }));
  }

  function addCondition() {
    setForm((f) => ({
      ...f,
      conditions: [...f.conditions, { id: uid(), fieldCode: '', operator: 'equals', value: '' }],
    }));
  }

  function updateCondition(id: string, patch: Partial<ConditionRow>) {
    setForm((f) => ({
      ...f,
      conditions: f.conditions.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  }

  function removeCondition(id: string) {
    setForm((f) => ({ ...f, conditions: f.conditions.filter((c) => c.id !== id) }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Nome da regra é obrigatório.');
      return;
    }
    if (form.actions.length === 0) {
      setError('Adicione pelo menos uma ação.');
      return;
    }
    setError('');
    await onSave(formToPayload(form));
  }

  const operatorOptions = [
    { value: 'equals', label: 'é igual a' },
    { value: 'not_equals', label: 'não é igual a' },
    { value: 'contains', label: 'contém' },
    { value: 'is_empty', label: 'está vazio' },
    { value: 'is_not_empty', label: 'não está vazio' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6">
      <div className="my-auto flex w-full max-w-4xl gap-5">
        {/* Main form */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 rounded-[12px] border border-border-strong bg-bg-surface p-6"
        >
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-lg font-bold text-tx-primary">
              {editingRule ? 'Editar Automação' : 'Nova Automação'}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-[8px] text-tx-secondary hover:bg-bg-s2"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Name */}
          <div className="mb-4 grid gap-2">
            <label className="text-sm font-bold text-tx-primary">
              Nome da regra <span className="text-rose-500">*</span>
            </label>
            <input
              value={form.name}
              onChange={(e) => patchForm({ name: e.target.value })}
              placeholder="Ex: Notificar time de vendas"
              className={inp}
            />
          </div>

          {/* Trigger */}
          <div className="mb-5 grid gap-2">
            <label className="text-sm font-bold text-tx-primary">Gatilho</label>
            <select className={selectCls} value="on_submission" disabled>
              <option value="on_submission">Ao receber uma resposta</option>
            </select>
          </div>

          {/* Conditions (collapsible) */}
          <div className="mb-5 rounded-[10px] border border-border-default">
            <button
              type="button"
              onClick={() => patchForm({ conditionsExpanded: !form.conditionsExpanded })}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-bold text-tx-primary"
            >
              <span>Condições (opcional)</span>
              {form.conditionsExpanded ? (
                <ChevronDown className="h-4 w-4 text-tx-secondary" />
              ) : (
                <ChevronRight className="h-4 w-4 text-tx-secondary" />
              )}
            </button>

            {form.conditionsExpanded && (
              <div className="border-t border-border-default p-4">
                <div className="mb-3 flex items-center gap-3">
                  <span className="text-xs text-tx-secondary">Executar quando</span>
                  <select
                    value={form.conditionMatch}
                    onChange={(e) => patchForm({ conditionMatch: e.target.value as 'all' | 'any' })}
                    className={selectCls + ' w-28'}
                  >
                    <option value="all">TODAS</option>
                    <option value="any">ALGUMA</option>
                  </select>
                  <span className="text-xs text-tx-secondary">as condições forem atendidas</span>
                </div>

                <div className="grid gap-2">
                  {form.conditions.map((cond) => (
                    <div key={cond.id} className="flex items-center gap-2">
                      <select
                        value={cond.fieldCode}
                        onChange={(e) => updateCondition(cond.id, { fieldCode: e.target.value })}
                        className={selectCls + ' flex-1'}
                      >
                        <option value="">Selecionar campo</option>
                        {formFields.map((f) => (
                          <option key={f.code} value={f.code}>
                            {f.label || f.code}
                          </option>
                        ))}
                      </select>
                      <select
                        value={cond.operator}
                        onChange={(e) => updateCondition(cond.id, { operator: e.target.value })}
                        className={selectCls + ' w-40'}
                      >
                        {operatorOptions.map((op) => (
                          <option key={op.value} value={op.value}>
                            {op.label}
                          </option>
                        ))}
                      </select>
                      {!['is_empty', 'is_not_empty'].includes(cond.operator) && (
                        <input
                          value={cond.value}
                          onChange={(e) => updateCondition(cond.id, { value: e.target.value })}
                          placeholder="Valor"
                          className={inp + ' w-32'}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => removeCondition(cond.id)}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] text-tx-secondary hover:bg-rose-50 hover:text-rose-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={addCondition}
                  className="mt-3 text-xs font-bold text-primary hover:underline"
                >
                  + Adicionar condição
                </button>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="mb-5 grid gap-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-tx-primary">
                Ações <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={addAction}
                className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar ação
              </button>
            </div>
            {form.actions.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                formFields={formFields}
                canRemove={form.actions.length > 1}
                onUpdate={(next) => updateAction(action.id, next as ActionRow)}
                onRemove={() => removeAction(action.id)}
              />
            ))}
          </div>

          {error && <p className="mb-3 text-sm font-semibold text-rose-600">{error}</p>}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-[8px] px-4 text-sm font-bold text-tx-secondary hover:bg-bg-s2"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-10 rounded-[8px] bg-primary px-5 text-sm font-bold text-white disabled:opacity-60"
            >
              {saving ? 'Salvando...' : editingRule ? 'Salvar alterações' : 'Criar automação'}
            </button>
          </div>
        </form>

        {/* Variables panel */}
        <VariablesPanel formFields={formFields} />
      </div>
    </div>
  );
}

// ─── Main view ─────────────────────────────────────────────────────────────

type AutomationsViewProps = {
  formId: string;
  formFields: { code: string; label: string }[];
};

export function AutomationsView({ formId, formFields }: AutomationsViewProps) {
  const { showToast } = useToast();
  const { rules, loading, createRule, updateRule, deleteRule, saving, deleting } =
    useAutomations(formId);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (!formId) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[10px] border border-dashed border-border-strong bg-bg-surface py-16 text-center">
        <Zap className="mb-3 h-8 w-8 text-tx-muted" />
        <p className="text-sm font-semibold text-tx-secondary">
          Salve o formulário primeiro para gerenciar automações.
        </p>
      </div>
    );
  }

  async function handleSave(payload: AutomationRuleInput) {
    try {
      if (editingRule) {
        await updateRule({ id: editingRule.id, payload });
        showToast({ title: 'Automação atualizada', variant: 'success' });
      } else {
        await createRule(payload);
        showToast({ title: 'Automação criada', variant: 'success' });
      }
      setModalOpen(false);
      setEditingRule(null);
    } catch {
      showToast({ title: 'Erro ao salvar automação', variant: 'error' });
    }
  }

  async function handleToggle(rule: AutomationRule) {
    try {
      await updateRule({ id: rule.id, payload: { isActive: !rule.isActive } });
    } catch {
      showToast({ title: 'Erro ao atualizar status', variant: 'error' });
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteRule(id);
      showToast({ title: 'Automação excluída', variant: 'success' });
    } catch {
      showToast({ title: 'Erro ao excluir automação', variant: 'error' });
    } finally {
      setConfirmDeleteId(null);
    }
  }

  function openCreate() {
    setEditingRule(null);
    setModalOpen(true);
  }

  function openEdit(rule: AutomationRule) {
    setEditingRule(rule);
    setModalOpen(true);
  }

  return (
    <>
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-tx-primary">Automações</h3>
          <p className="mt-0.5 text-sm text-tx-secondary">
            Regras executadas automaticamente após cada submissão.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-primary px-4 text-sm font-bold text-white"
        >
          <Plus className="h-4 w-4" />
          Nova automação
        </button>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-sm text-tx-secondary">Carregando automações...</p>
      ) : rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[10px] border border-dashed border-border-strong bg-bg-surface py-14 text-center">
          <Zap className="mb-3 h-7 w-7 text-tx-muted" />
          <p className="text-sm font-semibold text-tx-secondary">Nenhuma automação criada.</p>
          <p className="mt-1 text-xs text-tx-muted">
            Clique em "Nova automação" para criar a primeira regra.
          </p>
        </div>
      ) : (
        <div className="rounded-[10px] border border-border-strong bg-bg-surface overflow-hidden">
          {rules.map((rule, index) => {
            const isExpanded = expandedRuleId === rule.id;
            return (
              <div
                key={rule.id}
                className={index !== rules.length - 1 ? 'border-b border-border-default' : ''}
              >
                <div className="flex items-center gap-4 px-5 py-4">
                  {/* Expand toggle */}
                  <button
                    type="button"
                    onClick={() => setExpandedRuleId(isExpanded ? null : rule.id)}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-[6px] text-tx-secondary hover:bg-bg-hover"
                    title="Ver histórico de execuções"
                  >
                    <History className="h-4 w-4" />
                  </button>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-bold text-tx-primary">{rule.name}</p>
                    <p className="mt-0.5 text-xs text-tx-secondary">
                      Ao receber uma resposta &middot;{' '}
                      {rule.actions.length === 1 ? '1 ação' : `${rule.actions.length} ações`}
                      {rule.actions.length > 0 && (
                        <span className="ml-1 text-tx-muted">
                          ({rule.actions.map((a) => actionLabel(a.type)).join(', ')})
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Active toggle */}
                  <Switch checked={rule.isActive} onChange={() => handleToggle(rule)} />

                  {/* Actions */}
                  <button
                    type="button"
                    onClick={() => openEdit(rule)}
                    className="grid h-8 w-8 place-items-center rounded-[6px] text-tx-secondary hover:bg-bg-hover hover:text-primary"
                    title="Editar"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(rule.id)}
                    className="grid h-8 w-8 place-items-center rounded-[6px] text-tx-secondary hover:bg-rose-50 hover:text-rose-600"
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Execution history (expanded) */}
                {isExpanded && (
                  <div className="border-t border-[#f0f4f9] bg-bg-s2 px-5 py-3">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-tx-secondary">
                      Histórico de execuções
                    </p>
                    <ExecutionsPanel ruleId={rule.id} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <RuleModal
          formId={formId}
          editingRule={editingRule}
          formFields={formFields}
          saving={saving}
          onSave={handleSave}
          onClose={() => {
            setModalOpen(false);
            setEditingRule(null);
          }}
        />
      )}

      {/* Delete confirmation */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-[12px] border border-border-strong bg-bg-surface p-6">
            <h4 className="text-base font-bold text-tx-primary">Excluir automação?</h4>
            <p className="mt-2 text-sm text-tx-secondary">
              Esta ação não pode ser desfeita. O histórico de execuções também será excluído.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="h-9 rounded-[8px] px-4 text-sm font-bold text-tx-secondary hover:bg-bg-s2"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => handleDelete(confirmDeleteId)}
                className="h-9 rounded-[8px] bg-rose-600 px-4 text-sm font-bold text-white disabled:opacity-60"
              >
                {deleting ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
