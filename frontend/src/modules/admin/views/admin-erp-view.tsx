import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Database,
  Edit2,
  Loader2,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  WifiOff,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useEscapeKey } from '../../../hooks/use-escape-key';
import { useErpConnectors, useErpLogs, useErpTemplates } from '../hooks/use-erp-admin';
import type {
  CreateErpConnectorDto,
  CreateErpTemplateDto,
  ErpAuthType,
  ErpConnector,
  ErpHealthResult,
  ErpLog,
  ErpRefreshCredentials,
  ErpTemplate,
  TestConnectionResult,
  UpdateErpConnectorDto,
  UpdateErpTemplateDto,
} from '../services/erp-api';

// ─── Shared styles ────────────────────────────────────────────────────────────

const inputCls =
  'h-9 w-full rounded-[8px] border border-border-default bg-bg-s2 px-3 text-sm font-medium text-tx-primary outline-none focus:border-primary';
const textareaCls =
  'w-full rounded-[8px] border border-border-default bg-bg-s2 px-3 py-2 text-sm font-medium text-tx-primary outline-none resize-none focus:border-primary';
const labelCls = 'text-sm font-bold text-tx-primary';
const hintCls = 'text-[11px] text-tx-muted';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <span className={labelCls}>{label}</span>
      {children}
      {hint && <p className={hintCls}>{hint}</p>}
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ErpLog['status'] }) {
  const map: Record<ErpLog['status'], { label: string; cls: string }> = {
    success: { label: 'Sucesso', cls: 'bg-[#f0fdf4] text-[#16a34a]' },
    failed: { label: 'Falha', cls: 'bg-[#fef2f2] text-[#dc2626]' },
    retrying: { label: 'Retentando', cls: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' },
    pending: { label: 'Pendente', cls: 'bg-bg-s2 text-tx-secondary' },
  };
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-bg-s2 text-tx-secondary' };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${cls}`}>{label}</span>
  );
}

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: 'bg-[#f0fdf4] text-[#16a34a]',
    POST: 'bg-[#eff6ff] text-[#2563eb]',
    PUT: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    PATCH: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
    DELETE: 'bg-[#fef2f2] text-[#dc2626]',
  };
  return (
    <span
      className={`rounded-[4px] px-1.5 py-0.5 text-[11px] font-bold uppercase ${colors[method] ?? 'bg-bg-s2 text-tx-secondary'}`}
    >
      {method}
    </span>
  );
}

// ─── Key/value header editor ──────────────────────────────────────────────────

type KvPair = { key: string; value: string };

