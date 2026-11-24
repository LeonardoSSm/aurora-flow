import { Cable, CheckCircle2, Plug, RefreshCw, Trash2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useConnectors } from '../hooks/use-connectors';
import {
  type ConnectorRecord,
  type ConnectorType,
  connectorTypeLabel,
} from '../services/connectors-api';

// ─── Config form state types ───────────────────────────────────────────────────

type WebhookDraft = {
  url: string;
  method: 'POST' | 'PUT';
  headersRaw: string;
  bodyTemplate: string;
};

type RestApiDraft = {
  baseUrl: string;
  endpoint: string;
  method: 'POST' | 'PUT' | 'PATCH';
  authType: 'none' | 'bearer' | 'basic';
  token: string;
  username: string;
  password: string;
  fieldMappingRaw: string;
};

const defaultWebhook: WebhookDraft = { url: '', method: 'POST', headersRaw: '', bodyTemplate: '' };
const defaultRestApi: RestApiDraft = {
  baseUrl: '',
  endpoint: '',
  method: 'POST',
  authType: 'none',
  token: '',
  username: '',
  password: '',
  fieldMappingRaw: '',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseKvRaw(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const idx = line.indexOf(':');
    if (idx < 1) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    if (k) result[k] = v;
  }
  return result;
}

function toKvRaw(obj: Record<string, string> | undefined): string {
  if (!obj) return '';
  return Object.entries(obj)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}

function webhookDraftToConfig(d: WebhookDraft): Record<string, unknown> {
  const headers = parseKvRaw(d.headersRaw);
  return {
    url: d.url,
    method: d.method,
    ...(Object.keys(headers).length ? { headers } : {}),
    ...(d.bodyTemplate.trim() ? { bodyTemplate: d.bodyTemplate } : {}),
  };
}

function restApiDraftToConfig(d: RestApiDraft): Record<string, unknown> {
  const fieldMapping = parseKvRaw(d.fieldMappingRaw);
  const config: Record<string, unknown> = {
    baseUrl: d.baseUrl,
    endpoint: d.endpoint,
    method: d.method,
    authType: d.authType,
  };
  if (d.authType === 'bearer' && d.token) config.token = d.token;
  if (d.authType === 'basic') {
    config.username = d.username;
    config.password = d.password;
  }
  if (Object.keys(fieldMapping).length) config.fieldMapping = fieldMapping;
  return config;
}

function configToWebhookDraft(config: Record<string, unknown>): WebhookDraft {
  return {
    url: String(config.url ?? ''),
    method: (config.method as 'POST' | 'PUT') ?? 'POST',
    headersRaw: toKvRaw(config.headers as Record<string, string> | undefined),
    bodyTemplate: String(config.bodyTemplate ?? ''),
  };
}

function configToRestApiDraft(config: Record<string, unknown>): RestApiDraft {
  return {
    baseUrl: String(config.baseUrl ?? ''),
    endpoint: String(config.endpoint ?? ''),
    method: (config.method as 'POST' | 'PUT' | 'PATCH') ?? 'POST',
    authType: (config.authType as 'none' | 'bearer' | 'basic') ?? 'none',
    token: String(config.token ?? ''),
    username: String(config.username ?? ''),
    password: String(config.password ?? ''),
    fieldMappingRaw: toKvRaw(config.fieldMapping as Record<string, string> | undefined),
  };
}

