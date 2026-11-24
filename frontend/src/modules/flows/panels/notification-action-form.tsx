import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, Loader2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { queryKeys } from '../../../lib/query-keys';
import { api } from '../../../services/api';
import { getApiErrorMessage } from '../../approvals/components/approval-modal-utils';
import { useNotificationPreview } from '../hooks/use-notification-preview';
import { fieldVariables } from '../lib/field-variables';
import {
  MAX_DELAY_MINUTES,
  MAX_TEMPLATE_LENGTH,
  NOTIFICATION_BUILTIN_VARIABLES,
  NOTIFICATION_CHANNELS,
  RECIPIENT_TYPES,
  channelInfo,
  formatDelay,
  getNotificationConfigIssues,
  recipientError,
  type NotificationConfigIssue,
} from '../lib/notification-config';
import type {
  FlowNodeData,
  NotificationChannel,
  NotificationRecipientSpec,
} from '../types/flow.types';
import { useFlowFormFields } from '../hooks/use-flow-form-fields';
import { fetchWhatsAppGroups } from '../services/flows-api';
import {
  ChoiceCards,
  Field as BaseField,
  FormSections,
  Info,
  Input,
  inputCls,
  monoCls,
  Select,
  textareaCls,
  Toggle,
  useInsertAtCursor,
  useTabSuggestion,
  VariableChips,
  type ChipVariable,
} from './node-config/fields';

const TITLE_SUGGESTION_EMAIL = 'Pedido {{solicitation_title}} recebido';
const CONTENT_SUGGESTION = 'Olá {{responder_name}}, recebemos sua solicitação {{solicitation_title}}.';

type FieldMeta ={ code: string; label: string; fieldType: string };
type UserMeta = { id: string; fullName: string; email: string; role?: string };
type SetFn = (key: string, value: unknown) => void;

/** Neste formulário os erros são anunciados (role="alert"), como antes. */
function Field(props: Omit<Parameters<typeof BaseField>[0], 'errorRole'>) {
  return <BaseField {...props} errorRole="alert" />;
}

// Mesmas chaves e formatos de dados do NodeConfigPanel → o cache do React Query é compartilhado.
function useUsers() {
  return useQuery({
    queryKey: ['panel-users', 'all'],
    queryFn: async () => {
      const { data } = await api.get<UserMeta[]>('/users/assignable', { params: undefined });
      return data;
    },
    staleTime: 300_000,
  });
}

function issueFor(issues: NotificationConfigIssue[], field: NotificationConfigIssue['field']): string | undefined {
  const matching = issues.filter((issue) => issue.field === field);
  return matching.length ? matching.map((issue) => issue.message).join(' ') : undefined;
}

// ── Destinatários ──────────────────────────────────────────────────────

/**
 * Escolhe um grupo do WhatsApp da instância configurada e acrescenta o JID dele ao valor fixo —
 * ninguém precisa descobrir o `...@g.us` na mão. Só consulta o provedor quando aberto.
 */