function KvEditor({ pairs, onChange }: { pairs: KvPair[]; onChange: (p: KvPair[]) => void }) {
  function update(i: number, field: 'key' | 'value', val: string) {
    const next = [...pairs];
    next[i] = { ...next[i], [field]: val };
    onChange(next);
  }
  function add() {
    onChange([...pairs, { key: '', value: '' }]);
  }
  function remove(i: number) {
    onChange(pairs.filter((_, j) => j !== i));
  }

  return (
    <div className="grid gap-1.5">
      {pairs.map((p, i) => (
        <div key={i} className="flex gap-2">
          <input
            className={inputCls}
            placeholder="Chave"
            value={p.key}
            onChange={(e) => update(i, 'key', e.target.value)}
          />
          <input
            className={inputCls}
            placeholder="Valor"
            value={p.value}
            onChange={(e) => update(i, 'value', e.target.value)}
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] border border-[#fee2e2] text-[#ef4444] hover:bg-[#fef2f2]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1 text-[12px] font-bold text-primary hover:underline"
      >
        <Plus className="h-3.5 w-3.5" /> Adicionar header
      </button>
    </div>
  );
}

// ─── Status code chip editor ──────────────────────────────────────────────────

function StatusCodesEditor({
  codes,
  onChange,
}: {
  codes: number[];
  onChange: (c: number[]) => void;
}) {
  const [input, setInput] = useState('');

  function add() {
    const n = parseInt(input.trim(), 10);
    if (Number.isInteger(n) && n > 0 && !codes.includes(n)) {
      onChange([...codes, n]);
    }
    setInput('');
  }

  function remove(c: number) {
    onChange(codes.filter((x) => x !== c));
  }

  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {codes.map((c) => (
          <span
            key={c}
            className="flex items-center gap-1 rounded-full bg-[#eff6ff] px-2 py-0.5 text-[12px] font-bold text-[#2563eb]"
          >
            {c}
            <button type="button" onClick={() => remove(c)} className="text-tx-muted hover:text-[#ef4444]">
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className={`${inputCls} flex-1`}
          placeholder="Ex: 200"
          value={input}
          type="number"
          min={100}
          max={599}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
        />
        <button
          type="button"
          onClick={add}
          className="h-9 rounded-[8px] border border-border-strong px-3 text-sm font-bold text-tx-secondary hover:border-primary hover:text-primary"
        >
          Adicionar
        </button>
      </div>
    </div>
  );
}

// ─── Connector modal ──────────────────────────────────────────────────────────

type ConnectorDraft = {
  name: string;
  baseUrl: string;
  authType: ErpAuthType;
  // bearer_static
  bearerToken: string;
  // oauth2_client
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  scope: string;
  // basic_login
  username: string;
  password: string;
  loginUrl: string;
  tokenJsonPath: string;
  timeoutMs: string;
  headers: KvPair[];
};

const AUTH_TYPE_LABELS: Record<ErpAuthType, string> = {
  bearer_static: 'Bearer Token estático',
  oauth2_client: 'OAuth2 Client Credentials',
  basic_login: 'Login com usuário/senha',
};

function ConnectorModal({
  editing,
  submitting,
  onSubmit,
  onClose,
}: {
  editing: ErpConnector | null;
  submitting: boolean;
  onSubmit: (dto: CreateErpConnectorDto | UpdateErpConnectorDto, isEdit: boolean) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<ConnectorDraft>(() => ({
    name: editing?.name ?? '',
    baseUrl: editing?.baseUrl ?? '',
    authType: editing?.authType ?? 'bearer_static',
    bearerToken: '',
    clientId: '',
    clientSecret: '',
    tokenUrl: '',
    scope: '',
    username: '',
    password: '',
    loginUrl: '',
    tokenJsonPath: '',
    timeoutMs: editing ? String(editing.timeoutMs) : '15000',
    headers: editing?.defaultHeaders
      ? Object.entries(editing.defaultHeaders).map(([key, value]) => ({ key, value }))
      : [],
  }));

  function set<K extends keyof ConnectorDraft>(k: K, v: ConnectorDraft[K]) {
    setDraft((prev) => ({ ...prev, [k]: v }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const defaultHeaders =
      draft.headers.length > 0
        ? Object.fromEntries(
            draft.headers.filter((p) => p.key.trim()).map((p) => [p.key.trim(), p.value]),
          )
        : undefined;

    const timeoutMs = parseInt(draft.timeoutMs, 10) || 15000;

    let refreshCredentials: ErpRefreshCredentials | undefined;
    if (draft.authType === 'oauth2_client') {
      refreshCredentials = {
        clientId: draft.clientId || undefined,
        clientSecret: draft.clientSecret || undefined,
        tokenUrl: draft.tokenUrl || undefined,
        scope: draft.scope || undefined,
      };
    } else if (draft.authType === 'basic_login') {
      refreshCredentials = {
        username: draft.username || undefined,
        password: draft.password || undefined,
        loginUrl: draft.loginUrl || undefined,
        tokenJsonPath: draft.tokenJsonPath || undefined,
      };
    }

    if (editing) {
      const dto: UpdateErpConnectorDto = {
        name: draft.name,
        baseUrl: draft.baseUrl,
        authType: draft.authType,
        defaultHeaders,
        timeoutMs,
      };
      if (draft.authType === 'bearer_static' && draft.bearerToken.trim()) {
        dto.bearerToken = draft.bearerToken;
      }
      if (refreshCredentials) {
        const filtered = Object.fromEntries(
          Object.entries(refreshCredentials).filter(([, v]) => v !== undefined && v !== ''),
        ) as ErpRefreshCredentials;
        if (Object.keys(filtered).length > 0) {
          dto.refreshCredentials = filtered;
        }
      }
      onSubmit(dto, true);
    } else {
      onSubmit(
        {
          name: draft.name,
          baseUrl: draft.baseUrl,
          authType: draft.authType,
          bearerToken: draft.authType === 'bearer_static' ? draft.bearerToken : undefined,
          refreshCredentials,
          defaultHeaders,
          timeoutMs,
        },
        false,
      );
    }
  }

  const isOAuth2 = draft.authType === 'oauth2_client';
  const isBasicLogin = draft.authType === 'basic_login';
  const isBearer = draft.authType === 'bearer_static';
  const hasCredentials = editing && editing.refreshCredentials !== null;

  useEscapeKey(onClose);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
    >
      <div className="w-full max-w-lg rounded-[16px] bg-bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-default px-6 py-4">
          <h2 className="text-base font-bold text-tx-primary">
            {editing ? 'Editar conector ERP' : 'Novo conector ERP'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full hover:bg-bg-s2"
          >
            <X className="h-4 w-4 text-tx-secondary" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4 overflow-y-auto p-6" style={{ maxHeight: 'calc(100vh - 200px)' }}>
          <Field label="Nome">
            <input
              className={inputCls}
              required
              value={draft.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Ex: TOTVS Protheus"
            />
          </Field>

          <Field label="URL base" hint="Apenas URLs internas da rede (IPs privados ou hostnames internos).">
            <input
              className={inputCls}
              required
              value={draft.baseUrl}
              onChange={(e) => set('baseUrl', e.target.value)}
              placeholder="http://192.168.1.10:8080"
            />
          </Field>

          <Field label="Tipo de autenticação">
            <select
              className={`${inputCls} cursor-pointer`}
              value={draft.authType}
              onChange={(e) => set('authType', e.target.value as ErpAuthType)}
            >
              {(Object.keys(AUTH_TYPE_LABELS) as ErpAuthType[]).map((t) => (
                <option key={t} value={t}>{AUTH_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </Field>

          {isBearer && (
            <Field
              label={editing ? 'Bearer Token (deixe em branco para não alterar)' : 'Bearer Token'}
              hint={editing ? 'O token atual não é exibido por segurança.' : undefined}
            >
              <input
                className={inputCls}
                type="password"
                autoComplete="new-password"
                value={draft.bearerToken}
                onChange={(e) => set('bearerToken', e.target.value)}
                placeholder="•••••••••"
                required={!editing}
              />
            </Field>
          )}

          {isOAuth2 && (
            <div className="grid gap-4">
              <div className="rounded-[8px] border border-border-default bg-bg-s2 px-3 py-2">
                <p className="text-[11px] text-tx-secondary">
                  <span className="font-bold">Segurança:</span> client_secret é encriptado antes de salvar e nunca é exibido novamente.
                  {hasCredentials && ' Deixe os campos em branco para manter as credenciais atuais.'}
                </p>
              </div>
              <Field label="Client ID">
                <input
                  className={inputCls}
                  value={draft.clientId}
                  onChange={(e) => set('clientId', e.target.value)}
                  placeholder={hasCredentials ? '(mantém atual)' : 'client-id'}
                  required={!editing}
                />
              </Field>
              <Field label="Client Secret">
                <input
                  className={inputCls}
                  type="password"
                  autoComplete="new-password"
                  value={draft.clientSecret}
                  onChange={(e) => set('clientSecret', e.target.value)}
                  placeholder="•••••••••"
                  required={!editing}
                />
              </Field>
              <Field label="Token URL" hint="Ex: https://auth.erp.interno/oauth/token">
                <input
                  className={inputCls}
                  value={draft.tokenUrl}
                  onChange={(e) => set('tokenUrl', e.target.value)}
                  placeholder={hasCredentials ? '(mantém atual)' : 'https://...'}
                  required={!editing}
                />
              </Field>
              <Field label="Scope (opcional)">
                <input
                  className={inputCls}
                  value={draft.scope}
                  onChange={(e) => set('scope', e.target.value)}
                  placeholder="api:read api:write"
                />
              </Field>
            </div>
          )}

          {isBasicLogin && (
            <div className="grid gap-4">
              <div className="rounded-[8px] border border-border-default bg-bg-s2 px-3 py-2">
                <p className="text-[11px] text-tx-secondary">
                  <span className="font-bold">Segurança:</span> senha é encriptada antes de salvar e nunca é exibida novamente.
                  {hasCredentials && ' Deixe os campos em branco para manter as credenciais atuais.'}
                </p>
              </div>
              <Field label="Usuário">
                <input
                  className={inputCls}
                  value={draft.username}
                  onChange={(e) => set('username', e.target.value)}
                  placeholder={hasCredentials ? '(mantém atual)' : 'usuario@erp.interno'}
                  required={!editing}
                />
              </Field>
              <Field label="Senha">
                <input
                  className={inputCls}
                  type="password"
                  autoComplete="new-password"
                  value={draft.password}
                  onChange={(e) => set('password', e.target.value)}
                  placeholder="•••••••••"
                  required={!editing}
                />
              </Field>
              <Field label="URL de login" hint="Endpoint que retorna o token após autenticação.">
                <input
                  className={inputCls}
                  value={draft.loginUrl}
                  onChange={(e) => set('loginUrl', e.target.value)}
                  placeholder={hasCredentials ? '(mantém atual)' : 'http://192.168.1.10/api/login'}
                  required={!editing}
                />
              </Field>
              <Field
                label="Caminho do token na resposta"
                hint="Notação de ponto. Ex: data.accessToken ou token"
              >
                <input
                  className={inputCls}
                  value={draft.tokenJsonPath}
                  onChange={(e) => set('tokenJsonPath', e.target.value)}
                  placeholder="token"
                />
              </Field>
            </div>
          )}

          <Field label="Timeout (ms)" hint="Entre 1000 e 60000 ms.">
            <input
              className={inputCls}
              type="number"
              min={1000}
              max={60000}
              value={draft.timeoutMs}
              onChange={(e) => set('timeoutMs', e.target.value)}
              placeholder="15000"
            />
          </Field>

          <Field label="Headers adicionais (opcional)">
            <KvEditor pairs={draft.headers} onChange={(p) => set('headers', p)} />
          </Field>

          <div className="flex justify-end gap-3 border-t border-border-default pt-4">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-[8px] border border-border-strong px-4 text-sm font-bold text-tx-secondary hover:border-primary hover:text-primary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-primary px-4 text-sm font-bold text-white disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? 'Salvar' : 'Criar conector'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Template modal ───────────────────────────────────────────────────────────

type TemplateDraft = {
  name: string;
  description: string;
  method: string;
  endpointPath: string;
  bodyTemplate: string;
  saveResponseField: string;
  successStatusCodes: number[];
};

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

function TemplateModal({
  editing,
  submitting,
  onSubmit,
  onClose,
}: {
  editing: ErpTemplate | null;
  submitting: boolean;
  onSubmit: (dto: CreateErpTemplateDto | UpdateErpTemplateDto) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<TemplateDraft>(() => ({
    name: editing?.name ?? '',
    description: editing?.description ?? '',
    method: editing?.method ?? 'POST',
    endpointPath: editing?.endpointPath ?? '',
    bodyTemplate: editing?.bodyTemplate ?? '',
    saveResponseField: editing?.saveResponseField ?? '',
    successStatusCodes: editing?.successStatusCodes ?? [200, 201],
  }));

  function set<K extends keyof TemplateDraft>(k: K, v: TemplateDraft[K]) {
    setDraft((prev) => ({ ...prev, [k]: v }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      name: draft.name,
      description: draft.description || undefined,
      method: draft.method,
      endpointPath: draft.endpointPath,
      bodyTemplate: draft.bodyTemplate || undefined,
      saveResponseField: draft.saveResponseField || undefined,
      successStatusCodes: draft.successStatusCodes,
    });
  }

  useEscapeKey(onClose);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
    >
      <div className="w-full max-w-xl rounded-[16px] bg-bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-default px-6 py-4">
          <h2 className="text-base font-bold text-tx-primary">
            {editing ? 'Editar operação' : 'Nova operação'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full hover:bg-bg-s2"
          >
            <X className="h-4 w-4 text-tx-secondary" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4 overflow-y-auto p-6" style={{ maxHeight: 'calc(100vh - 200px)' }}>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Field label="Nome">
                <input
                  className={inputCls}
                  required
                  value={draft.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="Ex: Criar pedido de compra"
                />
              </Field>
            </div>

            <div className="col-span-2">
              <Field label="Descrição (opcional)">
                <input
                  className={inputCls}
                  value={draft.description}
                  onChange={(e) => set('description', e.target.value)}
                  placeholder="Descrição da operação"
                />
              </Field>
            </div>

            <Field label="Método HTTP">
              <select
                className={`${inputCls} cursor-pointer`}
                value={draft.method}
                onChange={(e) => set('method', e.target.value)}
              >
                {HTTP_METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </Field>

            <Field label="Caminho do endpoint">
              <input
                className={inputCls}
                required
                value={draft.endpointPath}
                onChange={(e) => set('endpointPath', e.target.value)}
                placeholder="/api/pedidos-compra"
              />
            </Field>
          </div>

          <Field
            label="Template do body (JSON)"
            hint="Variáveis disponíveis: {{solicitation_title}}, {{solicitation_requester_name}}, {{solicitation_number}}, {{solicitation_status}}, {{valor_total}}, {{fornecedor}}, {{campo_do_formulario}}."
          >
            <textarea
              className={textareaCls}
              rows={5}
              value={draft.bodyTemplate}
              onChange={(e) => set('bodyTemplate', e.target.value)}
              placeholder={'{\n  "titulo": "{{solicitation_title}}",\n  "solicitante": "{{solicitation_requester_name}}"\n}'}
            />
          </Field>

          <Field
            label="Salvar campo da resposta como"
            hint="Ex: id → salva o campo 'id' da resposta em solicitation.externalRefs.erp.id."
          >
            <input
              className={inputCls}
              value={draft.saveResponseField}
              onChange={(e) => set('saveResponseField', e.target.value)}
              placeholder="Ex: numeroPedido"
            />
          </Field>

          <Field label="Status codes de sucesso">
            <StatusCodesEditor
              codes={draft.successStatusCodes}
              onChange={(c) => set('successStatusCodes', c)}
            />
          </Field>

          <div className="flex justify-end gap-3 border-t border-border-default pt-4">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-[8px] border border-border-strong px-4 text-sm font-bold text-tx-secondary hover:border-primary hover:text-primary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-primary px-4 text-sm font-bold text-white disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? 'Salvar' : 'Criar operação'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Confirm modal ────────────────────────────────────────────────────────────

function ConfirmModal({
  message,
  confirmLabel = 'Confirmar',
  submitting,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel?: string;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEscapeKey(onCancel);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
    >
      <div className="w-full max-w-sm rounded-[16px] bg-bg-surface p-6 shadow-2xl">
        <p className="text-sm font-medium text-tx-primary">{message}</p>
        <div className="mt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-[8px] border border-border-strong px-4 text-sm font-bold text-tx-secondary hover:border-primary"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-[#ef4444] px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Health badge helper ──────────────────────────────────────────────────────

function HealthBadge({ health }: { health: ErpHealthResult }) {
  const checkedAt = new Date(health.checkedAt);
  const minutesAgo = Math.round((Date.now() - checkedAt.getTime()) / 60000);
  const tooltip = `Verificado há ${minutesAgo} min — ${health.responseTimeMs}ms`;

  if (!health.reachable) {
    return (
      <span
        title={tooltip}
        className="flex items-center gap-1 rounded-full bg-[#fef2f2] px-2 py-0.5 text-[11px] font-bold text-[#dc2626]"
      >
        <WifiOff className="h-3 w-3" /> Inacessível
      </span>
    );
  }
  if (health.authValid === false) {
    return (
      <span
        title={tooltip}
        className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
      >
        <ShieldAlert className="h-3 w-3" /> Token inválido
      </span>
    );
  }
  return (
    <span
      title={tooltip}
      className="flex items-center gap-1 rounded-full bg-[#f0fdf4] px-2 py-0.5 text-[11px] font-bold text-[#16a34a]"
    >
      <CheckCircle className="h-3 w-3" /> Online
    </span>
  );
}

// ─── Connector card ───────────────────────────────────────────────────────────

function ConnectorCard({
  connector,
  selected,
  testResult,
  isTesting,
  healthResult,
  isCheckingHealth,
  isDeleting,
  onSelect,
  onTest,
  onEdit,
  onDeactivate,
  onDelete,
  onCheckHealth,
}: {
  connector: ErpConnector;
  selected: boolean;
  testResult: TestConnectionResult | null;
  isTesting: boolean;
  healthResult: ErpHealthResult | null;
  isCheckingHealth: boolean;
  isDeleting: boolean;
  onSelect: () => void;
  onTest: () => void;
  onEdit: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
  onCheckHealth: () => void;
}) {
  const hostname = (() => {
    try {
      return new URL(connector.baseUrl).hostname;
    } catch {
      return connector.baseUrl;
    }
  })();

  const activeHealth = healthResult ?? connector.lastHealthCheck;

  return (
    <div
      onClick={onSelect}
      className={[
        'cursor-pointer rounded-[12px] border p-4 transition-all duration-300 hover:border-primary/40',
        selected ? 'border-primary bg-bg-s3' : 'border-border-default bg-bg-surface hover:bg-bg-s2',
        isDeleting ? 'pointer-events-none opacity-0' : 'opacity-100',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#1e3a5f22]">
          <Database className="h-5 w-5 text-[#1E3A5F]" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-tx-primary">{connector.name}</p>
          <p className="truncate text-[12px] text-tx-secondary">{hostname}</p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={[
                'rounded-full px-2 py-0.5 text-[11px] font-bold',
                connector.isActive ? 'bg-[#f0fdf4] text-[#16a34a]' : 'bg-bg-s2 text-tx-secondary',
              ].join(' ')}
            >
              {connector.isActive ? 'Ativo' : 'Inativo'}
            </span>

            {activeHealth && <HealthBadge health={activeHealth} />}

            {testResult && !activeHealth && (
              <span
                className={[
                  'flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold',
                  !testResult.reachable
                    ? 'bg-[#fef2f2] text-[#dc2626]'
                    : testResult.authValid === false
                      ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                      : 'bg-[#f0fdf4] text-[#16a34a]',
                ].join(' ')}
              >
                {!testResult.reachable ? (
                  <WifiOff className="h-3 w-3" />
                ) : testResult.authValid === false ? (
                  <ShieldAlert className="h-3 w-3" />
                ) : (
                  <CheckCircle className="h-3 w-3" />
                )}
                {!testResult.reachable
                  ? 'Offline'
                  : testResult.authValid === false
                    ? 'Token inválido'
                    : 'Online'}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={onCheckHealth}
          disabled={isCheckingHealth}
          className="inline-flex h-7 items-center gap-1.5 rounded-[6px] border border-border-strong bg-bg-surface px-2.5 text-[12px] font-bold text-tx-secondary hover:border-primary hover:text-primary disabled:opacity-50"
        >
          {isCheckingHealth ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5" />
          )}
          {isCheckingHealth ? 'Verificando...' : 'Verificar agora'}
        </button>

        <button
          type="button"
          onClick={onTest}
          disabled={isTesting}
          className="inline-flex h-7 items-center gap-1.5 rounded-[6px] border border-border-strong bg-bg-surface px-2.5 text-[12px] font-bold text-tx-secondary hover:border-primary hover:text-primary disabled:opacity-50"
        >
          {isTesting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {isTesting ? 'Testando...' : 'Testar'}
        </button>

        <button
          type="button"
          onClick={onEdit}
          className="inline-flex h-7 items-center gap-1.5 rounded-[6px] border border-border-strong bg-bg-surface px-2.5 text-[12px] font-bold text-tx-secondary hover:border-primary hover:text-primary"
        >
          <Edit2 className="h-3.5 w-3.5" />
          Editar
        </button>

        {connector.isActive && (
          <button
            type="button"
            onClick={onDeactivate}
            className="inline-flex h-7 items-center gap-1.5 rounded-[6px] border border-[#fee2e2] bg-bg-surface px-2.5 text-[12px] font-bold text-[#ef4444] hover:bg-[#fef2f2]"
          >
            Desativar
          </button>
        )}

        <button
          type="button"
          onClick={onDelete}
          className="inline-flex h-7 items-center gap-1.5 rounded-[6px] border border-[#fee2e2] bg-bg-surface px-2.5 text-[12px] font-bold text-[#ef4444] hover:bg-[#fef2f2]"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Excluir
        </button>
      </div>
    </div>
  );
}

// ─── Logs table ───────────────────────────────────────────────────────────────

function LogRow({
  log,
  onRetry,
  retrying,
}: {
  log: ErpLog;
  onRetry: (id: string) => void;
  retrying: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const date = new Date(log.createdAt);
  const dateStr = `${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

  return (
    <>
      <tr className="border-b border-border-subtle hover:bg-bg-s2">
        <td className="px-4 py-3 text-[13px] text-tx-secondary">
          {log.templateId ? (
            <span className="truncate font-medium text-tx-primary">{log.templateId.slice(-8)}</span>
          ) : (
            <span className="text-tx-muted">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-[13px] text-tx-secondary">
          {log.solicitationId ? (
            <span title={log.solicitationId}>{log.solicitationId.slice(-8)}</span>
          ) : (
            <span className="text-tx-muted">—</span>
          )}
        </td>
        <td className="px-4 py-3">
          <StatusBadge status={log.status} />
        </td>
        <td className="px-4 py-3 text-center text-[13px] text-tx-secondary">{log.attemptCount}</td>
        <td className="px-4 py-3 text-[13px] text-tx-secondary">{dateStr}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {log.status === 'failed' && (
              <button
                type="button"
                onClick={() => onRetry(log.id)}
                disabled={retrying}
                className="inline-flex h-7 items-center gap-1 rounded-[6px] border border-border-strong bg-bg-surface px-2 text-[12px] font-bold text-tx-secondary hover:border-primary hover:text-primary disabled:opacity-50"
              >
                {retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Retentar
              </button>
            )}
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="grid h-7 w-7 place-items-center rounded-[6px] border border-border-default text-tx-muted hover:border-primary hover:text-primary"
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>
        </td>
      </tr>

      {expanded && (
        <tr className="border-b border-border-subtle bg-bg-s2">
          <td colSpan={6} className="px-4 py-3">
            <div className="grid gap-2">
              <div>
                <p className={hintCls}>URL da requisição</p>
                <p className="text-[13px] font-medium text-tx-primary break-all">{log.requestUrl}</p>
              </div>
              {log.responseBody && (
                <div>
                  <p className={hintCls}>Resposta</p>
                  <pre className="rounded-[8px] bg-bg-surface p-2 text-[12px] text-tx-secondary whitespace-pre-wrap break-all border border-border-default max-h-40 overflow-y-auto">
                    {log.responseBody}
                  </pre>
                </div>
              )}
              {log.errorMessage && (
                <div>
                  <p className={hintCls}>Erro</p>
                  <p className="text-[13px] font-medium text-[#ef4444]">{log.errorMessage}</p>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function AdminErpView() {
  const {
    connectors,
    loading: loadingConnectors,
    create: createConnector,
    update: updateConnector,
    deactivate: deactivateConnector,
    delete: deleteConnector,
    test: testConnector,
    checkHealth,
    creating,
    updating,
    deactivating,
    deleting,
    deletingId,
    checkingHealth,
    checkingHealthId,
  } = useErpConnectors();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isConnectorModalOpen, setIsConnectorModalOpen] = useState(false);
  const [editingConnector, setEditingConnector] = useState<ErpConnector | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<ErpConnector | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ErpConnector | null>(null);
  const [deleteConflict, setDeleteConflict] = useState<ErpConnector | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestConnectionResult>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [healthResults, setHealthResults] = useState<Record<string, ErpHealthResult>>({});
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ErpTemplate | null>(null);

  const [logsStatusFilter, setLogsStatusFilter] = useState('');
  const [logsPage, setLogsPage] = useState(1);

  const { templates, loading: loadingTemplates, create: createTemplate, update: updateTemplate, creating: creatingTemplate, updating: updatingTemplate } = useErpTemplates(selectedId);
  const { logsPage: logsData, loading: loadingLogs, retry: retryLog, retrying: retryingLog, retryingId } = useErpLogs({
    page: logsPage,
    limit: 10,
    status: logsStatusFilter || undefined,
    connectorId: selectedId ?? undefined,
  });

  async function handleTest(connector: ErpConnector) {
    setTestingId(connector.id);
    try {
      const result = await testConnector(connector.id);
      setTestResults((prev) => ({ ...prev, [connector.id]: result }));
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [connector.id]: { reachable: false, authValid: null, durationMs: 0 },
      }));
    } finally {
      setTestingId(null);
    }
  }

  async function handleCheckHealth(connector: ErpConnector) {
    try {
      const result = await checkHealth(connector.id);
      setHealthResults((prev) => ({ ...prev, [connector.id]: result }));
    } catch {
      // result updated via onSuccess invalidation; silently ignore network errors
    }
  }

  async function handleConnectorSubmit(
    dto: CreateErpConnectorDto | UpdateErpConnectorDto,
    isEdit: boolean,
  ) {
    if (isEdit && editingConnector) {
      const connId = editingConnector.id;
      await updateConnector({ id: connId, dto: dto as UpdateErpConnectorDto });
      setIsConnectorModalOpen(false);
      setEditingConnector(null);
      setStatusMsg('Conector atualizado. Verificando conexão...');
      setTimeout(() => {
        checkHealth(connId)
          .then((result) => {
            setHealthResults((prev) => ({ ...prev, [connId]: result }));
            setStatusMsg(null);
          })
          .catch(() => setStatusMsg(null));
      }, 1000);
    } else {
      await createConnector(dto as CreateErpConnectorDto);
      setIsConnectorModalOpen(false);
      setEditingConnector(null);
    }
  }

  async function handleDeactivateConfirm() {
    if (!confirmDeactivate) return;
    await deactivateConnector(confirmDeactivate.id);
    if (selectedId === confirmDeactivate.id) setSelectedId(null);
    setConfirmDeactivate(null);
  }

  async function handleDeleteConfirm() {
    if (!confirmDelete) return;
    try {
      await deleteConnector({ id: confirmDelete.id });
      if (selectedId === confirmDelete.id) setSelectedId(null);
      setConfirmDelete(null);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        setDeleteConflict(confirmDelete);
      }
      setConfirmDelete(null);
    }
  }

  async function handleForceDeleteConfirm() {
    if (!deleteConflict) return;
    await deleteConnector({ id: deleteConflict.id, force: true });
    if (selectedId === deleteConflict.id) setSelectedId(null);
    setDeleteConflict(null);
  }

  async function handleTemplateSubmit(dto: CreateErpTemplateDto | UpdateErpTemplateDto) {
    if (editingTemplate) {
      await updateTemplate({ id: editingTemplate.id, dto: dto as UpdateErpTemplateDto });
    } else {
      await createTemplate(dto as CreateErpTemplateDto);
    }
    setIsTemplateModalOpen(false);
    setEditingTemplate(null);
  }

  const selectedConnector = connectors.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_1fr]">
        {/* ── Left: connector list ── */}
        <div className="grid gap-3 content-start">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-tx-primary">Conectores</h2>
            <button
              type="button"
              onClick={() => { setEditingConnector(null); setIsConnectorModalOpen(true); }}
              className="inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-primary px-3 text-[12px] font-bold text-white hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              Novo conector
            </button>
          </div>

          {statusMsg && (
            <div className="flex items-center gap-2 rounded-[8px] bg-[#eff6ff] px-3 py-2 text-[12px] font-medium text-[#2563eb]">
              <Loader2 className="h-3 w-3 animate-spin" />
              {statusMsg}
            </div>
          )}

          {loadingConnectors ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : connectors.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[12px] border border-dashed border-border-default py-10 text-center">
              <Database className="mb-2 h-8 w-8 text-tx-ph" />
              <p className="text-sm font-bold text-tx-secondary">Nenhum conector configurado</p>
              <p className={`mt-1 ${hintCls}`}>Clique em "Novo conector" para começar.</p>
            </div>
          ) : (
            connectors.map((c) => (
              <ConnectorCard
                key={c.id}
                connector={c}
                selected={c.id === selectedId}
                testResult={testResults[c.id] ?? null}
                isTesting={testingId === c.id}
                healthResult={healthResults[c.id] ?? null}
                isCheckingHealth={checkingHealth && checkingHealthId === c.id}
                isDeleting={deleting && deletingId === c.id}
                onSelect={() => setSelectedId(c.id === selectedId ? null : c.id)}
                onTest={() => handleTest(c)}
                onEdit={() => { setEditingConnector(c); setIsConnectorModalOpen(true); }}
                onDeactivate={() => setConfirmDeactivate(c)}
                onDelete={() => setConfirmDelete(c)}
                onCheckHealth={() => handleCheckHealth(c)}
              />
            ))
          )}
        </div>

        {/* ── Right: templates + logs ── */}
        <div className="grid gap-6 content-start">
          {!selectedConnector ? (
            <div className="flex flex-col items-center justify-center rounded-[12px] border border-dashed border-border-default py-16 text-center">
              <Database className="mb-2 h-10 w-10 text-tx-ph" />
              <p className="text-sm font-bold text-tx-secondary">Selecione um conector</p>
              <p className={`mt-1 ${hintCls}`}>Escolha um conector à esquerda para ver suas operações e logs.</p>
            </div>
          ) : (
            <>
              {/* Templates */}
              <div className="rounded-[16px] border border-border-default bg-bg-surface">
                <div className="flex items-center justify-between border-b border-border-default px-5 py-4">
                  <div>
                    <h3 className="text-sm font-bold text-tx-primary">
                      Operações — {selectedConnector.name}
                    </h3>
                    <p className={hintCls}>Templates de requisição HTTP para este conector.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setEditingTemplate(null); setIsTemplateModalOpen(true); }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-primary px-3 text-[12px] font-bold text-white hover:opacity-90"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Nova operação
                  </button>
                </div>

                {loadingTemplates ? (
                  <div className="flex h-20 items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                ) : templates.length === 0 ? (
                  <div className="px-5 py-8 text-center">
                    <p className="text-sm text-tx-muted">Nenhuma operação cadastrada.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-[#f0f4f8]">
                    {templates.map((tpl) => (
                      <div key={tpl.id} className="flex items-center gap-3 px-5 py-3">
                        <MethodBadge method={tpl.method} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-tx-primary">{tpl.name}</p>
                          <p className="truncate text-[12px] text-tx-secondary">{tpl.endpointPath}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => { setEditingTemplate(tpl); setIsTemplateModalOpen(true); }}
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-[6px] border border-border-default text-tx-secondary hover:border-primary hover:text-primary"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Logs */}
              <div className="rounded-[16px] border border-border-default bg-bg-surface">
                <div className="flex items-center justify-between border-b border-border-default px-5 py-4">
                  <div>
                    <h3 className="text-sm font-bold text-tx-primary">Log de execuções</h3>
                    <p className={hintCls}>Histórico de chamadas ERP para este conector.</p>
                  </div>
                  <select
                    className="h-8 rounded-[6px] border border-border-default bg-bg-s2 px-2 text-[12px] font-medium text-tx-secondary outline-none"
                    value={logsStatusFilter}
                    onChange={(e) => { setLogsStatusFilter(e.target.value); setLogsPage(1); }}
                  >
                    <option value="">Todos os status</option>
                    <option value="success">Sucesso</option>
                    <option value="retrying">Retentando</option>
                    <option value="failed">Falha</option>
                    <option value="pending">Pendente</option>
                  </select>
                </div>

                {loadingLogs ? (
                  <div className="flex h-20 items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                ) : !logsData || logsData.data.length === 0 ? (
                  <div className="px-5 py-8 text-center">
                    <p className="text-sm text-tx-muted">Nenhum log encontrado.</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-border-default text-left">
                            <th className="px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-tx-muted">Template</th>
                            <th className="px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-tx-muted">Solicitação</th>
                            <th className="px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-tx-muted">Status</th>
                            <th className="px-4 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-tx-muted">Tent.</th>
                            <th className="px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-tx-muted">Data</th>
                            <th className="px-4 py-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {logsData.data.map((log) => (
                            <LogRow
                              key={log.id}
                              log={log}
                              onRetry={retryLog}
                              retrying={retryingLog && retryingId === log.id}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {logsData.total > 10 && (
                      <div className="flex items-center justify-between border-t border-border-default px-5 py-3">
                        <p className={hintCls}>
                          {logsData.total} log{logsData.total !== 1 ? 's' : ''} no total
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={logsPage <= 1}
                            onClick={() => setLogsPage((p) => p - 1)}
                            className="h-8 rounded-[6px] border border-border-default px-3 text-[12px] font-bold text-tx-secondary disabled:opacity-40 hover:border-primary"
                          >
                            Anterior
                          </button>
                          <button
                            type="button"
                            disabled={logsPage * 10 >= logsData.total}
                            onClick={() => setLogsPage((p) => p + 1)}
                            className="h-8 rounded-[6px] border border-border-default px-3 text-[12px] font-bold text-tx-secondary disabled:opacity-40 hover:border-primary"
                          >
                            Próxima
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      {isConnectorModalOpen && (
        <ConnectorModal
          editing={editingConnector}
          submitting={creating || updating}
          onSubmit={handleConnectorSubmit}
          onClose={() => { setIsConnectorModalOpen(false); setEditingConnector(null); }}
        />
      )}

      {isTemplateModalOpen && (
        <TemplateModal
          editing={editingTemplate}
          submitting={creatingTemplate || updatingTemplate}
          onSubmit={handleTemplateSubmit}
          onClose={() => { setIsTemplateModalOpen(false); setEditingTemplate(null); }}
        />
      )}

      {confirmDeactivate && (
        <ConfirmModal
          message={`Desativar o conector "${confirmDeactivate.name}"? As operações já em fila de retry continuarão processando.`}
          confirmLabel="Desativar"
          submitting={deactivating}
          onConfirm={handleDeactivateConfirm}
          onCancel={() => setConfirmDeactivate(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          message={`Tem certeza que deseja excluir o conector "${confirmDelete.name}"? Esta ação não pode ser desfeita. Todos os templates serão removidos.`}
          confirmLabel="Excluir"
          submitting={deleting}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {deleteConflict && (
        <ConfirmModal
          message={`Este conector tem histórico de execuções. Deseja excluir mesmo assim? Os logs serão perdidos.`}
          confirmLabel="Excluir mesmo assim"
          submitting={deleting}
          onConfirm={handleForceDeleteConfirm}
          onCancel={() => setDeleteConflict(null)}
        />
      )}
    </div>
  );
}