function formatSyncAt(isoDate: string | null): string {
  if (!isoDate) return 'Nunca';
  const diff = Date.now() - new Date(isoDate).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} dia(s)`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-bold text-tx-primary">
      {label}
      {children}
    </label>
  );
}

const inputCls =
  'h-10 w-full rounded-[8px] border border-border-default bg-bg-s2 px-3 text-sm font-medium text-tx-primary outline-none placeholder:text-tx-muted focus:border-primary';
const selectCls = `${inputCls} appearance-none`;
const textareaCls =
  'w-full rounded-[8px] border border-border-default bg-bg-s2 px-3 py-2 text-sm font-medium text-tx-primary outline-none placeholder:text-tx-muted focus:border-primary resize-none';

function WebhookForm({
  draft,
  onChange,
}: {
  draft: WebhookDraft;
  onChange: (d: WebhookDraft) => void;
}) {
  return (
    <div className="grid gap-4">
      <Field label="URL de destino *">
        <input
          value={draft.url}
          onChange={(e) => onChange({ ...draft, url: e.target.value })}
          placeholder="https://meu-sistema.com/webhook"
          className={inputCls}
        />
      </Field>
      <Field label="Método HTTP">
        <select
          value={draft.method}
          onChange={(e) => onChange({ ...draft, method: e.target.value as 'POST' | 'PUT' })}
          className={selectCls}
        >
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
        </select>
      </Field>
      <Field label="Headers (um por linha: Chave: Valor)">
        <textarea
          rows={3}
          value={draft.headersRaw}
          onChange={(e) => onChange({ ...draft, headersRaw: e.target.value })}
          placeholder={'Authorization: Bearer token123\nX-Custom-Header: valor'}
          className={textareaCls}
        />
      </Field>
      <Field label="Template do corpo (opcional — use {{form.name}}, {{submission.id}}, etc.)">
        <textarea
          rows={4}
          value={draft.bodyTemplate}
          onChange={(e) => onChange({ ...draft, bodyTemplate: e.target.value })}
          placeholder={'{"form": "{{form.name}}", "submissao": "{{submission.id}}"}'}
          className={textareaCls}
        />
      </Field>
    </div>
  );
}

function RestApiForm({
  draft,
  onChange,
}: {
  draft: RestApiDraft;
  onChange: (d: RestApiDraft) => void;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="URL base *">
          <input
            value={draft.baseUrl}
            onChange={(e) => onChange({ ...draft, baseUrl: e.target.value })}
            placeholder="https://api.meu-sistema.com"
            className={inputCls}
          />
        </Field>
        <Field label="Endpoint *">
          <input
            value={draft.endpoint}
            onChange={(e) => onChange({ ...draft, endpoint: e.target.value })}
            placeholder="/v1/submissions"
            className={inputCls}
          />
        </Field>
        <Field label="Método">
          <select
            value={draft.method}
            onChange={(e) =>
              onChange({ ...draft, method: e.target.value as RestApiDraft['method'] })
            }
            className={selectCls}
          >
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
          </select>
        </Field>
        <Field label="Autenticação">
          <select
            value={draft.authType}
            onChange={(e) =>
              onChange({ ...draft, authType: e.target.value as RestApiDraft['authType'] })
            }
            className={selectCls}
          >
            <option value="none">Nenhuma</option>
            <option value="bearer">Bearer Token</option>
            <option value="basic">Basic Auth</option>
          </select>
        </Field>
      </div>
      {draft.authType === 'bearer' && (
        <Field label="Token *">
          <input
            type="password"
            value={draft.token}
            onChange={(e) => onChange({ ...draft, token: e.target.value })}
            placeholder="eyJhbGciOi..."
            className={inputCls}
          />
        </Field>
      )}
      {draft.authType === 'basic' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Usuário *">
            <input
              value={draft.username}
              onChange={(e) => onChange({ ...draft, username: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Senha *">
            <input
              type="password"
              value={draft.password}
              onChange={(e) => onChange({ ...draft, password: e.target.value })}
              className={inputCls}
            />
          </Field>
        </div>
      )}
      <Field label="Mapeamento de campos (opcional — fieldCode: chave_api, um por linha)">
        <textarea
          rows={3}
          value={draft.fieldMappingRaw}
          onChange={(e) => onChange({ ...draft, fieldMappingRaw: e.target.value })}
          placeholder={'nome_completo: full_name\nemail_corporativo: email'}
          className={textareaCls}
        />
      </Field>
    </div>
  );
}

// ─── Connector card ───────────────────────────────────────────────────────────

type ConnectorCardProps = {
  connector: ConnectorRecord;
  onEdit: (c: ConnectorRecord) => void;
  onToggle: (c: ConnectorRecord) => void;
  onDelete: (id: string) => void;
  onTest: (id: string) => void;
  testing: boolean;
};

function ConnectorCard({
  connector,
  onEdit,
  onToggle,
  onDelete,
  onTest,
  testing,
}: ConnectorCardProps) {
  const syncOk = connector.lastSyncStatus === 'success';
  const hasError = connector.lastSyncStatus?.startsWith('error');

  return (
    <div className="flex items-start gap-4 rounded-[10px] border border-border-strong bg-bg-surface p-4">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[8px] bg-bg-hover text-primary">
        <Cable className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-tx-primary">{connector.name}</span>
          <span className="rounded-full bg-bg-hover px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
            {connectorTypeLabel[connector.type] ?? connector.type}
          </span>
          {!connector.isActive && (
            <span className="rounded-full bg-bg-s2 px-2 py-0.5 text-[10px] font-bold uppercase text-tx-muted">
              Inativo
            </span>
          )}
        </div>

        <div className="mt-1 flex items-center gap-2 text-xs text-tx-secondary">
          {connector.lastSyncStatus ? (
            <>
              {syncOk ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              ) : hasError ? (
                <XCircle className="h-3.5 w-3.5 text-red-500" />
              ) : null}
              <span>Último sync: {formatSyncAt(connector.lastSyncAt)}</span>
              {hasError && (
                <span className="truncate text-red-500" title={connector.lastSyncStatus}>
                  — {connector.lastSyncStatus?.slice(7, 80)}
                </span>
              )}
            </>
          ) : (
            <span>Nunca executado</span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onTest(connector.id)}
          disabled={testing}
          title="Testar conexão"
          className="grid h-8 w-8 place-items-center rounded-[6px] border border-border-default bg-bg-surface text-tx-secondary hover:bg-bg-hover hover:text-primary disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${testing ? 'animate-spin' : ''}`} />
        </button>
        <button
          type="button"
          onClick={() => onToggle(connector)}
          className="h-8 rounded-[6px] border border-border-default bg-bg-surface px-3 text-xs font-bold text-tx-secondary hover:bg-bg-hover"
        >
          {connector.isActive ? 'Desativar' : 'Ativar'}
        </button>
        <button
          type="button"
          onClick={() => onEdit(connector)}
          className="h-8 rounded-[6px] border border-border-default bg-bg-surface px-3 text-xs font-bold text-tx-secondary hover:bg-bg-hover"
        >
          Editar
        </button>
        <button
          type="button"
          onClick={() => onDelete(connector.id)}
          title="Remover conector"
          className="grid h-8 w-8 place-items-center rounded-[6px] border border-red-100 bg-bg-surface text-red-400 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

