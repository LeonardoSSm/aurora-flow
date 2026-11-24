import axios from 'axios';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Link2,
  MessageCircle,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Button,
  FieldLabel,
  SelectInput,
  TextInput,
  useToast,
} from '../../../components/ui';
import { buildInboundUrl } from '../lib/inbound-url';
import {
  useCreateWebhookEndpointMutation,
  useDeleteWebhookEndpointMutation,
  useInboundWebhookEventsQuery,
  useRetryWebhookDeliveryMutation,
  useWhatsAppMessagesQuery,
  useWhatsAppStatusQuery,
  useWebhookDeliveriesQuery,
  useWebhookEndpointsQuery,
} from '../hooks/use-webhooks';
import type {
  InboundWebhookEvent,
  InboundWebhookEventStatus,
  WhatsAppMessage,
  WhatsAppMessageStatus,
  WebhookDelivery,
  WebhookDeliveryStatus,
  WebhookEndpoint,
} from '../services/webhooks-api';

type ActiveTab = 'endpoints' | 'deliveries' | 'events' | 'whatsapp';

const deliveryStatusLabels: Record<WebhookDeliveryStatus, string> = {
  pending: 'Pendente',
  success: 'Sucesso',
  failed: 'Falhou',
  retrying: 'Retentando',
};

const inboundStatusLabels: Record<InboundWebhookEventStatus, string> = {
  received: 'Recebido',
  processed: 'Processado',
  failed: 'Falhou',
  ignored: 'Ignorado',
};

const whatsappStatusLabels: Record<WhatsAppMessageStatus, string> = {
  sent: 'Enviada',
  failed: 'Falhou',
  queued: 'Na fila',
  pending: 'Pendente',
};

const statusClass: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-200',
  success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  failed: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300',
  retrying: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  sent: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  queued: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  received: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  processed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  ignored: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-500/20 dark:text-zinc-200',
  valid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  invalid: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300',
  unknown: 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-200',
};

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
  }
  return fallback;
}

function formatDate(value: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
}

function maskPhone(value: string): string {
  const phone = value.trim();
  if (!phone) return '-';
  if (phone.length <= 4) return '****';
  if (phone.length <= 7) return `${phone.slice(0, 2)}****${phone.slice(-1)}`;
  return `${phone.slice(0, 5)}****${phone.slice(-2)}`;
}

function previewMessage(value: string): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length > 100 ? `${compact.slice(0, 100)}...` : compact;
}