function WhatsAppGroupPicker({ value, onPick }: { value: string; onPick: (next: string) => void }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.flows.whatsappGroups(),
    queryFn: fetchWhatsAppGroups,
    enabled: open,
    staleTime: 60_000,
    retry: false,
  });
  const chosen = new Set(
    value
      .split(/[,;\n]/)
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean),
  );

  function pick(id: string) {
    const current = value.trim();
    onPick(current ? `${current}, ${id}` : id);
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-fit text-[11px] font-bold text-primary hover:underline dark:text-blue-300"
      >
        Escolher grupo do WhatsApp
      </button>
    );
  }

  return (
    <div className="grid gap-1 rounded-[8px] border border-border-default bg-bg-surface p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-tx-secondary">Grupos</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[11px] font-semibold text-tx-muted hover:text-tx-secondary"
        >
          Fechar
        </button>
      </div>
      {isLoading ? (
        <p className="flex items-center gap-1.5 text-[12px] text-tx-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Consultando grupos...
        </p>
      ) : isError ? (
        <div className="grid gap-1">
          <p role="alert" className="text-xs text-nc-danger">
            {getApiErrorMessage(error, 'Não foi possível consultar os grupos.')}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="w-fit text-[11px] font-bold text-primary hover:underline dark:text-blue-300"
          >
            Tentar de novo
          </button>
        </div>
      ) : !data?.isAvailable ? (
        <p className="text-[12px] text-tx-muted">
          WhatsApp não configurado no servidor. Informe o ID do grupo (termina em @g.us).
        </p>
      ) : data.groups.length === 0 ? (
        <p className="text-[12px] text-tx-muted">A instância não participa de nenhum grupo.</p>
      ) : (
        <ul className="max-h-[180px] overflow-y-auto">
          {data.groups.map((group) => {
            const already = chosen.has(group.id);
            return (
              <li key={group.id}>
                <button
                  type="button"
                  disabled={already}
                  onClick={() => pick(group.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-bg-s2 disabled:cursor-default disabled:opacity-50"
                >
                  <span className="min-w-0 truncate font-semibold text-tx-primary">{group.subject}</span>
                  <span className="shrink-0 text-[11px] text-tx-muted">
                    {already ? 'já incluído' : group.size !== null ? `${group.size} participantes` : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function defaultSpec(type: NotificationRecipientSpec['type']): NotificationRecipientSpec {
  switch (type) {
    case 'users':
      return { type: 'users', userIds: [] };
    case 'custom':
      return { type: 'custom', value: '' };
    case 'field':
      return { type: 'field', fieldCode: '' };
    case 'payload_path':
      return { type: 'payload_path', path: '' };
    default:
      return { type };
  }
}

function RecipientRow({
  index,
  spec,
  channel,
  fields,
  users,
  usersLoading,
  onChange,
  onRemove,
}: {
  index: number;
  spec: NotificationRecipientSpec;
  channel: NotificationChannel | undefined;
  fields: FieldMeta[];
  users: UserMeta[];
  usersLoading: boolean;
  onChange: (next: NotificationRecipientSpec) => void;
  onRemove: () => void;
}) {
  const error = recipientError(spec, channel);
  const addressWord = channel === 'whatsapp' ? 'telefone' : 'e-mail';

  return (
    <div className="grid gap-2 rounded-[8px] border border-border-default bg-bg-s2 p-3" data-testid={`recipient-${index}`}>
      <div className="flex items-center gap-2">
        <Select
          aria-label={`Tipo do destinatário ${index + 1}`}
          value={spec.type}
          onChange={(event) => onChange(defaultSpec(event.target.value as NotificationRecipientSpec['type']))}
        >
          {RECIPIENT_TYPES.map((option) => (
            <option key={option.type} value={option.type}>
              {option.label}
            </option>
          ))}
        </Select>
        <button
          type="button"
          aria-label={`Remover destinatário ${index + 1}`}
          onClick={onRemove}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] border border-border-default text-tx-secondary hover:border-[#fecaca] hover:text-[#ef4444]"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {spec.type === 'users' && (
        <div className="max-h-[180px] overflow-y-auto rounded-[8px] border border-border-default bg-bg-surface">
          {usersLoading ? (
            <p className="p-3 text-sm text-tx-muted">Carregando usuários...</p>
          ) : users.length === 0 ? (
            <p className="p-3 text-sm text-tx-muted">Nenhum usuário encontrado.</p>
          ) : (
            users.map((user) => {
              const checked = spec.userIds.includes(user.id);
              return (
                <label
                  key={user.id}
                  className="flex cursor-pointer items-center gap-3 border-b border-border-subtle px-3 py-2 last:border-0 hover:bg-bg-s2"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={checked}
                    onChange={() =>
                      onChange({
                        type: 'users',
                        userIds: checked
                          ? spec.userIds.filter((id) => id !== user.id)
                          : [...spec.userIds, user.id],
                      })
                    }
                  />
                  <div>
                    <p className="text-sm font-bold text-tx-primary">{user.fullName}</p>
                    <p className="text-[11px] text-tx-secondary">{user.email}</p>
                  </div>
                </label>
              );
            })
          )}
        </div>
      )}

      {spec.type === 'requester' && (
        <p className="text-[11px] text-tx-muted">
          {channel === 'in_app'
            ? 'Usa o usuário que criou a solicitação (precisa ser um usuário do sistema).'
            : `Usa o ${addressWord} do solicitante informado no formulário/solicitação.`}
        </p>
      )}

      {spec.type === 'responsible' && (
        <p className="text-[11px] text-tx-muted">
          {channel === 'in_app'
            ? 'Usa o responsável atribuído à solicitação.'
            : `Usa o ${addressWord} do responsável atribuído à solicitação.`}
        </p>
      )}

      {spec.type === 'custom' && (
        <input
          aria-label={`Valor do destinatário ${index + 1}`}
          className={inputCls}
          value={spec.value}
          onChange={(event) => onChange({ type: 'custom', value: event.target.value })}
          placeholder={
            channel === 'whatsapp'
              ? '5585999999999, 120363...@g.us, {{telefone}}'
              : channel === 'in_app'
                ? 'e-mail de um usuário do sistema'
                : 'nome@empresa.com, {{responder_email}}'
          }
        />
      )}

      {spec.type === 'custom' && channel === 'whatsapp' && (
        <WhatsAppGroupPicker
          value={spec.value}
          onPick={(value) => onChange({ type: 'custom', value })}
        />
      )}

      {spec.type === 'field' &&
        (fields.length > 0 ? (
          <Select
            aria-label={`Campo do destinatário ${index + 1}`}
            value={spec.fieldCode}
            onChange={(event) => onChange({ type: 'field', fieldCode: event.target.value })}
          >
            <option value="">Escolha o campo</option>
            {fields.map((field) => (
              <option key={field.code} value={field.code}>
                {field.label} ({field.code})
              </option>
            ))}
          </Select>
        ) : (
          <input
            aria-label={`Código do campo do destinatário ${index + 1}`}
            className={inputCls}
            value={spec.fieldCode}
            onChange={(event) => onChange({ type: 'field', fieldCode: event.target.value })}
            placeholder="código do campo, ex.: email_contato"
          />
        ))}

      {spec.type === 'payload_path' && (
        <input
          aria-label={`Caminho do destinatário ${index + 1}`}
          className={`${inputCls} font-mono`}
          value={spec.path}
          onChange={(event) => onChange({ type: 'payload_path', path: event.target.value })}
          placeholder="header.aprovadores"
        />
      )}

      {(spec.type === 'custom' || spec.type === 'field' || spec.type === 'payload_path') && (
        <p className="text-[11px] text-tx-muted">
          {spec.type === 'custom'
            ? 'Vários valores separados por vírgula. Aceita {{variáveis}}.'
            : spec.type === 'field'
              ? 'Aceita um valor ou uma lista separada por vírgula.'
              : 'Aceita lista, texto separado por vírgula ou objetos com “email”.'}
        </p>
      )}

      {error && (
        <p role="alert" className="text-xs font-semibold text-nc-danger">
          {error}
        </p>
      )}
    </div>
  );
}

// ── Formulário principal ───────────────────────────────────────────────

export function NotificationActionForm({
  d,
  formId,
  set,
  section,
}: {
  d: FlowNodeData;
  formId: string | null;
  set: SetFn;
  /** Etapa aberta no modal; sem ela, mostra tudo (inclusive a prévia) como antes. */
  section?: string;
}) {
  const { data: fields = [] } = useFlowFormFields(formId);
  const { data: users = [], isLoading: usersLoading } = useUsers();
  const [showAdvanced, setShowAdvanced] = useState(
    () => Boolean(d.retryPolicy?.maxAttempts || d.retryPolicy?.backoffSeconds || d.idempotencyKeyTemplate),
  );

  const channel = d.channel;
  const info = channelInfo(channel);
  const recipients: NotificationRecipientSpec[] = Array.isArray(d.recipients) ? d.recipients : [];
  const title = String(d.title ?? '');
  const content = String(d.content ?? '');
  const delay = Number(d.delayMinutes ?? 0);
  const issues = getNotificationConfigIssues(d);
  const isBackground = d.deliveryMode === 'background' || delay > 0;
  const contentInput = useInsertAtCursor<HTMLTextAreaElement>(content, (next) => set('content', next));
  // O placeholder é a sugestão: Tab (ou o botão flutuante) preenche o campo vazio com ele.
  const titleSuggestion = channel === 'email' ? TITLE_SUGGESTION_EMAIL : undefined;
  const titleTab = useTabSuggestion(title, titleSuggestion, (next) => set('title', next));
  const contentTab = useTabSuggestion(content, CONTENT_SUGGESTION, (next) => set('content', next), true);
  const variables: ChipVariable[] = [
    ...NOTIFICATION_BUILTIN_VARIABLES,
    ...fieldVariables(fields).map((variable) => ({ ...variable, field: true })),
  ];

  function setRecipients(next: NotificationRecipientSpec[]) {
    set('recipients', next);
  }

  function setPolicy(key: 'maxAttempts' | 'backoffSeconds', raw: string) {
    const next = { ...(d.retryPolicy ?? {}) };
    if (raw === '') delete next[key];
    else next[key] = Number(raw);
    set('retryPolicy', Object.keys(next).length ? next : undefined);
  }

  const channelError = issueFor(issues, 'channel');
  const recipientsError = issueFor(issues, 'recipients');

  return (
    <FormSections
      section={section}
      parts={{
        canal: (
          <>
            <ChoiceCards
              ariaLabel="Canal"
              columns={3}
              options={NOTIFICATION_CHANNELS.map((option) => ({
                value: option.id,
                title: option.label,
                description: option.hint,
              }))}
              value={channel ?? ('' as NotificationChannel)}
              onChange={(value) => set('channel', value)}
            />
            {channelError && (
              <p role="alert" className="col-span-full text-xs font-semibold text-nc-danger">
                {channelError}
              </p>
            )}
          </>
        ),
        destinatarios: (
          <>
            <Field
              label="Destinatários"
              error={recipientsError && recipients.length === 0 ? recipientsError : undefined}
            >
              <div className="grid gap-2">
                {recipients.map((spec, index) => (
                  <RecipientRow
                    key={index}
                    index={index}
                    spec={spec}
                    channel={channel}
                    fields={fields}
                    users={users}
                    usersLoading={usersLoading}
                    onChange={(next) => setRecipients(recipients.map((item, i) => (i === index ? next : item)))}
                    onRemove={() => setRecipients(recipients.filter((_, i) => i !== index))}
                  />
                ))}
                <Select
                  aria-label="Adicionar destinatário"
                  value=""
                  onChange={(event) => {
                    if (!event.target.value) return;
                    setRecipients([...recipients, defaultSpec(event.target.value as NotificationRecipientSpec['type'])]);
                  }}
                >
                  <option value="">+ Adicionar destinatário…</option>
                  {RECIPIENT_TYPES.map((option) => (
                    <option key={option.type} value={option.type}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
            </Field>
            {recipientsError &&
              recipients.length > 0 &&
              recipients.every((spec) => !recipientError(spec, channel)) && (
                <p role="alert" className="col-span-full -mt-2 text-xs font-semibold text-nc-danger">
                  {recipientsError}
                </p>
              )}
          </>
        ),
        mensagem: (
          <>
            <Field
              label={info?.titleLabel ?? 'Título'}
              error={issueFor(issues, 'title')}
              hint={info ? `Até ${info.titleMax} caracteres no envio. Aceita {{variáveis}}.` : undefined}
            >
              <div className="relative">
                <input
                  {...titleTab.fieldProps}
                  aria-label={info?.titleLabel ?? 'Título'}
                  className={inputCls}
                  value={title}
                  onChange={(event) => set('title', event.target.value)}
                  placeholder={titleSuggestion ?? 'Título'}
                />
                {titleTab.button}
              </div>
            </Field>

            <Field
              label="Mensagem"
              counter={`${content.length}/${MAX_TEMPLATE_LENGTH}${info ? ` · corta em ${info.bodyMax} no envio` : ''}`}
              error={issueFor(issues, 'content')}
              hint="Texto puro: não use HTML. Use {{variável}} para valores dinâmicos."
            >
              <div className="relative">
                <textarea
                  {...contentTab.fieldProps}
                  ref={contentInput.ref}
                  aria-label="Mensagem"
                  className={`${textareaCls} block`}
                  rows={6}
                  value={content}
                  onChange={(event) => set('content', event.target.value)}
                  placeholder={CONTENT_SUGGESTION}
                />
                {contentTab.button}
              </div>
            </Field>

            <VariableChips
              title="Variáveis · clique para inserir"
              variables={variables}
              onPick={(name) => contentInput.insert(`{{${name}}}`)}
            />
            <p className="col-span-full -mt-2 text-xs text-tx-muted">
              Dados do webhook ficam em <span className="font-mono">{'{{payload.caminho.do.campo}}'}</span>.
            </p>

            {/* No modal a prévia fica fixa na coluna da direita; avulso, aparece aqui. */}
            {!section && <InlinePreview channel={channel} title={title} content={content} fields={fields} />}
          </>
        ),
        entrega: (
          <>
            <Field label="Modo">
              <Select
                aria-label="Modo de envio"
                value={d.deliveryMode ?? 'immediate'}
                onChange={(event) => set('deliveryMode', event.target.value)}
                disabled={delay > 0}
              >
                <option value="immediate">Imediato — o fluxo espera o resultado do envio</option>
                <option value="background">Em segundo plano — o fluxo segue e o envio acontece depois</option>
              </Select>
            </Field>

            <Field
              half
              label="Atrasar envio"
              error={issueFor(issues, 'delayMinutes')}
              hint={
                delay > 0
                  ? `Será enviado ${formatDelay(delay)} depois de o fluxo chegar neste nó (em segundo plano).`
                  : `0 = sem atraso. Máximo ${formatDelay(MAX_DELAY_MINUTES)}.`
              }
            >
              <Input
                suffix="min"
                aria-label="Atrasar o envio (minutos)"
                type="number"
                min={0}
                max={MAX_DELAY_MINUTES}
                value={d.delayMinutes ?? 0}
                onChange={(event) => set('delayMinutes', event.target.value === '' ? 0 : Number(event.target.value))}
              />
            </Field>

            <Field half label="Prioridade">
              <Select
                aria-label="Prioridade"
                value={String(d.priority ?? 'normal')}
                onChange={(event) => set('priority', event.target.value)}
              >
                <option value="high">Alta — enviada primeiro</option>
                <option value="normal">Normal</option>
                <option value="low">Baixa</option>
              </Select>
            </Field>

            {isBackground && (
              <Info text="Em segundo plano, falhas de envio depois disso não interrompem o fluxo; acompanhe o resultado no histórico de execuções." />
            )}
          </>
        ),
        falhas: (
          <>
            <Toggle
              title="Continuar o fluxo se a notificação falhar"
              description="Desligado (padrão): uma falha permanente interrompe os próximos nós. Ligado: o fluxo segue, mas a falha continua registrada na execução."
              checked={Boolean(d.continueOnFailure)}
              onChange={(value) => set('continueOnFailure', value)}
            />

            <Toggle
              title="Ignorar destinatários sem contato"
              description="Ex.: solicitação criada por um lote, sem vendedor. Quem não tiver contato fica de fora; se ninguém tiver, o aviso é pulado e o nó termina sem falha."
              checked={Boolean(d.skipUnresolvedRecipients)}
              onChange={(value) => set('skipUnresolvedRecipients', value)}
            />

            <div className="col-span-full overflow-hidden rounded-[10px] border border-border-default">
              <button
                type="button"
                onClick={() => setShowAdvanced((value) => !value)}
                aria-expanded={showAdvanced}
                className="flex w-full items-center justify-between px-3.5 py-3 text-[13px] font-semibold text-tx-secondary hover:bg-bg-s2"
              >
                Avançado: retentativas e idempotência
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
                />
              </button>
              {showAdvanced && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-[18px] border-t border-border-subtle p-3.5">
                  <Field half label="Tentativas (1–5)">
                    <input
                      aria-label="Tentativas"
                      type="number"
                      min={1}
                      max={5}
                      className={inputCls}
                      placeholder="3"
                      value={d.retryPolicy?.maxAttempts ?? ''}
                      onChange={(event) => setPolicy('maxAttempts', event.target.value)}
                    />
                  </Field>
                  <Field half label="Intervalo base (s)">
                    <input
                      aria-label="Intervalo base (s)"
                      type="number"
                      min={5}
                      max={3600}
                      className={inputCls}
                      placeholder="30"
                      value={d.retryPolicy?.backoffSeconds ?? ''}
                      onChange={(event) => setPolicy('backoffSeconds', event.target.value)}
                    />
                  </Field>
                  {issueFor(issues, 'retryPolicy') && (
                    <p role="alert" className="col-span-full text-xs font-semibold text-nc-danger">
                      {issueFor(issues, 'retryPolicy')}
                    </p>
                  )}
                  <p className="col-span-full text-xs leading-[1.45] text-tx-muted">
                    Só falhas transitórias (rede, indisponibilidade, limite do provedor) são repetidas, com
                    intervalo crescente. Endereço inválido ou canal não configurado não são repetidos.
                  </p>
                  <Field
                    label="Chave de idempotência (opcional)"
                    error={issueFor(issues, 'idempotencyKeyTemplate')}
                    hint="Garante um único envio mesmo se o evento de origem for reentregue. Ex.: aviso-{{solicitation_number}}. Sem ela, vale uma notificação por execução do fluxo."
                  >
                    <input
                      aria-label="Chave de idempotência"
                      className={`${inputCls} ${monoCls}`}
                      value={String(d.idempotencyKeyTemplate ?? '')}
                      onChange={(event) => set('idempotencyKeyTemplate', event.target.value || undefined)}
                      placeholder="aviso-{{solicitation_number}}"
                    />
                  </Field>
                </div>
              )}
            </div>
          </>
        ),
      }}
    />
  );
}

/** Prévia dentro do formulário (uso avulso); no modal, a mesma prévia fica na coluna direita. */
function InlinePreview({
  channel,
  title,
  content,
  fields,
}: {
  channel: NotificationChannel | undefined;
  title: string;
  content: string;
  fields: FieldMeta[];
}) {
  const preview = useNotificationPreview({
    channel,
    title,
    content,
    fieldCodes: fields.map((field) => field.code),
  });

  return (
    <section
      aria-label="Prévia da mensagem"
      className="col-span-full grid gap-2 rounded-[10px] border border-border-default p-3.5"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-tx-secondary">Prévia (valores de exemplo)</p>
        {(preview.isFetching || preview.isDebouncing) && preview.canPreview && (
          <Loader2 aria-label="Atualizando prévia" className="h-3.5 w-3.5 animate-spin text-tx-muted" />
        )}
      </div>
      <PreviewResult preview={preview} />
    </section>
  );
}

/** Estados da prévia renderizada pelo backend: placeholder, erro, título/corpo e avisos. */
export function PreviewResult({ preview }: { preview: ReturnType<typeof useNotificationPreview> }) {
  if (!preview.canPreview) {
    return (
      <p className="text-xs text-tx-muted">Escolha o canal e escreva a mensagem para ver a prévia.</p>
    );
  }
  if (preview.isError) {
    return (
      <p role="alert" className="text-xs font-semibold text-nc-danger">
        {getApiErrorMessage(preview.error, 'Não foi possível gerar a prévia.')}
      </p>
    );
  }
  if (!preview.data) return null;
  return (
    <div className="grid gap-2">
      <div className="rounded-lg bg-bg-s2 p-3">
        {preview.data.title && (
          <p data-testid="preview-title" className="text-sm font-semibold text-tx-primary">
            {preview.data.title}
          </p>
        )}
        <p data-testid="preview-body" className="whitespace-pre-wrap text-[13px] leading-[1.55] text-tx-primary">
          {preview.data.body}
        </p>
      </div>
      {preview.data.truncated && (
        <p className="flex items-center gap-1.5 text-xs text-nc-warn">
          <AlertTriangle className="h-3.5 w-3.5" />
          O texto será cortado no envio (limite de {preview.data.limits.bodyMax} caracteres).
        </p>
      )}
      {preview.data.missingVariables.length > 0 && (
        <p role="status" className="flex items-start gap-1.5 text-xs text-nc-warn">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Variáveis não reconhecidas (ficam em branco):{' '}
            {preview.data.missingVariables.map((name) => `{{${name}}}`).join(', ')}
          </span>
        </p>
      )}
    </div>
  );
}