type ConnectorModalProps = {
  formId: string;
  editing: ConnectorRecord | null;
  onClose: () => void;
  onCreate: (input: {
    type: ConnectorType;
    name: string;
    config: Record<string, unknown>;
  }) => Promise<unknown>;
  onUpdate: (args: {
    id: string;
    input: { name?: string; config?: Record<string, unknown> };
  }) => Promise<unknown>;
  onTest: (id: string) => Promise<{ success: boolean; message: string }>;
  creating: boolean;
  updating: boolean;
  testing: boolean;
};

function ConnectorModal({
  editing,
  onClose,
  onCreate,
  onUpdate,
  onTest,
  creating,
  updating,
  testing,
}: ConnectorModalProps) {
  const [step, setStep] = useState<'type' | 'config'>(editing ? 'config' : 'type');
  const [selectedType, setSelectedType] = useState<ConnectorType>(editing?.type ?? 'webhook');
  const [connectorName, setConnectorName] = useState(editing?.name ?? '');
  const [webhookDraft, setWebhookDraft] = useState<WebhookDraft>(
    editing?.type === 'webhook' ? configToWebhookDraft(editing.config) : defaultWebhook,
  );
  const [restApiDraft, setRestApiDraft] = useState<RestApiDraft>(
    editing?.type === 'rest_api' ? configToRestApiDraft(editing.config) : defaultRestApi,
  );
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const typeOptions: Array<{ value: ConnectorType; label: string; desc: string }> = [
    {
      value: 'webhook',
      label: 'Webhook',
      desc: 'Envia dados via HTTP POST/PUT para qualquer URL.',
    },
    {
      value: 'rest_api',
      label: 'REST API',
      desc: 'Integração com APIs externas com mapeamento de campos.',
    },
  ];

  function buildConfig(): Record<string, unknown> {
    return selectedType === 'webhook'
      ? webhookDraftToConfig(webhookDraft)
      : restApiDraftToConfig(restApiDraft);
  }

  async function handleTest() {
    setTestResult(null);
    if (editing) {
      const result = await onTest(editing.id);
      setTestResult(result);
    }
  }

  async function handleSave() {
    setSaveError(null);
    const config = buildConfig();
    try {
      if (editing) {
        await onUpdate({ id: editing.id, input: { name: connectorName, config } });
      } else {
        await onCreate({ type: selectedType, name: connectorName, config });
      }
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Erro ao salvar.');
    }
  }

  const isBusy = creating || updating;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-[12px] bg-bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-default px-6 py-4">
          <h2 className="text-base font-bold text-tx-primary">
            {editing ? 'Editar conector' : 'Adicionar conector'}
          </h2>
          <button type="button" onClick={onClose} className="text-tx-secondary hover:text-tx-primary">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 'type' && (
            <div className="grid gap-3">
              <p className="text-sm text-tx-secondary">Selecione o tipo de conector:</p>
              {typeOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setSelectedType(opt.value);
                    setStep('config');
                  }}
                  className="flex items-start gap-3 rounded-[10px] border border-border-strong p-4 text-left hover:border-primary hover:bg-bg-s2"
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] bg-bg-hover text-primary">
                    <Plug className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-tx-primary">{opt.label}</p>
                    <p className="mt-0.5 text-xs text-tx-secondary">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {step === 'config' && (
            <div className="grid gap-5">
              {!editing && (
                <button
                  type="button"
                  onClick={() => setStep('type')}
                  className="self-start text-xs font-bold text-primary"
                >
                  ← Trocar tipo
                </button>
              )}

              <div className="flex items-center gap-3 rounded-[8px] bg-bg-s2 px-4 py-2.5">
                <span className="text-xs font-bold uppercase text-tx-secondary">Tipo:</span>
                <span className="text-sm font-bold text-primary">
                  {connectorTypeLabel[selectedType]}
                </span>
              </div>

              <Field label="Nome do conector *">
                <input
                  value={connectorName}
                  onChange={(e) => setConnectorName(e.target.value)}
                  placeholder="Ex: CRM Principal"
                  className={inputCls}
                />
              </Field>

              {selectedType === 'webhook' && (
                <WebhookForm draft={webhookDraft} onChange={setWebhookDraft} />
              )}
              {selectedType === 'rest_api' && (
                <RestApiForm draft={restApiDraft} onChange={setRestApiDraft} />
              )}

              {editing && (
                <div>
                  <button
                    type="button"
                    onClick={handleTest}
                    disabled={testing}
                    className="h-9 rounded-[8px] border border-border-strong bg-bg-surface px-4 text-sm font-bold text-tx-secondary hover:bg-bg-hover disabled:opacity-60"
                  >
                    {testing ? 'Testando...' : 'Testar conexão'}
                  </button>
                  {testResult && (
                    <div
                      className={`mt-2 flex items-center gap-2 text-sm font-semibold ${testResult.success ? 'text-emerald-600' : 'text-red-600'}`}
                    >
                      {testResult.success ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <XCircle className="h-4 w-4" />
                      )}
                      {testResult.message}
                    </div>
                  )}
                </div>
              )}

              {saveError && <p className="text-sm font-semibold text-red-600">{saveError}</p>}
            </div>
          )}
        </div>

        {step === 'config' && (
          <div className="flex justify-end gap-2 border-t border-border-default px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-[8px] px-4 text-sm font-bold text-tx-secondary hover:bg-bg-hover"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isBusy || !connectorName.trim()}
              className="h-9 rounded-[8px] bg-primary px-4 text-sm font-bold text-white disabled:opacity-60"
            >
              {isBusy ? 'Salvando...' : editing ? 'Salvar alterações' : 'Adicionar conector'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

type ConnectorsViewProps = {
  formId: string | null;
};

export function ConnectorsView({ formId }: ConnectorsViewProps) {
  const {
    connectors,
    loading,
    error,
    create,
    update,
    remove,
    test,
    creating,
    updating,
    deleting,
    testing,
  } = useConnectors(formId);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ConnectorRecord | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testFeedback, setTestFeedback] = useState<{
    id: string;
    success: boolean;
    message: string;
  } | null>(null);

  if (!formId) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-tx-secondary">
        <Cable className="h-10 w-10 opacity-40" />
        <p className="text-sm font-semibold">
          Selecione um formulário salvo para gerenciar os conectores.
        </p>
      </div>
    );
  }

  async function handleTest(id: string) {
    setTestingId(id);
    setTestFeedback(null);
    try {
      const result = await test(id);
      setTestFeedback({ id, ...result });
    } finally {
      setTestingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Remover este conector?')) return;
    await remove(id);
  }

  function openAdd() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(connector: ConnectorRecord) {
    setEditing(connector);
    setModalOpen(true);
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-tx-primary">Conectores de Dados</h3>
          <p className="mt-1 text-xs text-tx-secondary">
            Envie submissões automaticamente para sistemas externos.
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-primary px-4 text-sm font-bold text-white"
        >
          <Plug className="h-4 w-4" />
          Adicionar conector
        </button>
      </div>

      {error && (
        <p className="text-sm font-semibold text-red-600">
          Não foi possível carregar os conectores.
        </p>
      )}

      {loading ? (
        <p className="text-sm text-tx-secondary">Carregando conectores...</p>
      ) : connectors.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[10px] border border-dashed border-border-strong py-12 text-tx-secondary">
          <Cable className="h-10 w-10 opacity-40" />
          <p className="text-sm font-semibold">Nenhum conector configurado.</p>
          <p className="text-xs">Clique em "Adicionar conector" para começar.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {connectors.map((connector) => (
            <div key={connector.id}>
              <ConnectorCard
                connector={connector}
                onEdit={openEdit}
                onToggle={(c) => update({ id: c.id, input: { isActive: !c.isActive } })}
                onDelete={handleDelete}
                onTest={handleTest}
                testing={testingId === connector.id && testing}
              />
              {testFeedback?.id === connector.id && (
                <div
                  className={`mt-1 flex items-center gap-2 px-2 text-xs font-semibold ${testFeedback.success ? 'text-emerald-600' : 'text-red-600'}`}
                >
                  {testFeedback.success ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5" />
                  )}
                  {testFeedback.message}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {deleting && <p className="text-xs text-tx-secondary">Removendo...</p>}

      {modalOpen && (
        <ConnectorModal
          formId={formId}
          editing={editing}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
          onCreate={create}
          onUpdate={update}
          onTest={async (id) => {
            const r = await test(id);
            return r;
          }}
          creating={creating}
          updating={updating}
          testing={testing}
        />
      )}
    </div>
  );
}