function StatusBadge({ label, tone }: { label: string; tone: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-[11px] font-bold uppercase ${statusClass[tone] ?? statusClass.unknown}`}
    >
      {label}
    </span>
  );
}

function CreateEndpointModal({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const mutation = useCreateWebhookEndpointMutation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [signingSecret, setSigningSecret] = useState('');
  const [flowTriggerEnabled, setFlowTriggerEnabled] = useState(true);
  const [error, setError] = useState('');

  function handleSubmit() {
    setError('');
    if (!name.trim()) {
      setError('Nome é obrigatório.');
      return;
    }

    mutation.mutate(
      {
        name: name.trim(),
        description: description.trim() || undefined,
        signingSecret: signingSecret.trim() || undefined,
        flowTriggerEnabled,
      },
      {
        onSuccess: () => {
          showToast({ title: 'Endpoint criado', variant: 'success' });
          onClose();
        },
        onError: (apiError) => {
          setError(getApiErrorMessage(apiError, 'Não foi possível criar o endpoint.'));
        },
      },
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <section className="grid max-h-[90vh] w-full max-w-xl gap-4 overflow-y-auto rounded-lg bg-surface-container-lowest p-5 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-tx-primary">Criar endpoint</h2>
            <p className="text-sm text-tx-secondary">
              O segredo não será exibido novamente após a criação.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            className="grid h-8 w-8 place-items-center rounded-lg text-tx-secondary hover:bg-surface-container-high disabled:opacity-50"
            title="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <FieldLabel>
          Nome
          <TextInput
            value={name}
            maxLength={150}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex: ERP financeiro"
          />
        </FieldLabel>

        <FieldLabel>
          Descrição
          <textarea
            value={description}
            rows={3}
            onChange={(event) => setDescription(event.target.value)}
            className="w-full rounded-xl border border-border-default/50 bg-surface-container-low px-3 py-2 text-sm text-tx-primary outline-none ring-primary/30 placeholder:text-tx-secondary focus:ring-2"
          />
        </FieldLabel>

        <FieldLabel>
          Signing secret
          <TextInput
            value={signingSecret}
            type="password"
            maxLength={255}
            onChange={(event) => setSigningSecret(event.target.value)}
            placeholder="Opcional"
          />
        </FieldLabel>

        <label className="flex items-center justify-between gap-3 rounded-lg border border-border-default/50 bg-surface-container-low px-3 py-2">
          <span className="text-sm font-semibold text-tx-primary">Disparar fluxos</span>
          <input
            type="checkbox"
            checked={flowTriggerEnabled}
            onChange={(event) => setFlowTriggerEnabled(event.target.checked)}
            className="h-4 w-4 accent-primary"
          />
        </label>

        {error ? (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="subtle" size="sm" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? 'Criando...' : 'Criar endpoint'}
          </Button>
        </div>
      </section>
    </div>
  );
}

function EndpointsTab() {
  const { showToast } = useToast();
  const endpointsQuery = useWebhookEndpointsQuery();
  const deleteMutation = useDeleteWebhookEndpointMutation();
  const [isModalOpen, setIsModalOpen] = useState(false);

  async function copyUrl(endpoint: WebhookEndpoint, kind: 'event' | 'list' = 'event') {
    try {
      await navigator.clipboard.writeText(buildInboundUrl(endpoint.token, kind));
      showToast({ title: kind === 'list' ? 'URL de lista copiada' : 'URL copiada', variant: 'success' });
    } catch {
      showToast({ title: 'Não foi possível copiar', variant: 'error' });
    }
  }

  function deactivate(endpoint: WebhookEndpoint) {
    deleteMutation.mutate(endpoint.id, {
      onSuccess: () => showToast({ title: 'Endpoint desativado', variant: 'success' }),
      onError: (error) =>
        showToast({
          title: getApiErrorMessage(error, 'Não foi possível desativar o endpoint.'),
          variant: 'error',
        }),
    });
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-tx-primary">Endpoints de entrada</h2>
          <p className="text-sm text-tx-secondary">
            {endpointsQuery.data?.length ?? 0} endpoint(s) cadastrado(s)
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Criar endpoint
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border-default/50 bg-surface-container-lowest">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-outline-variant/40 text-sm">
            <thead className="bg-surface-container-low">
              <tr className="text-left text-xs font-bold uppercase text-tx-secondary">
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Token</th>
                <th className="px-4 py-3">Fluxos</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {endpointsQuery.isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-tx-secondary">
                    Carregando endpoints...
                  </td>
                </tr>
              ) : null}

              {!endpointsQuery.isLoading && (endpointsQuery.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-tx-secondary">
                    Nenhum endpoint cadastrado.
                  </td>
                </tr>
              ) : null}

              {(endpointsQuery.data ?? []).map((endpoint) => (
                <tr key={endpoint.id} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-bold text-tx-primary">{endpoint.name}</p>
                    <p className="mt-1 max-w-sm text-xs text-tx-secondary">
                      {endpoint.description || '-'}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      label={endpoint.isActive ? 'Ativo' : 'Inativo'}
                      tone={endpoint.isActive ? 'success' : 'ignored'}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <code className="rounded-md bg-surface-container-low px-2 py-1 text-xs text-tx-primary">
                      {endpoint.token}
                    </code>
                    {endpoint.signingSecretConfigured ? (
                      <p className="mt-1 text-xs text-tx-secondary">Assinatura ativa</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-tx-secondary">
                    {endpoint.flowTriggerEnabled ? 'Habilitado' : 'Desabilitado'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="subtle"
                        onClick={() => void copyUrl(endpoint)}
                        className="inline-flex items-center gap-2"
                      >
                        <Copy className="h-4 w-4" />
                        Copiar URL
                      </Button>
                      <Button
                        size="sm"
                        variant="subtle"
                        onClick={() => void copyUrl(endpoint, 'list')}
                        className="inline-flex items-center gap-2"
                        title="Para enviar só uma lista (ex.: números de pedido) por arquivo .txt/.csv, texto ou JSON. No gatilho, use Lote = itens."
                      >
                        <Copy className="h-4 w-4" />
                        URL de lista
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!endpoint.isActive || deleteMutation.isPending}
                        onClick={() => deactivate(endpoint)}
                        className="inline-flex items-center gap-2 text-rose-700"
                      >
                        <Trash2 className="h-4 w-4" />
                        Desativar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen ? <CreateEndpointModal onClose={() => setIsModalOpen(false)} /> : null}
    </section>
  );
}

function DeliveriesTab() {
  const { showToast } = useToast();
  const [status, setStatus] = useState<WebhookDeliveryStatus | ''>('');
  const [page, setPage] = useState(1);
  const params = useMemo(() => ({ page, limit: 20, status }), [page, status]);
  const deliveriesQuery = useWebhookDeliveriesQuery(params);
  const retryMutation = useRetryWebhookDeliveryMutation();
  const pageData = deliveriesQuery.data;

  function retry(delivery: WebhookDelivery) {
    retryMutation.mutate(delivery.id, {
      onSuccess: () => showToast({ title: 'Reenvio solicitado', variant: 'success' }),
      onError: (error) =>
        showToast({
          title: getApiErrorMessage(error, 'Não foi possível reenviar o webhook.'),
          variant: 'error',
        }),
    });
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-tx-primary">Histórico de envios</h2>
          <p className="text-sm text-tx-secondary">{pageData?.total ?? 0} entrega(s)</p>
        </div>
        <FieldLabel className="w-full max-w-xs">
          Status
          <SelectInput
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value as WebhookDeliveryStatus | '');
            }}
          >
            <option value="">Todos</option>
            {Object.entries(deliveryStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectInput>
        </FieldLabel>
      </div>

      <div className="overflow-hidden rounded-lg border border-border-default/50 bg-surface-container-lowest">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-outline-variant/40 text-sm">
            <thead className="bg-surface-container-low">
              <tr className="text-left text-xs font-bold uppercase text-tx-secondary">
                <th className="px-4 py-3">URL destino</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">HTTP</th>
                <th className="px-4 py-3">Tentativas</th>
                <th className="px-4 py-3">Criado em</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {deliveriesQuery.isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-tx-secondary">
                    Carregando histórico...
                  </td>
                </tr>
              ) : null}

              {!deliveriesQuery.isLoading && (pageData?.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-tx-secondary">
                    Nenhuma entrega encontrada.
                  </td>
                </tr>
              ) : null}

              {(pageData?.data ?? []).map((delivery) => (
                <tr key={delivery.id}>
                  <td className="max-w-[420px] px-4 py-3">
                    <p className="truncate font-semibold text-tx-primary" title={delivery.url}>
                      {delivery.url}
                    </p>
                    {delivery.errorMessage ? (
                      <p
                        className="mt-1 truncate text-xs text-rose-700"
                        title={delivery.errorMessage}
                      >
                        {delivery.errorMessage}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      label={deliveryStatusLabels[delivery.status]}
                      tone={delivery.status}
                    />
                  </td>
                  <td className="px-4 py-3 text-tx-secondary">
                    {delivery.responseStatus ?? '-'}
                  </td>
                  <td className="px-4 py-3 text-tx-secondary">
                    {delivery.attemptCount}/{delivery.maxAttempts}
                  </td>
                  <td className="px-4 py-3 text-tx-secondary">
                    {formatDate(delivery.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="subtle"
                        disabled={
                          retryMutation.isPending ||
                          !['failed', 'retrying'].includes(delivery.status)
                        }
                        onClick={() => retry(delivery)}
                        className="inline-flex items-center gap-2"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Reenviar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination page={page} totalPages={pageData?.totalPages ?? 1} onPageChange={setPage} />
    </section>
  );
}

function EventsTab() {
  const [status, setStatus] = useState<InboundWebhookEventStatus | ''>('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const params = useMemo(() => ({ page, limit: 20, status }), [page, status]);
  const eventsQuery = useInboundWebhookEventsQuery(params);
  const pageData = eventsQuery.data;

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-tx-primary">Eventos recebidos</h2>
          <p className="text-sm text-tx-secondary">{pageData?.total ?? 0} evento(s)</p>
        </div>
        <FieldLabel className="w-full max-w-xs">
          Status
          <SelectInput
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value as InboundWebhookEventStatus | '');
            }}
          >
            <option value="">Todos</option>
            {Object.entries(inboundStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectInput>
        </FieldLabel>
      </div>

      <div className="overflow-hidden rounded-lg border border-border-default/50 bg-surface-container-lowest">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-outline-variant/40 text-sm">
            <thead className="bg-surface-container-low">
              <tr className="text-left text-xs font-bold uppercase text-tx-secondary">
                <th className="px-4 py-3">Endpoint token</th>
                <th className="px-4 py-3">Assinatura</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Criado em</th>
                <th className="px-4 py-3 text-right">Payload</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {eventsQuery.isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-tx-secondary">
                    Carregando eventos...
                  </td>
                </tr>
              ) : null}

              {!eventsQuery.isLoading && (pageData?.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-tx-secondary">
                    Nenhum evento encontrado.
                  </td>
                </tr>
              ) : null}

              {(pageData?.data ?? []).map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  expanded={expandedId === event.id}
                  onToggle={() =>
                    setExpandedId((current) => (current === event.id ? null : event.id))
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination page={page} totalPages={pageData?.totalPages ?? 1} onPageChange={setPage} />
    </section>
  );
}

function WhatsAppTab() {
  const [status, setStatus] = useState<WhatsAppMessageStatus | ''>('');
  const [page, setPage] = useState(1);
  const params = useMemo(() => ({ page, limit: 20, status }), [page, status]);
  const statusQuery = useWhatsAppStatusQuery();
  const messagesQuery = useWhatsAppMessagesQuery(params);
  const pageData = messagesQuery.data;
  const providerStatus = statusQuery.data;

  return (
    <section className="grid gap-4">
      <div className="grid gap-3 rounded-lg border border-border-default/50 bg-surface-container-lowest p-4 md:grid-cols-[1fr_auto] md:items-start">
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <MessageCircle className="h-5 w-5 text-green-700" />
            <h2 className="text-base font-extrabold text-tx-primary">WhatsApp</h2>
            <StatusBadge
              label={
                statusQuery.isLoading
                  ? 'Carregando'
                  : providerStatus?.isAvailable
                    ? 'Disponível'
                    : 'Mock'
              }
              tone={providerStatus?.isAvailable ? 'success' : 'pending'}
            />
          </div>

          {providerStatus && !providerStatus.isAvailable ? (
            <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
              Provider em modo simulação (mock). Configure as variáveis de ambiente para envio real.
            </p>
          ) : null}
        </div>

        <div className="grid gap-2 sm:grid-cols-3 md:min-w-[420px]">
          <div className="rounded-lg bg-surface-container-low px-3 py-2">
            <span className="text-xs font-bold uppercase text-tx-secondary">Provider</span>
            <p className="mt-1 text-sm font-extrabold text-tx-primary">
              {providerStatus?.provider ?? (statusQuery.isLoading ? 'Carregando...' : '-')}
            </p>
          </div>
          <div className="rounded-lg bg-surface-container-low px-3 py-2">
            <span className="text-xs font-bold uppercase text-tx-secondary">Enviadas</span>
            <p className="mt-1 text-sm font-extrabold text-green-700">
              {providerStatus?.totalSent ?? 0}
            </p>
          </div>
          <div className="rounded-lg bg-surface-container-low px-3 py-2">
            <span className="text-xs font-bold uppercase text-tx-secondary">Falhas</span>
            <p className="mt-1 text-sm font-extrabold text-rose-700">
              {providerStatus?.totalFailed ?? 0}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-tx-primary">Mensagens recentes</h2>
          <p className="text-sm text-tx-secondary">{pageData?.total ?? 0} mensagem(ns)</p>
        </div>
        <FieldLabel className="w-full max-w-xs">
          Status
          <SelectInput
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value as WhatsAppMessageStatus | '');
            }}
          >
            <option value="">Todos</option>
            {Object.entries(whatsappStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectInput>
        </FieldLabel>
      </div>

      <div className="overflow-hidden rounded-lg border border-border-default/50 bg-surface-container-lowest">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-outline-variant/40 text-sm">
            <thead className="bg-surface-container-low">
              <tr className="text-left text-xs font-bold uppercase text-tx-secondary">
                <th className="px-4 py-3">Destino</th>
                <th className="px-4 py-3">Mensagem</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Criada em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {messagesQuery.isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-tx-secondary">
                    Carregando mensagens...
                  </td>
                </tr>
              ) : null}

              {!messagesQuery.isLoading && (pageData?.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-tx-secondary">
                    Nenhuma mensagem encontrada.
                  </td>
                </tr>
              ) : null}

              {(pageData?.data ?? []).map((message) => (
                <WhatsAppMessageRow key={message.id} message={message} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination page={page} totalPages={pageData?.totalPages ?? 1} onPageChange={setPage} />
    </section>
  );
}

function WhatsAppMessageRow({ message }: { message: WhatsAppMessage }) {
  return (
    <tr>
      <td className="px-4 py-3 font-semibold text-tx-primary">{maskPhone(message.to)}</td>
      <td className="max-w-[460px] px-4 py-3">
        <p className="truncate text-tx-secondary" title={previewMessage(message.message)}>
          {previewMessage(message.message)}
        </p>
        {message.errorMessage ? (
          <p className="mt-1 truncate text-xs font-semibold text-rose-700">
            {message.errorMessage}
          </p>
        ) : null}
      </td>
      <td className="px-4 py-3">
        <StatusBadge label={whatsappStatusLabels[message.status]} tone={message.status} />
      </td>
      <td className="px-4 py-3 text-tx-secondary">{message.provider}</td>
      <td className="px-4 py-3 text-tx-secondary">{formatDate(message.createdAt)}</td>
    </tr>
  );
}

function EventRow({
  event,
  expanded,
  onToggle,
}: {
  event: InboundWebhookEvent;
  expanded: boolean;
  onToggle: () => void;
}) {
  const signatureTone =
    event.signatureValid === true
      ? 'valid'
      : event.signatureValid === false
        ? 'invalid'
        : 'unknown';
  const signatureLabel =
    event.signatureValid === true
      ? 'Válida'
      : event.signatureValid === false
        ? 'Inválida'
        : 'Sem assinatura';

  return (
    <>
      <tr>
        <td className="px-4 py-3">
          <code className="rounded-md bg-surface-container-low px-2 py-1 text-xs text-tx-primary">
            {event.endpointToken}
          </code>
        </td>
        <td className="px-4 py-3">
          <StatusBadge label={signatureLabel} tone={signatureTone} />
        </td>
        <td className="px-4 py-3">
          <StatusBadge label={inboundStatusLabels[event.status]} tone={event.status} />
        </td>
        <td className="px-4 py-3 text-tx-secondary">{formatDate(event.createdAt)}</td>
        <td className="px-4 py-3">
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="subtle"
              onClick={onToggle}
              className="inline-flex items-center gap-2"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Ver payload
            </Button>
          </div>
        </td>
      </tr>
      {expanded ? (
        <tr>
          <td colSpan={5} className="bg-surface-container-low px-4 py-3">
            <pre className="max-h-64 overflow-auto rounded-lg bg-surface-container-lowest p-3 text-xs text-tx-primary">
              {JSON.stringify(event.payload ?? {}, null, 2)}
            </pre>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-2">
      <Button
        size="sm"
        variant="subtle"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        Anterior
      </Button>
      <span className="text-sm text-tx-secondary">
        Página {page} de {totalPages}
      </span>
      <Button
        size="sm"
        variant="subtle"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Próxima
      </Button>
    </div>
  );
}

export function IntegrationsView() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('endpoints');
  const tabs: Array<{ id: ActiveTab; label: string }> = [
    { id: 'endpoints', label: 'Endpoints de entrada' },
    { id: 'deliveries', label: 'Histórico de envios' },
    { id: 'events', label: 'Eventos recebidos' },
    { id: 'whatsapp', label: 'WhatsApp' },
  ];

  return (
    // Título e descrição vêm do cabeçalho do modal da Administração (admin/constants.ts).
    <section className="grid gap-4">
      <div className="flex flex-wrap gap-2 rounded-lg border border-border-default/50 bg-surface-container-lowest p-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={[
              'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-bold transition-colors',
              activeTab === tab.id
                ? 'bg-primary text-white'
                : 'text-tx-secondary hover:bg-surface-container-high hover:text-tx-primary',
            ].join(' ')}
          >
            <Link2 className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'endpoints' ? <EndpointsTab /> : null}
      {activeTab === 'deliveries' ? <DeliveriesTab /> : null}
      {activeTab === 'events' ? <EventsTab /> : null}
      {activeTab === 'whatsapp' ? <WhatsAppTab /> : null}
    </section>
  );
}
