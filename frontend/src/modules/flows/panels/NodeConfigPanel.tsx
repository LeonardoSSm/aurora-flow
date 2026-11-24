import { useQuery } from '@tanstack/react-query';
import type { Edge, Node } from '@xyflow/react';
import { ChevronDown, ChevronUp, Info as InfoIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { parseEmailList } from '../../../lib/email-list';
import { api } from '../../../services/api';
import { getApiErrorMessage } from '../../approvals/components/approval-modal-utils';
import { useKanbanPhasesQuery } from '../../kanban-phases/hooks/use-kanban-phases-query';
import { useRoleOptionsQuery } from '../../admin/hooks/use-roles';
import { useLopsAiAgentsQuery } from '../hooks/use-lops-ai-agents';
import { useWebhookEndpointsQuery } from '../../integrations/hooks/use-webhooks';
import { buildInboundUrl } from '../../integrations/lib/inbound-url';
import { NotificationActionForm } from './notification-action-form';
import { fieldVariables } from '../lib/field-variables';
import { getApproverSourceMode } from '../lib/flow-validation';
import { SOLICITATION_ORIGIN_LABELS, type FlowNodeData } from '../types/flow.types';
import { useFlowFormFields } from '../hooks/use-flow-form-fields';
import {
  autoMatchedFields,
  forwardCompatibility,
  forwardSourceFields,
  forwardTargetFields,
  type ForwardMapping,
} from '../lib/forward-mapping';
import { ApprovalEmailSettings } from './approval-email-settings';
import { getNodeIssues } from '../lib/node-issues';
import { isCompactNodeType } from './node-config/node-meta';
import { getNodeSections, groupIssuesBySection } from './node-config/node-sections';
import {
  CheckList,
  ChoiceCards,
  EndpointPreview,
  Field,
  FieldGrid,
  FormSections,
  Info,
  Input,
  inputCls,
  KeyValue,
  monoCls,
  Segmented,
  Select,
  SummaryPhrase,
  textareaCls,
  Toggle,
  useInsertAtCursor,
  VariableChips,
  type ChipVariable,
  type KvPair,
} from './node-config/fields';
import { NOTIFICATION_BUILTIN_VARIABLES } from '../lib/notification-config';
import { buildVariableGroups, NODE_OUTPUTS } from '../lib/node-outputs';
import { getPreviewInput, MessagePreview } from './node-config/MessagePreview';
import { CompactVariables, NodeAside } from './node-config/NodeAside';
import { FALLBACK_META, NODE_META } from './node-config/node-meta';
import { NodeConfigBody } from './node-config/NodeConfigBody';
import { NodeConfigFooter } from './node-config/NodeConfigFooter';
import { NodeConfigHeader, type SaveState } from './node-config/NodeConfigHeader';
import { SectionNav } from './node-config/SectionNav';
import { useActiveSection } from './node-config/use-active-section';

// ── Types ──────────────────────────────────────────────────────────────

type FieldMeta = { code: string; label: string; fieldType: string };
type UserMeta = { id: string; fullName: string; email: string; role?: string };
type FormOption = { id: string; name: string };

// ── Data-fetching hooks ────────────────────────────────────────────────

function useForms(enabled = true) {
  return useQuery({
    queryKey: ['panel-forms'],
    queryFn: async () => {
      const { data } = await api.get<{ data?: FormOption[] } | FormOption[]>('/forms?limit=100');
      return (Array.isArray(data) ? data : (data.data ?? [])) as FormOption[];
    },
    staleTime: 60_000,
    enabled,
  });
}

function useUsers(assignableAs?: string) {
  return useQuery({
    queryKey: ['panel-users', assignableAs ?? 'all'],
    queryFn: async () => {
      const { data } = await api.get<UserMeta[]>('/users/assignable', {
        params: assignableAs ? { assignableAs } : undefined,
      });
      return data;
    },
    staleTime: 300_000,
  });
}

type ErpConnectorOption = { id: string; name: string; isActive: boolean };
type ErpTemplateOption = { id: string; name: string; method: string; endpointPath: string; isActive: boolean };

function useErpConnectorsPanel() {
  return useQuery({
    queryKey: ['panel-erp-connectors'],
    queryFn: async () => {
      const { data } = await api.get<ErpConnectorOption[]>('/admin/erp/connectors');
      return data;
    },
    staleTime: 30_000,
  });
}

function useErpTemplatesPanel(connectorId: string | null) {
  return useQuery({
    queryKey: ['panel-erp-templates', connectorId ?? 'none'],
    queryFn: async () => {
      const { data } = await api.get<ErpTemplateOption[]>(
        `/admin/erp/connectors/${connectorId}/templates`,
      );
      return data;
    },
    enabled: !!connectorId,
    staleTime: 30_000,
  });
}

type FlowOption = { id: string; name: string; isActive: boolean };

function useFlowsForPanel(currentFlowId: string | null | undefined) {
  return useQuery({
    queryKey: ['panel-flows', currentFlowId ?? 'none'],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '100' });
      if (currentFlowId) params.set('excludeId', currentFlowId);
      const { data } = await api.get<{ data?: FlowOption[] } | FlowOption[]>(
        `/flows?${params.toString()}`,
      );
      return (Array.isArray(data) ? data : ((data as { data?: FlowOption[] }).data ?? [])) as FlowOption[];
    },
    staleTime: 30_000,
  });
}

const STATUS_OPTIONS = [
  { value: 'open', label: 'Aberta' },
  { value: 'waiting', label: 'Aguardando' },
  { value: 'resolved', label: 'Resolvida' },
  { value: 'canceled', label: 'Cancelada (legado)' },
  { value: 'new', label: 'Nova solicitação' },
  { value: 'in_analysis', label: 'Em análise' },
  { value: 'waiting_approval', label: 'Aguardando aprovação' },
  { value: 'in_progress', label: 'Em execução' },
  { value: 'approved', label: 'Aprovada' },
  { value: 'rejected', label: 'Reprovada' },
  { value: 'waiting_integration', label: 'Aguardando integração' },
  { value: 'completed', label: 'Concluída' },
  { value: 'cancelled', label: 'Cancelada' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Baixa' },
  { value: 'medium', label: 'Média' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Crítica' },
];

const EQUALITY_OPERATORS = [
  { value: 'equals', label: 'igual' },
  { value: 'not_equals', label: 'diferente' },
];

const PRIORITY_OPERATORS = [
  ...EQUALITY_OPERATORS,
  { value: 'greater_than', label: 'maior' },
  { value: 'less_than', label: 'menor' },
];

// ── Variables collapsible section ──────────────────────────────────────

const BUILTIN_VARS = [
  { key: '{{form_name}}', label: 'Nome do formulário' },
  { key: '{{responder_name}}', label: 'Nome do respondente' },
  { key: '{{responder_email}}', label: 'E-mail do respondente' },
  { key: '{{submitted_at}}', label: 'Data de envio' },
  { key: '{{solicitation_number}}', label: 'Número da solicitação' },
  { key: '{{solicitation_title}}', label: 'Título da solicitação' },
  { key: '{{solicitation_status}}', label: 'Status da solicitação' },
  { key: '{{solicitation_requester_name}}', label: 'Solicitante' },
  { key: '{{solicitation_responsible_name}}', label: 'Responsável' },
  { key: '{{approval_link}}', label: 'Link de aprovação' },
  { key: '{{tracking_url}}', label: 'Link de acompanhamento para o solicitante' },
];

function VariablesSection({ fields }: { fields: FieldMeta[] }) {
  const [open, setOpen] = useState(false);

  function copy(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  return (
    <div className="overflow-hidden rounded-[8px] border border-border-default">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-[12px] font-bold text-tx-secondary hover:bg-bg-s2"
      >
        Variáveis disponíveis
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="border-t border-border-default p-3">
          <div className="flex flex-wrap gap-1.5">
            {BUILTIN_VARS.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => copy(v.key)}
                title={`${v.label} — clique para copiar`}
                className="rounded-[4px] bg-bg-hover px-2 py-0.5 font-mono text-[11px] text-primary hover:bg-[#dbeafe]"
              >
                {v.key}
              </button>
            ))}
            {fieldVariables(fields).map((v) => (
              <button
                key={v.name}
                type="button"
                onClick={() => copy(`{{${v.name}}}`)}
                title={`${v.label} — clique para copiar`}
                className="rounded-[4px] bg-[#f0fdf4] px-2 py-0.5 font-mono text-[11px] text-[#15803d] hover:bg-[#dcfce7]"
              >
                {`{{${v.name}}}`}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-tx-muted">
            Clique para copiar e cole nos campos acima.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Per-type forms ─────────────────────────────────────────────────────

/**
 * Formulários com etapas recebem `section` (a etapa aberta no modal) e mostram só os campos dela;
 * sem `section`, renderizam tudo, como antes — é assim que os testes e os nós não migrados os usam.
 */
type SectionProp = { section?: string };
type FormProps = { d: FlowNodeData; set: (k: string, v: unknown) => void } & SectionProp;

function TriggerForm({ d, set, section }: FormProps) {
  const { data: forms = [], isLoading, isError } = useForms();

  return (
    <FormSections
      section={section}
      intro="Este fluxo é disparado automaticamente quando o formulário recebe uma resposta."
      parts={{
        origem: (
          <Field
            label="Formulário observado"
            hint="Opcional. Limita o gatilho a um formulário específico. Sem seleção, dispara para qualquer formulário."
          >
            <Select
              value={String(d.formId ?? '')}
              onChange={(event) => set('formId', event.target.value || null)}
              disabled={isLoading || isError}
            >
              <option value="">
                {isLoading
                  ? 'Carregando formulários...'
                  : isError
                    ? 'Formulários não disponíveis'
                    : 'Qualquer formulário'}
              </option>
              {forms.map((form) => (
                <option key={form.id} value={form.id}>
                  {form.name}
                </option>
              ))}
            </Select>
          </Field>
        ),
        identificacao: <AliasField d={d} set={set} />,
      }}
    />
  );
}

/** Alias do gatilho — o mesmo `d.label` que o título editável do cabeçalho. */
function AliasField({ d, set }: FormProps) {
  return (
    <Field label="Alias (opcional)">
      <input
        className={inputCls}
        value={String(d.label ?? '')}
        onChange={(event) => set('label', event.target.value)}
        placeholder="Nome descritivo para este gatilho"
      />
    </Field>
  );
}

/** As URLs do endpoint para entregar ao outro sistema: a de evento (JSON) e a de lista. */
function InboundUrls({ token }: { token: string }) {
  const [copied, setCopied] = useState<'event' | 'list' | null>(null);

  function copy(kind: 'event' | 'list') {
    navigator.clipboard
      .writeText(buildInboundUrl(token, kind))
      .then(() => setCopied(kind))
      .catch(() => {});
  }

  return (
    <div className="mt-2 grid gap-1.5">
      {(
        [
          ['event', 'URL (JSON)'],
          ['list', 'URL de lista (arquivo, texto ou JSON → itens)'],
        ] as const
      ).map(([kind, label]) => (
        <div key={kind} className="grid gap-0.5">
          <span className="text-[11px] font-semibold text-tx-secondary">{label}</span>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-[6px] bg-bg-s2 px-2 py-1 font-mono text-[11px] text-tx-primary">
              POST {buildInboundUrl(token, kind)}
            </code>
            <button
              type="button"
              onClick={() => copy(kind)}
              className="shrink-0 rounded-[6px] border border-border-default px-2 py-1 text-[11px] font-bold text-primary hover:bg-bg-hover"
            >
              {copied === kind ? 'Copiada' : 'Copiar'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function WebhookReceivedTriggerForm({ d, set, section }: FormProps) {
  const endpointsQuery = useWebhookEndpointsQuery();
  const endpoints = (endpointsQuery.data ?? []).filter((endpoint) => endpoint.isActive);
  const selectedEndpoint = endpoints.find((endpoint) => endpoint.id === d.endpointId);
  const [payloadText, setPayloadText] = useState(() => {
    if (typeof d.payloadFilters === 'string') return d.payloadFilters;
    return d.payloadFilters ? JSON.stringify(d.payloadFilters, null, 2) : '';
  });
  const [payloadError, setPayloadError] = useState(
    typeof d.payloadFilters === 'string' ? 'Informe um objeto JSON válido.' : '',
  );

  function handlePayloadFilterChange(value: string) {
    setPayloadText(value);
    const trimmed = value.trim();
    if (!trimmed) {
      setPayloadError('');
      set('payloadFilters', undefined);
      return;
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setPayloadError('Informe um objeto JSON válido.');
        set('payloadFilters', value);
        return;
      }
      setPayloadError('');
      set('payloadFilters', parsed);
    } catch {
      setPayloadError('Informe um objeto JSON válido.');
      set('payloadFilters', value);
    }
  }

  return (
    <FormSections
      section={section}
      intro="Dispara quando um webhook externo é recebido."
      parts={{
        endpoint: (
          <Field label="Endpoint">
            <Select
              value={String(d.endpointId ?? '')}
              onChange={(event) => set('endpointId', event.target.value || undefined)}
              disabled={endpointsQuery.isLoading}
            >
              <option value="">
                {endpointsQuery.isLoading ? 'Carregando endpoints...' : 'Qualquer endpoint'}
              </option>
              {endpoints.map((endpoint) => (
                <option key={endpoint.id} value={endpoint.id}>
                  {endpoint.name}
                </option>
              ))}
            </Select>
            {selectedEndpoint ? <InboundUrls token={selectedEndpoint.token} /> : null}
          </Field>
        ),
        filtro: (
          <Field
            label="Filtro de payload"
            hint='Opcional. Use JSON, por exemplo: {"type":"ticket.created"}.'
            error={payloadError || undefined}
          >
            <textarea
              className={`${textareaCls} ${monoCls}`}
              rows={5}
              value={payloadText}
              onChange={(event) => handlePayloadFilterChange(event.target.value)}
              placeholder={'{\n  "type": "ticket.created"\n}'}
            />
          </Field>
        ),
        lote: (
          <Field
            label="Lote: um item por execução (opcional)"
            hint='Caminho de uma lista no payload, ex.: pedidos para {"pedidos": ["123", "456"]}. Cada item roda o fluxo separado: use {{item}} para o valor do item, ou payload.campo se o item for um objeto. Pela URL de lista do endpoint (arquivo ou texto): use itens. Lista JSON enviada direto no corpo: use value.'
          >
            <input
              className={`${inputCls} ${monoCls}`}
              value={String(d.splitItemsPath ?? '')}
              onChange={(event) =>
                set('splitItemsPath', event.target.value.trim() ? event.target.value : undefined)
              }
              placeholder="Ex: pedidos"
            />
          </Field>
        ),
        identificacao: <AliasField d={d} set={set} />,
      }}
    />
  );
}

function ScheduledTriggerForm({ d, set, section }: FormProps) {
  const mode = d.mode === 'cron' ? 'cron' : 'interval';

  return (
    <FormSections
      section={section}
      intro="Dispara sozinho, num intervalo fixo ou por expressão cron, sem depender de nenhum evento externo."
      parts={{
        quando: (
          <>
            <Field label="Modo">
              <Segmented
                ariaLabel="Modo"
                options={[
                  { value: 'interval', label: 'Intervalo' },
                  { value: 'cron', label: 'Expressão cron' },
                ]}
                value={mode}
                onChange={(value) => set('mode', value)}
              />
            </Field>

            {mode === 'interval' ? (
              <>
                <Field
                  half
                  label="A cada"
                  error={
                    !d.intervalValue || Number(d.intervalValue) < 1
                      ? 'Informe um valor >= 1.'
                      : undefined
                  }
                >
                  <input
                    type="number"
                    min={1}
                    step={1}
                    className={inputCls}
                    value={String(d.intervalValue ?? '')}
                    onChange={(event) => set('intervalValue', Number(event.target.value) || undefined)}
                    placeholder="15"
                  />
                </Field>
                <Field half label="Unidade">
                  <Select
                    value={String(d.intervalUnit ?? 'minutes')}
                    onChange={(event) => set('intervalUnit', event.target.value)}
                  >
                    <option value="minutes">Minutos</option>
                    <option value="hours">Horas</option>
                    <option value="days">Dias</option>
                  </Select>
                </Field>
              </>
            ) : (
              <Field
                label="Expressão cron"
                hint="Formato padrão de 5 campos: minuto hora dia-do-mês mês dia-da-semana. Ex: '0 8 * * *' roda todo dia às 8h."
                error={!String(d.cronExpression ?? '').trim() ? 'Informe a expressão cron.' : undefined}
              >
                <input
                  className={`${inputCls} ${monoCls}`}
                  value={String(d.cronExpression ?? '')}
                  onChange={(event) => set('cronExpression', event.target.value)}
                  placeholder="0 8 * * *"
                />
              </Field>
            )}

            <Field label="Fuso horário" hint="Padrão: America/Sao_Paulo.">
              <input
                className={inputCls}
                value={String(d.timezone ?? '')}
                onChange={(event) => set('timezone', event.target.value || undefined)}
                placeholder="America/Sao_Paulo"
              />
            </Field>
          </>
        ),
        limites: (
          <Info text="Intervalo mínimo entre execuções: 1 minuto. Se o fluxo falhar 5 vezes seguidas, ele é desativado automaticamente para evitar ficar tentando pra sempre sem ninguém perceber." />
        ),
      }}
    />
  );
}

function SolicitationCreatedTriggerForm({
  d,
  set,
}: {
  d: FlowNodeData;
  set: (k: string, v: unknown) => void;
}) {
  const { data: forms = [], isLoading, isError } = useForms();
  const origins = Array.isArray(d.originTypes) ? d.originTypes : [];

  function toggleOrigin(origin: string) {
    const next = origins.includes(origin)
      ? origins.filter((o) => o !== origin)
      : [...origins, origin];
    set('originTypes', next.length > 0 ? next : undefined);
  }

  return (
    <div className="grid gap-4">
      <Info text="Dispara quando uma Solicitação é criada." />
      <Field
        label="Formulário de origem"
        hint="Opcional. Limita o gatilho a solicitações vindas de um formulário específico."
      >
        <Select
          value={String(d.formId ?? '')}
          onChange={(event) => set('formId', event.target.value || null)}
          disabled={isLoading || isError}
        >
          <option value="">
            {isLoading
              ? 'Carregando formulários...'
              : isError
                ? 'Formulários não disponíveis'
                : 'Qualquer formulário'}
          </option>
          {forms.map((form) => (
            <option key={form.id} value={form.id}>
              {form.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Origem da solicitação"
        hint="Nenhuma marcada = qualquer origem. Uma solicitação criada por um fluxo conta como webhook: marque só Envio de formulário para que ela não entre de novo pelo começo."
      >
        <div className="grid gap-1.5">
          {Object.entries(SOLICITATION_ORIGIN_LABELS).map(([origin, originLabel]) => (
            <label key={origin} className="flex cursor-pointer items-center gap-2 text-sm text-tx-primary">
              <input
                type="checkbox"
                checked={origins.includes(origin)}
                onChange={() => toggleOrigin(origin)}
                className="h-4 w-4 accent-primary"
              />
              {originLabel}
            </label>
          ))}
        </div>
      </Field>
      <Field label="Alias (opcional)">
        <input
          className={inputCls}
          value={String(d.label ?? '')}
          onChange={(e) => set('label', e.target.value)}
          placeholder="Nome descritivo para este gatilho"
        />
      </Field>
    </div>
  );
}

function SolicitationMovedTriggerForm({
  d,
  set,
}: {
  d: FlowNodeData;
  set: (k: string, v: unknown) => void;
}) {
  const { data: forms = [], isLoading, isError } = useForms();

  return (
    <div className="grid gap-4">
      <Info text="Dispara quando um card é movido no Kanban." />
      <Field
        label="Formulário de origem"
        hint="Opcional. Limita o gatilho a solicitações vindas de um formulário específico."
      >
        <Select
          value={String(d.formId ?? '')}
          onChange={(event) => set('formId', event.target.value || null)}
          disabled={isLoading || isError}
        >
          <option value="">
            {isLoading
              ? 'Carregando formulários...'
              : isError
                ? 'Formulários não disponíveis'
                : 'Qualquer formulário'}
          </option>
          {forms.map((form) => (
            <option key={form.id} value={form.id}>
              {form.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="De status">
        <Select
          value={String(d.fromStatus ?? '')}
          onChange={(event) => set('fromStatus', event.target.value || undefined)}
        >
          <option value="">Qualquer status</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Para status">
        <Select
          value={String(d.toStatus ?? '')}
          onChange={(event) => set('toStatus', event.target.value || undefined)}
        >
          <option value="">Qualquer status</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

function ApprovalCompletedTriggerForm({ d, set, section, formId }: FormProps & { formId: string | null }) {
  const phaseFormId = (d.formId as string | null | undefined) ?? formId;
  const { data: phases = [], isLoading } = useKanbanPhasesQuery(phaseFormId);
  return (
    <FormSections
      section={section}
      intro="Dispara quando uma aprovação é concluída."
      parts={{
        principal: (
          <>
            <Field label="Resultado">
              <Segmented
                ariaLabel="Resultado"
                fullWidth
                options={[
                  { value: 'any', label: 'Qualquer' },
                  { value: 'approved', label: 'Aprovado' },
                  { value: 'rejected', label: 'Reprovado' },
                ]}
                value={String(d.result ?? 'any')}
                onChange={(value) => set('result', value)}
              />
            </Field>
            <Field
              label="Só aprovações da fase (opcional)"
              hint="Num processo com mais de uma fase de aprovação, escolha de qual fase é a aprovação que dispara este fluxo. Sem seleção, qualquer aprovação do formulário."
            >
              <Select
                value={String(d.phaseId ?? '')}
                onChange={(event) => set('phaseId', event.target.value || undefined)}
                disabled={!phaseFormId || isLoading}
              >
                <option value="">{!phaseFormId ? 'Fluxo sem formulário' : 'Qualquer fase'}</option>
                {phases.map((phase) => (
                  <option key={phase.id} value={phase.id}>
                    {phase.label}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        ),
      }}
    />
  );
}

/** "Entrou na fase": a fase de destino e, opcionalmente, de onde o card veio. */
function PhaseEnteredTriggerForm({
  d,
  set,
  formId,
}: {
  d: FlowNodeData;
  set: (k: string, v: unknown) => void;
  formId: string | null;
}) {
  const phaseFormId = (d.formId as string | null | undefined) ?? formId;
  const { data: phases = [], isLoading } = useKanbanPhasesQuery(phaseFormId);

  return (
    <div className="grid gap-4">
      <Info text="Dispara quando o card chega numa fase do Kanban: movido por uma pessoa ou por outro fluxo, ou recém-criado na 1ª fase pelo formulário. Base das regras do processo: ao chegar na aprovação, decidir quem aprova pelo valor; ao chegar no pagamento, avisar o financeiro." />
      {!phaseFormId ? (
        <Info text="Vincule o fluxo a um formulário para escolher a fase." />
      ) : null}
      <Field label="Fase em que o card entrou" hint="Sem seleção, qualquer fase do formulário dispara o fluxo.">
        <Select
          value={String(d.phaseId ?? '')}
          onChange={(event) => set('phaseId', event.target.value || undefined)}
          disabled={!phaseFormId || isLoading}
        >
          <option value="">Qualquer fase</option>
          {phases.map((phase) => (
            <option key={phase.id} value={phase.id}>
              {phase.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Vindo da fase (opcional)"
        hint="Só quando o card veio desta fase — ex.: separar o avanço normal de uma devolução."
      >
        <Select
          value={String(d.fromPhaseId ?? '')}
          onChange={(event) => set('fromPhaseId', event.target.value || undefined)}
          disabled={!phaseFormId || isLoading}
        >
          <option value="">De qualquer fase</option>
          {phases
            .filter((phase) => phase.id !== d.phaseId)
            .map((phase) => (
              <option key={phase.id} value={phase.id}>
                {phase.label}
              </option>
            ))}
        </Select>
      </Field>
      <Field label="Alias (opcional)">
        <input
          className={inputCls}
          value={String(d.label ?? '')}
          onChange={(event) => set('label', event.target.value || undefined)}
          placeholder="Ex.: Chegou na aprovação"
        />
      </Field>
    </div>
  );
}

/**
 * "SLA em alerta" e "SLA vencido": qual prazo observar — o SLA geral da solicitação (como sempre
 * foi) ou o prazo de uma fase do Kanban (configurado na fase), de qualquer fase ou de uma só.
 */
function SlaTriggerForm({
  d,
  set,
  section,
  formId,
  intro,
}: FormProps & { formId: string | null; intro: string }) {
  const scope = d.slaScope === 'phase' ? 'phase' : 'solicitation';
  const { data: phases = [], isLoading } = useKanbanPhasesQuery(scope === 'phase' ? formId : null);
  const withSla = phases.filter((phase) => !phase.isTerminal && phase.slaHours);

  return (
    <FormSections
      section={section}
      intro={intro}
      parts={{
        principal: (
          <>
            <Field
              label="Qual prazo"
              hint="O SLA geral conta da criação da solicitação. O prazo da fase conta da entrada do card na fase e é configurado em cada fase do Kanban."
            >
              <Select
                value={scope}
                onChange={(event) => {
                  set('slaScope', event.target.value === 'phase' ? 'phase' : undefined);
                  set('phaseId', undefined);
                }}
              >
                <option value="solicitation">SLA geral da solicitação</option>
                <option value="phase">Prazo da fase do Kanban</option>
              </Select>
            </Field>
            {scope === 'phase' ? (
              <Field
                label="Fase (opcional)"
                hint={
                  formId
                    ? 'Sem seleção, dispara para qualquer fase com prazo deste formulário.'
                    : 'Fluxo sem formulário: dispara para o prazo de qualquer fase.'
                }
              >
                <Select
                  value={String(d.phaseId ?? '')}
                  onChange={(event) => set('phaseId', event.target.value || undefined)}
                  disabled={!formId || isLoading}
                >
                  <option value="">Qualquer fase com prazo</option>
                  {withSla.map((phase) => (
                    <option key={phase.id} value={phase.id}>
                      {phase.label}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </>
        ),
      }}
    />
  );
}

function AlwaysTrueConditionForm({ section }: SectionProp) {
  return (
    <FormSections
      section={section}
      intro="Este caminho é seguido sempre que o nó anterior for executado com sucesso. Não requer configuração adicional."
      parts={{ principal: null }}
    />
  );
}

function AttachmentUploadedTriggerForm({
  d,
  set,
}: {
  d: FlowNodeData;
  set: (k: string, v: unknown) => void;
}) {
  const { data: forms = [], isLoading, isError } = useForms();
  const { data: fields = [] } = useFlowFormFields((d.formId as string | null | undefined) ?? null);
  const fileFields = fields.filter((f) => f.fieldType === 'file_upload');

  return (
    <div className="grid gap-4">
      <Info text="Dispara quando uma imagem é enviada em uma submissão de formulário — ideal para acionar o nó LOPS IA para validar a foto e, em seguida, criar uma aprovação de fase." />
      <Field
        label="Formulário observado"
        hint="Opcional. Limita o gatilho a um formulário específico. Sem seleção, dispara para qualquer formulário."
      >
        <Select
          value={String(d.formId ?? '')}
          onChange={(event) => set('formId', event.target.value || null)}
          disabled={isLoading || isError}
        >
          <option value="">
            {isLoading
              ? 'Carregando formulários...'
              : isError
                ? 'Formulários não disponíveis'
                : 'Qualquer formulário'}
          </option>
          {forms.map((form) => (
            <option key={form.id} value={form.id}>
              {form.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Campo de foto (opcional)"
        hint="Limita o gatilho a um campo específico de upload de imagem. Sem seleção, qualquer anexo de imagem da submissão dispara o fluxo."
      >
        <Select
          value={String(d.fieldCode ?? '')}
          onChange={(event) => set('fieldCode', event.target.value || undefined)}
          disabled={!d.formId}
        >
          <option value="">{!d.formId ? 'Selecione um formulário primeiro' : 'Qualquer campo de imagem'}</option>
          {fileFields.map((f) => (
            <option key={f.code} value={f.code}>
              {f.label} ({f.code})
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Alias (opcional)">
        <input
          className={inputCls}
          value={String(d.label ?? '')}
          onChange={(e) => set('label', e.target.value)}
          placeholder="Nome descritivo para este gatilho"
        />
      </Field>
    </div>
  );
}

function PhaseFieldSavedTriggerForm({
  d,
  set,
}: {
  d: FlowNodeData;
  set: (k: string, v: unknown) => void;
}) {
  const { data: forms = [], isLoading, isError } = useForms();
  const formId = (d.formId as string | null | undefined) ?? null;
  const { data: phases = [], isLoading: isLoadingPhases } = useKanbanPhasesQuery(formId);

  return (
    <div className="grid gap-4">
      <Info text="Dispara quando os campos de uma fase do Kanban são salvos — ideal para pedir aprovação automaticamente assim que um apontamento (ex.: quantidade produzida) for preenchido, sem depender do botão manual 'Solicitar aprovação'." />
      <Field
        label="Formulário observado"
        hint="Opcional. Limita o gatilho a um formulário específico. Sem seleção, dispara para qualquer formulário."
      >
        <Select
          value={String(d.formId ?? '')}
          onChange={(event) => {
            set('formId', event.target.value || null);
            set('phaseId', undefined);
          }}
          disabled={isLoading || isError}
        >
          <option value="">
            {isLoading
              ? 'Carregando formulários...'
              : isError
                ? 'Formulários não disponíveis'
                : 'Qualquer formulário'}
          </option>
          {forms.map((form) => (
            <option key={form.id} value={form.id}>
              {form.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Fase específica (opcional)"
        hint="Limita o gatilho a uma fase do Kanban. Sem seleção, qualquer fase salva deste formulário dispara o fluxo."
      >
        <Select
          value={String(d.phaseId ?? '')}
          onChange={(event) => set('phaseId', event.target.value || undefined)}
          disabled={!formId || isLoadingPhases}
        >
          <option value="">{!formId ? 'Selecione um formulário primeiro' : 'Qualquer fase'}</option>
          {phases.map((phase) => (
            <option key={phase.id} value={phase.id}>
              {phase.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Alias (opcional)">
        <input
          className={inputCls}
          value={String(d.label ?? '')}
          onChange={(e) => set('label', e.target.value)}
          placeholder="Nome descritivo para este gatilho"
        />
      </Field>
    </div>
  );
}

const OPERATORS = [
  { value: 'equals', label: 'é igual a' },
  { value: 'not_equals', label: 'é diferente de' },
  { value: 'contains', label: 'contém' },
  { value: 'greater_than', label: 'é maior que' },
  { value: 'less_than', label: 'é menor que' },
  { value: 'is_empty', label: 'está vazio' },
  { value: 'is_not_empty', label: 'não está vazio' },
];

const OPERATOR_LABELS: Record<string, string> = Object.fromEntries(
  OPERATORS.map((o) => [o.value, o.label]),
);

const NO_VALUE_OPS = new Set(['is_empty', 'is_not_empty']);

function ConditionForm({ d, formId, set, section }: FormProps & { formId: string | null }) {
  const { data: fields = [], isLoading } = useFlowFormFields(formId);
  const op = String(d.operator ?? 'equals');
  const needsValue = !NO_VALUE_OPS.has(op);
  const selectedField = fields.find((f) => f.code === d.fieldCode);

  const preview = d.fieldCode
    ? `Se "${selectedField?.label ?? String(d.fieldCode)}" ${OPERATOR_LABELS[op] ?? op}${
        needsValue && d.value ? ` "${String(d.value)}"` : ''
      }`
    : null;

  return (
    <FormSections
      section={section}
      parts={{
        regra: (
          <>
            <Field
              label="Campo do formulário"
              error={!d.fieldCode ? 'Selecione um campo para continuar.' : undefined}
            >
              <Select
                value={String(d.fieldCode ?? '')}
                onChange={(e) => set('fieldCode', e.target.value)}
                disabled={isLoading || !formId}
                isPlaceholder={!d.fieldCode}
              >
                <option value="">
                  {!formId
                    ? 'Sem formulário vinculado'
                    : isLoading
                      ? 'Carregando campos...'
                      : 'Selecionar campo'}
                </option>
                {fields.map((f) => (
                  <option key={f.code} value={f.code}>
                    {f.label} ({f.code})
                  </option>
                ))}
              </Select>
            </Field>

            <Field half label="Operador">
              <Select value={op} onChange={(e) => set('operator', e.target.value)}>
                {OPERATORS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>

            {needsValue && (
              <Field half label="Valor">
                <input
                  className={inputCls}
                  value={String(d.value ?? '')}
                  onChange={(e) => set('value', e.target.value)}
                  placeholder="Valor para comparar"
                />
              </Field>
            )}

            {preview && <SummaryPhrase>{preview}</SummaryPhrase>}
          </>
        ),
      }}
    />
  );
}

function ResponseValueConditionForm({
  d,
  set,
}: {
  d: FlowNodeData;
  set: (k: string, v: unknown) => void;
}) {
  const op = String(d.operator ?? 'equals');
  const needsValue = !NO_VALUE_OPS.has(op);

  return (
    <div className="grid gap-4">
      <Info text="Compara um valor extraído da última resposta capturada por um nó de Verificação HTTP anterior no fluxo." />

      <Field
        label="Caminho na resposta (dot-path)"
        hint="Ex: data.status ou items.0.aprovado"
        error={!String(d.path ?? '').trim() ? 'Informe o caminho no corpo da resposta.' : undefined}
      >
        <input
          className={inputCls}
          value={String(d.path ?? '')}
          onChange={(e) => set('path', e.target.value)}
          placeholder="data.status"
        />
      </Field>

      <Field label="Operador">
        <Select
          value={op}
          onChange={(e) => set('operator', e.target.value)}
        >
          {OPERATORS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>

      {needsValue && (
        <Field label="Valor">
          <input
            className={inputCls}
            value={String(d.value ?? '')}
            onChange={(e) => set('value', e.target.value)}
            placeholder="Valor para comparar"
          />
        </Field>
      )}
    </div>
  );
}

function ApprovalResultConditionForm({
  d,
  set,
}: {
  d: FlowNodeData;
  set: (k: string, v: unknown) => void;
}) {
  return (
    <div className="grid gap-4">
      <Info text="Ramifica o fluxo pelo resultado da aprovação criada pelo nó 'Criar aprovação' logo antes deste — posicione-o imediatamente depois dele no mesmo caminho." />

      <Field label="Operador" error={!d.operator ? 'Selecione o operador.' : undefined}>
        <Select
          value={String(d.operator ?? 'equals')}
          onChange={(event) => set('operator', event.target.value)}
        >
          {EQUALITY_OPERATORS.map((operator) => (
            <option key={operator.value} value={operator.value}>
              {operator.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Resultado" error={!d.value ? 'Selecione o resultado.' : undefined}>
        <Select
          value={String(d.value ?? 'approved')}
          onChange={(event) => set('value', event.target.value)}
        >
          <option value="approved">Aprovada</option>
          <option value="rejected">Reprovada</option>
        </Select>
      </Field>
    </div>
  );
}

function SolicitationStatusConditionForm({
  d,
  set,
}: {
  d: FlowNodeData;
  set: (k: string, v: unknown) => void;
}) {
  return (
    <div className="grid gap-4">
      <Field label="Operador" error={!d.operator ? 'Selecione o operador.' : undefined}>
        <Select
          value={String(d.operator ?? 'equals')}
          onChange={(event) => set('operator', event.target.value)}
        >
          {EQUALITY_OPERATORS.map((operator) => (
            <option key={operator.value} value={operator.value}>
              {operator.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Status" error={!d.value ? 'Selecione o status.' : undefined}>
        <Select
          value={String(d.value ?? '')}
          onChange={(event) => set('value', event.target.value)}
        >
          <option value="">Selecionar status</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

function SolicitationPriorityConditionForm({
  d,
  set,
}: {
  d: FlowNodeData;
  set: (k: string, v: unknown) => void;
}) {
  return (
    <div className="grid gap-4">
      <Field label="Operador" error={!d.operator ? 'Selecione o operador.' : undefined}>
        <Select
          value={String(d.operator ?? 'equals')}
          onChange={(event) => set('operator', event.target.value)}
        >
          {PRIORITY_OPERATORS.map((operator) => (
            <option key={operator.value} value={operator.value}>
              {operator.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Prioridade" error={!d.value ? 'Selecione a prioridade.' : undefined}>
        <Select
          value={String(d.value ?? '')}
          onChange={(event) => set('value', event.target.value)}
        >
          <option value="">Selecionar prioridade</option>
          {PRIORITY_OPTIONS.map((priority) => (
            <option key={priority.value} value={priority.value}>
              {priority.label}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

function EmailForm({ d, formId, set, section }: FormProps & { formId: string | null }) {
  const { data: fields = [] } = useFlowFormFields(formId);
  const body = String(d.body ?? '');
  const bodyInput = useInsertAtCursor<HTMLTextAreaElement>(body, (next) => set('body', next));
  const variables: ChipVariable[] = [
    ...NOTIFICATION_BUILTIN_VARIABLES,
    ...fieldVariables(fields).map((variable) => ({ ...variable, field: true })),
  ];

  function addResponderEmail() {
    const current = String(d.toEmail ?? '').trim();
    const tag = '{{responder_email}}';
    if (current.includes(tag)) return;
    set('toEmail', current ? `${current}, ${tag}` : tag);
  }

  return (
    <FormSections
      section={section}
      parts={{
        destinatarios: (
          <Field
            label="Destinatário(s)"
            hint="Vírgulas separam múltiplos endereços. Aceita variáveis."
            error={!d.toEmail ? 'Informe ao menos um destinatário.' : undefined}
          >
            <div className="flex min-w-0 gap-2">
              <input
                className={`${inputCls} min-w-0`}
                value={String(d.toEmail ?? '')}
                onChange={(e) => set('toEmail', e.target.value)}
                placeholder="email@exemplo.com"
              />
              <button
                type="button"
                onClick={addResponderEmail}
                title="Inserir e-mail do respondente"
                className="h-[38px] shrink-0 rounded-lg border border-border-default bg-bg-surface px-3 text-[13px] font-medium text-tx-secondary hover:border-nc-accent hover:text-nc-accent"
              >
                + Respondente
              </button>
            </div>
          </Field>
        ),
        mensagem: (
          <>
            <Field label="Assunto">
              <input
                className={inputCls}
                value={String(d.subject ?? '')}
                onChange={(e) => set('subject', e.target.value)}
                placeholder="Assunto do e-mail"
              />
            </Field>

            <Field label="Corpo do e-mail" counter={`${body.length} caracteres`}>
              <textarea
                ref={bodyInput.ref}
                className={textareaCls}
                rows={7}
                value={body}
                onChange={(e) => set('body', e.target.value)}
                placeholder="Olá {{responder_name}}, recebemos sua resposta em {{form_name}}."
              />
            </Field>

            <VariableChips
              variables={variables}
              onPick={(name) => bodyInput.insert(`{{${name}}}`)}
            />
          </>
        ),
      }}
    />
  );
}

function WebhookForm({ d, set, section }: FormProps) {
  const [showHeaders, setShowHeaders] = useState(
    Array.isArray(d.headers) && (d.headers as KvPair[]).length > 0,
  );
  const pairs: KvPair[] = Array.isArray(d.headers) ? (d.headers as KvPair[]) : [];

  return (
    <FormSections
      section={section}
      parts={{
        requisicao: (
          <>
            <Field label="Método HTTP">
              <Segmented
                ariaLabel="Método HTTP"
                mono
                options={HTTP_METHODS_WEBHOOK}
                value={String(d.method ?? 'POST')}
                onChange={(value) => set('method', value)}
              />
            </Field>
            <Field
              label="URL do webhook"
              error={!d.webhookUrl ? 'Informe a URL do endpoint.' : undefined}
            >
              <input
                className={`${inputCls} ${monoCls}`}
                value={String(d.webhookUrl ?? '')}
                onChange={(e) => set('webhookUrl', e.target.value)}
                placeholder="https://..."
              />
            </Field>
          </>
        ),
        cabecalhos: (
          <HeadersSection
            showHeaders={showHeaders}
            setShowHeaders={setShowHeaders}
            pairs={pairs}
            onChange={(p) => set('headers', p)}
          />
        ),
        corpo: (
          <Field label="Template do corpo JSON (opcional)">
            <textarea
              className={`${textareaCls} ${monoCls}`}
              rows={7}
              value={String(d.bodyTemplate ?? '')}
              onChange={(e) => set('bodyTemplate', e.target.value)}
              placeholder={'{\n  "campo": "{{código}}"\n}'}
            />
          </Field>
        ),
      }}
    />
  );
}

const HTTP_METHODS_WEBHOOK = ['POST', 'GET', 'PUT', 'PATCH'].map((m) => ({ value: m, label: m }));
const HTTP_METHODS_CHECK = ['GET', 'POST', 'PUT', 'PATCH'].map((m) => ({ value: m, label: m }));

function HeadersSection({
  showHeaders,
  setShowHeaders,
  pairs,
  onChange,
}: {
  showHeaders: boolean;
  setShowHeaders: (value: boolean) => void;
  pairs: KvPair[];
  onChange: (pairs: KvPair[]) => void;
}) {
  return (
    <>
      <Toggle
        title="Cabeçalhos customizados"
        description="Ligue para enviar cabeçalhos além dos padrões."
        checked={showHeaders}
        onChange={setShowHeaders}
      />
      {showHeaders && <KeyValue pairs={pairs} onChange={onChange} />}
    </>
  );
}

function HttpCheckForm({ d, set, section }: FormProps) {
  const [showHeaders, setShowHeaders] = useState(
    Array.isArray(d.headers) && (d.headers as KvPair[]).length > 0,
  );
  const pairs: KvPair[] = Array.isArray(d.headers) ? (d.headers as KvPair[]) : [];
  const method = String(d.method ?? 'GET');

  return (
    <FormSections
      section={section}
      intro="Chama uma API e guarda a resposta para os nós seguintes (ex: um nó de condição) usarem — diferente do nó Webhook, que é apenas disparar e esquecer."
      parts={{
        requisicao: (
          <>
            <Field label="Método HTTP">
              <Segmented
                ariaLabel="Método HTTP"
                mono
                options={HTTP_METHODS_CHECK}
                value={method}
                onChange={(value) => set('method', value)}
              />
            </Field>
            <Field
              label="URL"
              error={!String(d.url ?? '').trim() ? 'Informe a URL a verificar.' : undefined}
            >
              <input
                className={`${inputCls} ${monoCls}`}
                value={String(d.url ?? '')}
                onChange={(e) => set('url', e.target.value)}
                placeholder="https://..."
              />
            </Field>
            {method !== 'GET' && (
              <Field label="Corpo da requisição (opcional)">
                <textarea
                  className={`${textareaCls} ${monoCls}`}
                  rows={5}
                  value={String(d.bodyTemplate ?? '')}
                  onChange={(e) => set('bodyTemplate', e.target.value)}
                  placeholder={'{\n  "campo": "{{código}}"\n}'}
                />
              </Field>
            )}
          </>
        ),
        cabecalhos: (
          <HeadersSection
            showHeaders={showHeaders}
            setShowHeaders={setShowHeaders}
            pairs={pairs}
            onChange={(p) => set('headers', p)}
          />
        ),
        tempo: (
          <Field half label="Timeout" hint="Padrão: 15000.">
            <Input
              suffix="ms"
              type="number"
              min={1000}
              step={1000}
              aria-label="Timeout (ms)"
              value={String(d.timeoutMs ?? '')}
              onChange={(e) => set('timeoutMs', Number(e.target.value) || undefined)}
              placeholder="15000"
            />
          </Field>
        ),
      }}
    />
  );
}

function NotifyForm({ d, set }: { d: FlowNodeData; set: (k: string, v: unknown) => void }) {
  const { data: users = [], isLoading } = useUsers();
  const selected: string[] = Array.isArray(d.userIds) ? (d.userIds as string[]) : [];

  function toggle(id: string) {
    set('userIds', selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  return (
    <div className="grid gap-4">
      <Field
        label="Usuários a notificar"
        error={selected.length === 0 ? 'Selecione ao menos um usuário.' : undefined}
      >
        {isLoading ? (
          <p className="text-sm text-tx-muted">Carregando usuários...</p>
        ) : (
          <div className="max-h-[200px] overflow-y-auto rounded-[8px] border border-border-default bg-bg-s2">
            {users.length === 0 ? (
              <p className="p-3 text-sm text-tx-muted">Nenhum usuário encontrado.</p>
            ) : (
              users.map((u) => (
                <label
                  key={u.id}
                  className="flex cursor-pointer items-center gap-3 border-b border-border-subtle px-3 py-2 last:border-0 hover:bg-bg-surface"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(u.id)}
                    onChange={() => toggle(u.id)}
                    className="h-4 w-4 accent-primary"
                  />
                  <div>
                    <p className="text-sm font-bold text-tx-primary">{u.fullName}</p>
                    <p className="text-[11px] text-tx-secondary">{u.email}</p>
                  </div>
                </label>
              ))
            )}
          </div>
        )}
      </Field>

      <Field
        label="Mensagem"
        hint="Use {{variável}} para valores dinâmicos."
        error={!String(d.message ?? '').trim() ? 'A mensagem não pode estar vazia.' : undefined}
      >
        <textarea
          className={textareaCls}
          rows={3}
          value={String(d.message ?? '')}
          onChange={(e) => set('message', e.target.value)}
          placeholder="Nova resposta recebida em {{form_name}}."
        />
      </Field>
    </div>
  );
}

function SheetsForm({ d, set }: { d: FlowNodeData; set: (k: string, v: unknown) => void }) {
  return (
    <div className="grid gap-4">
      <Info text="Os dados da resposta serão adicionados como nova linha na planilha especificada." />

      <div className="flex gap-2 rounded-[8px] border border-yellow-200 bg-yellow-50 dark:border-yellow-800/50 dark:bg-yellow-900/20 p-3">
        <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#ca8a04] dark:text-yellow-400" />
        <p className="text-[13px] leading-relaxed text-[#854d0e] dark:text-yellow-200">
          O criador do formulário precisa ter o Google Workspace conectado nas configurações da
          conta.
        </p>
      </div>

      <Field
        label="ID da planilha Google"
        hint="Encontre o ID na URL: docs.google.com/spreadsheets/d/[ID]/edit"
        error={!d.spreadsheetId ? 'Informe o ID da planilha.' : undefined}
      >
        <input
          className={inputCls}
          value={String(d.spreadsheetId ?? '')}
          onChange={(e) => set('spreadsheetId', e.target.value)}
          placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
        />
      </Field>

      <Field label="Nome da aba" hint="Deixe vazio para usar a aba padrão 'Respostas'.">
        <input
          className={inputCls}
          value={String(d.sheetName ?? '')}
          onChange={(e) => set('sheetName', e.target.value)}
          placeholder="Respostas"
        />
      </Field>
    </div>
  );
}

function SolicitationStatusActionForm({
  d,
  set,
}: {
  d: FlowNodeData;
  set: (k: string, v: unknown) => void;
}) {
  return (
    <div className="grid gap-4">
      <Field label="Novo status" error={!d.status ? 'Selecione o novo status.' : undefined}>
        <Select
          value={String(d.status ?? '')}
          onChange={(event) => set('status', event.target.value)}
        >
          <option value="">Selecionar status</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Etapa atual" hint="Opcional. Salva o estágio operacional no card.">
        <input
          className={inputCls}
          value={String(d.currentStage ?? '')}
          onChange={(event) => set('currentStage', event.target.value)}
          placeholder="Ex: Triagem, Compras, Financeiro"
        />
      </Field>
    </div>
  );
}

/** Campos que só organizam o formulário — não guardam resposta, então não servem de aprovador. */
const LAYOUT_FIELD_TYPES = new Set(['title', 'description', 'divider', 'file_download']);

export function ApprovalActionForm({
  d,
  formId,
  set,
  section,
}: FormProps & { formId: string | null }) {
  const { data: users = [], isLoading } = useUsers('approvals.decide');
  const { data: formFields = [] } = useFlowFormFields(formId);
  const answerFields = formFields.filter((field) => !LAYOUT_FIELD_TYPES.has(field.fieldType));
  const [search, setSearch] = useState('');
  const savedEmails: string[] = Array.isArray(d.approverEmails) ? d.approverEmails : [];
  const [emailText, setEmailText] = useState(savedEmails.join(', '));
  const parsedEmails = parseEmailList(emailText);
  const selected: string[] = Array.isArray(d.assignedUserIds) ? d.assignedUserIds : [];
  const selectedRoles: string[] = Array.isArray(d.approverRoleCodes) ? d.approverRoleCodes : [];
  const { data: roleOptions = [] } = useRoleOptionsQuery();
  const scope = d.scope === 'phase' ? 'phase' : 'solicitation';
  const approverSourceMode = getApproverSourceMode(d);
  // Regra com vários aprovadores; nós antigos só têm approvalMode (paralelo/sequencial).
  const approvalRule =
    d.approvalRule === 'all' || d.approvalRule === 'sequential'
      ? d.approvalRule
      : d.approvalRule === 'any'
        ? 'any'
        : d.approvalMode === 'sequential'
          ? 'sequential'
          : 'any';
  const normalizedSearch = search.trim().toLowerCase();
  const approvers = users.filter((user) => {
    if (!normalizedSearch) return true;
    return (
      user.fullName.toLowerCase().includes(normalizedSearch) ||
      user.email.toLowerCase().includes(normalizedSearch)
    );
  });

  /** Guarda também os trechos inválidos: assim a validação do fluxo bloqueia o salvamento. */
  function changeEmails(text: string) {
    setEmailText(text);
    const { emails, invalid } = parseEmailList(text);
    const all = [...emails, ...invalid];
    set('approverEmails', all.length > 0 ? all : undefined);
  }

  function toggle(userId: string) {
    set(
      'assignedUserIds',
      selected.includes(userId) ? selected.filter((id) => id !== userId) : [...selected, userId],
    );
  }

  function toggleRole(code: string) {
    const next = selectedRoles.includes(code)
      ? selectedRoles.filter((role) => role !== code)
      : [...selectedRoles, code];
    set('approverRoleCodes', next.length > 0 ? next : undefined);
  }

  return (
    <FormSections
      section={section}
      parts={{
        conteudo: (
          <>
            <Field
              label="Título da aprovação"
              error={!String(d.title ?? '').trim() ? 'Informe o título da aprovação.' : undefined}
            >
              <input
                className={inputCls}
                value={String(d.title ?? '')}
                onChange={(event) => set('title', event.target.value)}
                placeholder="Ex: Aprovar solicitação {{solicitation_title}}"
              />
            </Field>
            <Field label="Descrição">
              <textarea
                className={textareaCls}
                rows={3}
                value={String(d.description ?? '')}
                onChange={(event) => set('description', event.target.value)}
                placeholder="Contexto para os aprovadores"
              />
            </Field>
          </>
        ),
        escopo: (
          <ChoiceCards
            ariaLabel="Escopo da aprovação"
            options={[
              {
                value: 'solicitation',
                title: 'Solicitação inteira',
                description: 'Aprova a solicitação inteira e muda seu status (comportamento padrão).',
              },
              {
                value: 'phase',
                title: 'Fase atual',
                description:
                  'Cria uma aprovação vinculada só à fase atual — nunca muda o status da solicitação.',
              },
            ]}
            value={scope}
            onChange={(nextScope) => {
              set('scope', nextScope);
              if (nextScope !== 'phase' && approverSourceMode === 'phase_role') {
                set('approverSourceMode', 'fixed');
              }
            }}
          />
        ),
        aprovadores: (
          <>
            <Field label="Origem dos aprovadores">
              <Select
                value={approverSourceMode}
                onChange={(event) => set('approverSourceMode', event.target.value)}
              >
                <option value="fixed">Lista fixa (selecionar usuários)</option>
                <option value="field">Campo do formulário (o solicitante indica)</option>
                <option value="dynamic">Dinâmico (via payload do webhook)</option>
                {scope === 'phase' && (
                  <option value="phase_role">Quem aprova a fase (automático)</option>
                )}
              </Select>
            </Field>

            {approverSourceMode === 'phase_role' ? (
              <Info text="Os aprovadores vêm da configuração da fase (“Quem aprova”: perfis e usuários), resolvidos na hora da execução. A fase é a do gatilho de fase ou a do último “Mover para fase” antes deste nó — ex.: Mover para Logística → Criar aprovação. Nenhuma seleção é necessária aqui." />
            ) : approverSourceMode === 'fixed' ? (
              <>
                <Field
                  label="Perfis que aprovam"
                  hint="Basta uma pessoa de cada perfil escolhido. Prefira perfil a pessoa: quem sai da empresa não trava a aprovação."
                >
                  <CheckList
                    items={roleOptions.map((role) => ({ id: role.code, title: role.name, subtitle: role.code }))}
                    selected={selectedRoles}
                    onToggle={toggleRole}
                    emptyText="Nenhum perfil cadastrado."
                    maxHeight={180}
                  />
                </Field>
                <Field
                  label="Pessoas que aprovam"
                  error={
                    selected.length === 0 && savedEmails.length === 0 && selectedRoles.length === 0
                      ? 'Selecione ao menos um aprovador (perfil, usuário ou e-mail).'
                      : undefined
                  }
                >
                  {users.length > 6 && (
                    <input
                      className={inputCls}
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Buscar por nome ou e-mail"
                    />
                  )}
                  {isLoading ? (
                    <p className="text-[13px] text-tx-muted">Carregando usuários...</p>
                  ) : (
                    <CheckList
                      items={approvers.map((user) => ({
                        id: user.id,
                        title: user.fullName,
                        subtitle: user.email,
                      }))}
                      selected={selected}
                      onToggle={toggle}
                      emptyText="Nenhum aprovador encontrado."
                      maxHeight={240}
                    />
                  )}
                </Field>
                <Field
                  label="Aprovadores por e-mail (opcional)"
                  hint="Para gestores sem usuário no sistema: cada um recebe um link pessoal por e-mail e aprova ou reprova por ele, sem login. Se o e-mail for de um usuário ativo, ele decide dentro do sistema. Separe por vírgula ou linha (máx. 10)."
                  error={
                    parsedEmails.invalid.length > 0
                      ? `E-mail inválido: ${parsedEmails.invalid.join(', ')}`
                      : undefined
                  }
                >
                  <textarea
                    className={textareaCls}
                    rows={2}
                    aria-label="Aprovadores por e-mail"
                    value={emailText}
                    onChange={(event) => changeEmails(event.target.value)}
                    placeholder="gestor@empresa.com, outro@empresa.com"
                  />
                </Field>
              </>
            ) : approverSourceMode === 'field' ? (
              <>
                <Field
                  label="Campo com o e-mail do aprovador"
                  error={
                    !String(d.approverFieldCode ?? '').trim()
                      ? 'Escolha o campo do formulário.'
                      : undefined
                  }
                >
                  {answerFields.length > 0 ? (
                    <Select
                      value={String(d.approverFieldCode ?? '')}
                      onChange={(event) => set('approverFieldCode', event.target.value)}
                      isPlaceholder={!d.approverFieldCode}
                    >
                      <option value="">Escolha o campo</option>
                      {answerFields.map((field) => (
                        <option key={field.code} value={field.code}>
                          {field.label} ({field.code})
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <input
                      className={`${inputCls} ${monoCls}`}
                      value={String(d.approverFieldCode ?? '')}
                      onChange={(event) => set('approverFieldCode', event.target.value)}
                      placeholder="código do campo, ex.: email_gestor"
                    />
                  )}
                </Field>
                <Info
                  text={
                    d.allowExternalApprovers === true
                      ? 'Quem preenche o formulário informa neste campo o e-mail de quem deve aprovar (use um campo do tipo E-mail; aceita mais de um separado por vírgula). Se o e-mail for de um usuário ativo, ele decide dentro do sistema; se não, recebe um link pessoal por e-mail e decide por ele, sem login. Use com o gatilho “Solicitação criada”.'
                      : 'Quem preenche o formulário informa neste campo o e-mail de quem deve aprovar (use um campo do tipo E-mail). Aceita mais de um e-mail separado por vírgula. Cada e-mail precisa ser de um usuário ativo — dá para pré-cadastrar a pessoa em Admin › Usuários sem ela ter entrado antes. Se não bater, a execução falha e os gestores de fluxo são avisados. Marque “Permitir aprovador externo” para aceitar também quem não tem usuário. Use com o gatilho “Solicitação criada”.'
                  }
                />
                <AllowExternalApproversToggle d={d} set={set} />
              </>
            ) : (
              <>
                <Field
                  label="Caminho dos aprovadores (dot-path)"
                  error={
                    !String(d.approversPath ?? '').trim() ? 'Informe o caminho no payload.' : undefined
                  }
                >
                  <input
                    className={`${inputCls} ${monoCls}`}
                    value={String(d.approversPath ?? '')}
                    onChange={(event) => set('approversPath', event.target.value)}
                    placeholder="Ex: header.aprovadores"
                  />
                </Field>
                <Info
                  text={
                    d.allowExternalApprovers === true
                      ? 'O caminho deve resolver, dentro do payload do webhook, para uma lista de e-mails (ou uma string única com e-mails separados por vírgula). Quem tem usuário ativo decide dentro do sistema; os demais recebem um link pessoal por e-mail.'
                      : 'O caminho deve resolver, dentro do payload do webhook, para uma lista de e-mails (ou uma string única com e-mails separados por vírgula). Todos precisam corresponder a usuários ativos, ou a execução do nó falhará. Marque “Permitir aprovador externo” para aceitar também quem não tem usuário.'
                  }
                />
                <AllowExternalApproversToggle d={d} set={set} />
              </>
            )}
          </>
        ),
        modo:
          approverSourceMode === 'phase_role' ? (
            <Info text="No modo &quot;aprovador da fase&quot; vale a regra configurada na fase (qualquer um, todos ou em ordem)." />
          ) : (
            <Field
              label="Regra da aprovação"
              hint={
                approvalRule === 'all'
                  ? 'Todos os aprovadores precisam aprovar, em qualquer ordem.'
                  : approvalRule === 'sequential'
                    ? 'Todos aprovam, um depois do outro, na ordem da lista.'
                    : 'Basta um dos aprovadores aprovar.'
              }
            >
              <Segmented
                ariaLabel="Regra da aprovação"
                options={[
                  { value: 'any', label: 'Qualquer um' },
                  { value: 'all', label: 'Todos' },
                  { value: 'sequential', label: 'Em ordem' },
                ]}
                value={approvalRule}
                onChange={(value) => {
                  set('approvalRule', value);
                  set('approvalMode', undefined);
                }}
              />
            </Field>
          ),
        email: <ApprovalEmailSettings d={d} formId={formId} set={set} />,
      }}
    />
  );
}

function AllowExternalApproversToggle({ d, set }: FormProps) {
  const enabled = d.allowExternalApprovers === true;
  return (
    <Toggle
      title="Permitir aprovador externo (sem usuário no sistema)"
      description={
        enabled
          ? 'Atenção: o e-mail informado recebe um link capaz de aprovar ou reprovar. Em formulários públicos, quem preenche escolhe quem recebe — prefira esta opção em formulários internos. O envio exige SMTP configurado no servidor.'
          : undefined
      }
      checked={enabled}
      onChange={(value) => set('allowExternalApprovers', value)}
    />
  );
}

function SolicitationFromPayloadForm({
  d,
  set,
}: {
  d: FlowNodeData;
  set: (k: string, v: unknown) => void;
}) {
  const mappings: Array<{ path: string; target: string }> = Array.isArray(
    d.metadataFieldMappings,
  )
    ? (d.metadataFieldMappings as Array<{ path: string; target: string }>)
    : [];

  function updateMapping(index: number, patch: Partial<{ path: string; target: string }>) {
    const next = mappings.map((m, i) => (i === index ? { ...m, ...patch } : m));
    set('metadataFieldMappings', next);
  }

  function addMapping() {
    set('metadataFieldMappings', [...mappings, { path: '', target: '' }]);
  }

  function removeMapping(index: number) {
    set(
      'metadataFieldMappings',
      mappings.filter((_, i) => i !== index),
    );
  }

  // Sem modo salvo, herda o que já estiver preenchido: fluxos antigos nasceram com
  // titlePath e devem continuar abrindo no modo payload.
  const titleSourceMode =
    d.titleSourceMode ?? (String(d.titlePath ?? '').trim() ? 'payload' : 'template');
  const isTemplateMode = titleSourceMode === 'template';

  return (
    <div className="grid gap-4">
      <Info
        text={
          isTemplateMode
            ? 'Cria uma nova Solicitação com título fixo. É o modo para gatilhos que não trazem payload — movimentação de solicitação e agendamento. Aceita variáveis como {{solicitation_title}}; num lote de webhook, {{item}} é o item da vez.'
            : 'Cria uma nova Solicitação a partir do payload recebido pelo webhook. Use caminhos com notação de ponto (dot-path), ex: header.numeroPedido.'
        }
      />

      <Field label="Origem do título">
        <Select
          value={titleSourceMode}
          onChange={(event) => set('titleSourceMode', event.target.value)}
        >
          <option value="template">Texto fixo (qualquer gatilho)</option>
          <option value="payload">Caminho no payload (só gatilho de webhook)</option>
        </Select>
      </Field>

      {isTemplateMode ? (
        <>
          <Field
            label="Título da tarefa"
            error={
              !String(d.titleTemplate ?? '').trim() ? 'Informe o título da tarefa.' : undefined
            }
          >
            <input
              className={inputCls}
              value={String(d.titleTemplate ?? '')}
              onChange={(event) => set('titleTemplate', event.target.value)}
              placeholder="Ex: Renovar certificado digital A4"
            />
          </Field>
          <Field label="Descrição (opcional)">
            <input
              className={inputCls}
              value={String(d.descriptionTemplate ?? '')}
              onChange={(event) => set('descriptionTemplate', event.target.value)}
              placeholder="Ex: Renovação anual — anterior: {{solicitation_title}}"
            />
          </Field>
          <Field
            label="Chave de idempotência (opcional)"
            hint="Evita criar a tarefa duas vezes se o evento for reprocessado. Ex: renovacao-{{solicitation_number}}"
          >
            <input
              className={inputCls}
              value={String(d.idempotencyKeyTemplate ?? '')}
              onChange={(event) => set('idempotencyKeyTemplate', event.target.value)}
              placeholder="Ex: renovacao-{{solicitation_number}}"
            />
          </Field>
        </>
      ) : (
        <>
          <Field
            label="Caminho do título"
            error={!String(d.titlePath ?? '').trim() ? 'Informe o caminho (dot-path) do título.' : undefined}
          >
            <input
              className={inputCls}
              value={String(d.titlePath ?? '')}
              onChange={(event) => set('titlePath', event.target.value)}
              placeholder="Ex: header.numeroPedido"
            />
          </Field>
          <Field label="Caminho da descrição (opcional)">
            <input
              className={inputCls}
              value={String(d.descriptionPath ?? '')}
              onChange={(event) => set('descriptionPath', event.target.value)}
              placeholder="Ex: header.observacao"
            />
          </Field>
          <Field
            label="Chave de idempotência (opcional)"
            hint="Evita duplicar a solicitação caso o webhook seja reenviado (ex: número do pedido)."
          >
            <input
              className={inputCls}
              value={String(d.idempotencyKeyPath ?? '')}
              onChange={(event) => set('idempotencyKeyPath', event.target.value)}
              placeholder="Ex: header.numeroPedido"
            />
          </Field>
        </>
      )}

      <Field
        label="Se a solicitação já existia"
        hint="Vale quando a chave de idempotência acha uma solicitação já criada (o mesmo item enviado de novo). Parar evita mover o card de volta e repetir aprovações e e-mails."
      >
        <label className="flex cursor-pointer items-center gap-2 text-sm text-tx-primary">
          <input
            type="checkbox"
            checked={d.stopIfExisting === true}
            onChange={(event) => set('stopIfExisting', event.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          Parar o caminho aqui
        </label>
      </Field>

      <SolicitationFormAnswers d={d} set={set} />

      <Field
        label="Prazo da tarefa criada (opcional)"
        hint="Sem prazo, a tarefa herda o SLA padrão do sistema. Meses e dias se somam."
      >
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            className={inputCls}
            value={d.dueInMonths === undefined ? '' : String(d.dueInMonths)}
            onChange={(event) =>
              set('dueInMonths', event.target.value === '' ? undefined : Number(event.target.value))
            }
            placeholder="Meses"
          />
          <input
            type="number"
            min={1}
            className={inputCls}
            value={d.dueInDays === undefined ? '' : String(d.dueInDays)}
            onChange={(event) =>
              set('dueInDays', event.target.value === '' ? undefined : Number(event.target.value))
            }
            placeholder="Dias"
          />
        </div>
      </Field>

      <Field
        label="Avisar ao consumir % do prazo (opcional)"
        hint="Dispara o gatilho de alerta de SLA. Em 12 meses, 92% avisa cerca de 30 dias antes; vazio usa o padrão (80%)."
      >
        <input
          type="number"
          min={1}
          max={99}
          className={inputCls}
          value={
            d.slaWarningThresholdPercent === undefined
              ? ''
              : String(d.slaWarningThresholdPercent)
          }
          onChange={(event) =>
            set(
              'slaWarningThresholdPercent',
              event.target.value === '' ? undefined : Number(event.target.value),
            )
          }
          placeholder="Ex: 92"
        />
      </Field>
      {/* Mapeamentos leem do payload; no modo de texto fixo não há de onde ler. */}
      {isTemplateMode ? null : (
      <Field label="Campos adicionais de metadata (opcional)">
        <div className="grid gap-2">
          {mappings.map((mapping, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                className={inputCls}
                value={mapping.path}
                onChange={(event) => updateMapping(index, { path: event.target.value })}
                placeholder="Caminho no payload (ex: header.valorTotal)"
              />
              <input
                className={inputCls}
                value={mapping.target}
                onChange={(event) => updateMapping(index, { target: event.target.value })}
                placeholder="Nome do campo"
              />
              <button
                type="button"
                onClick={() => removeMapping(index)}
                className="shrink-0 rounded-[8px] border border-border-default px-2 py-1 text-xs font-bold text-tx-muted hover:bg-bg-surface"
              >
                Remover
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addMapping}
            className="w-fit rounded-[8px] border border-border-default px-3 py-1.5 text-xs font-bold text-tx-primary hover:bg-bg-surface"
          >
            + Campo
          </button>
        </div>
      </Field>
      )}
    </div>
  );
}

const NON_ANSWER_FIELD_TYPES = new Set(['title', 'description', 'divider', 'file_download']);

/**
 * Formulário da solicitação criada e as respostas que o fluxo dá por ela — como se alguém o
 * tivesse preenchido. É o que põe a solicitação no Kanban do processo e deixa `{{pedido}}`, as
 * condições e a ficha do ERP funcionarem numa solicitação que nasceu sem envio (ex.: um lote
 * recebido por webhook).
 */
/** Fase em que a solicitação criada nasce: a entrada externa do mapa do processo. */
function EntryPhaseField({
  d,
  formId,
  set,
}: {
  d: FlowNodeData;
  formId: string;
  set: (k: string, v: unknown) => void;
}) {
  const { data: phases = [], isLoading } = useKanbanPhasesQuery(formId);
  return (
    <Field
      label="Fase de entrada"
      hint={'A solicitação já nasce nesta fase, sem passar pela primeira; os fluxos "Entrou na fase" dela disparam.'}
    >
      <Select
        value={String(d.phaseId ?? '')}
        onChange={(event) => set('phaseId', event.target.value || undefined)}
        disabled={isLoading}
      >
        <option value="">{isLoading ? 'Carregando fases...' : 'Primeira fase'}</option>
        {phases.map((phase) => (
          <option key={phase.id} value={phase.id}>
            {phase.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function SolicitationFormAnswers({
  d,
  set,
}: {
  d: FlowNodeData;
  set: (k: string, v: unknown) => void;
}) {
  const { data: forms = [], isLoading: isLoadingForms } = useForms();
  const formId = typeof d.formId === 'string' && d.formId ? d.formId : null;
  const { data: fields = [], isLoading: isLoadingFields } = useFlowFormFields(formId);
  const answerFields = fields.filter(
    (field) => !field.phaseLabel && !NON_ANSWER_FIELD_TYPES.has(field.fieldType),
  );
  const answers = Array.isArray(d.fieldValues) ? d.fieldValues : [];

  function updateAnswer(index: number, patch: Partial<{ fieldCode: string; value: string }>) {
    set(
      'fieldValues',
      answers.map((answer, i) => (i === index ? { ...answer, ...patch } : answer)),
    );
  }

  function removeAnswer(index: number) {
    const next = answers.filter((_, i) => i !== index);
    set('fieldValues', next.length > 0 ? next : undefined);
  }

  return (
    <>
      <Field
        label="Formulário da solicitação"
        hint="A solicitação entra no Kanban deste formulário, na fase de entrada escolhida (sem ela, na primeira)."
      >
        <Select
          value={formId ?? ''}
          onChange={(event) => {
            set('formId', event.target.value || undefined);
            // Os códigos e a fase são do formulário anterior: trocar de formulário limpa os dois.
            if (answers.length > 0) set('fieldValues', undefined);
            if (d.phaseId) set('phaseId', undefined);
          }}
          disabled={isLoadingForms}
        >
          <option value="">{isLoadingForms ? 'Carregando formulários...' : 'Sem formulário (usa o do fluxo, se houver)'}</option>
          {forms.map((form) => (
            <option key={form.id} value={form.id}>
              {form.name}
            </option>
          ))}
        </Select>
      </Field>

      {formId ? <EntryPhaseField d={d} formId={formId} set={set} /> : null}

      {formId ? (
        <Field
          label="Respostas do formulário (opcional)"
          hint="Preenche campos como se alguém tivesse respondido. Aceita variáveis, ex.: {{item}} para o item de um lote. Num campo Lista do ERP, use o código no ERP — a ficha aparece na aprovação."
        >
          <div className="grid gap-2">
            {answers.map((answer, index) => (
              <div key={index} className="flex items-center gap-2">
                <Select
                  value={answer.fieldCode}
                  onChange={(event) => updateAnswer(index, { fieldCode: event.target.value })}
                  aria-label="Campo do formulário"
                >
                  <option value="">{isLoadingFields ? 'Carregando campos...' : 'Escolha o campo'}</option>
                  {answerFields.map((field) => (
                    <option key={field.code} value={field.code}>
                      {field.label}
                    </option>
                  ))}
                </Select>
                <input
                  className={inputCls}
                  value={answer.value}
                  onChange={(event) => updateAnswer(index, { value: event.target.value })}
                  placeholder="Ex: {{item}}"
                  aria-label="Valor da resposta"
                />
                <button
                  type="button"
                  onClick={() => removeAnswer(index)}
                  className="shrink-0 rounded-[8px] border border-border-default px-2 py-1 text-xs font-bold text-tx-muted hover:bg-bg-surface"
                >
                  Remover
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => set('fieldValues', [...answers, { fieldCode: '', value: '' }])}
              className="w-fit rounded-[8px] border border-border-default px-3 py-1.5 text-xs font-bold text-tx-primary hover:bg-bg-surface"
            >
              + Resposta
            </button>
          </div>
        </Field>
      ) : null}
    </>
  );
}

const FORWARD_TEXT_SOURCE = '__texto__';

const COMPATIBILITY_NOTE: Record<'convert' | 'incompatible', string> = {
  convert: 'Tipos diferentes: o valor é convertido e fica de fora se não couber (o resultado da execução avisa).',
  incompatible: 'Este campo não recebe valor desse tipo — escolha um campo do mesmo tipo.',
};

/**
 * Encaminhar para outro processo: destino, fase, título e de onde vem cada campo do destino. O
 * card atual é o do fluxo (`flowFormId`); os campos de mesmo código vão sozinhos.
 */
function ForwardToProcessForm({
  d,
  flowFormId,
  set,
}: {
  d: FlowNodeData;
  flowFormId: string | null;
  set: (k: string, v: unknown) => void;
}) {
  const { data: forms = [], isLoading: isLoadingForms } = useForms();
  const targetFormId = typeof d.formId === 'string' && d.formId ? d.formId : null;
  const { data: targetAll = [], isLoading: isLoadingTarget } = useFlowFormFields(targetFormId);
  const { data: sourceAll = [] } = useFlowFormFields(flowFormId);
  const targets = forwardTargetFields(targetAll);
  const sources = forwardSourceFields(sourceAll);
  const mappings: ForwardMapping[] = Array.isArray(d.fieldMappings) ? d.fieldMappings : [];
  const autoMatch = d.autoMatchByCode !== false;
  const automatic = autoMatch ? autoMatchedFields(targets, sources, mappings) : [];
  const sourceByCode = new Map(sources.map((field) => [field.code, field]));

  function updateMappings(next: ForwardMapping[]) {
    set('fieldMappings', next.length > 0 ? next : undefined);
  }

  function updateMapping(index: number, patch: ForwardMapping) {
    updateMappings(mappings.map((mapping, i) => (i === index ? patch : mapping)));
  }

  return (
    <div className="grid gap-4">
      <Field
        label="Processo de destino"
        hint="O card nasce lá como se tivesse sido aberto pelo formulário, com o mesmo solicitante; os dois cards ficam ligados."
        error={!targetFormId ? 'Escolha o processo de destino.' : undefined}
      >
        <Select
          value={targetFormId ?? ''}
          isPlaceholder={!targetFormId}
          onChange={(event) => {
            set('formId', event.target.value || undefined);
            // Fase e campos são do processo anterior.
            if (d.phaseId) set('phaseId', undefined);
            if (mappings.length > 0) set('fieldMappings', undefined);
          }}
          disabled={isLoadingForms}
        >
          <option value="">{isLoadingForms ? 'Carregando processos...' : 'Escolha o processo'}</option>
          {forms.map((form) => (
            <option key={form.id} value={form.id}>
              {form.name}
              {form.id === flowFormId ? ' (este processo)' : ''}
            </option>
          ))}
        </Select>
      </Field>

      {targetFormId ? <EntryPhaseField d={d} formId={targetFormId} set={set} /> : null}

      <Field
        label="Título no destino (opcional)"
        hint="Vazio = o mesmo título do card. Aceita variáveis, ex.: {{solicitation_title}}."
      >
        <input
          className={inputCls}
          value={String(d.titleTemplate ?? '')}
          onChange={(event) => set('titleTemplate', event.target.value || undefined)}
          placeholder="Mesmo título do card"
        />
      </Field>

      {targetFormId ? (
        <>
          <Field label="Respostas levadas">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-tx-primary">
              <input
                type="checkbox"
                checked={autoMatch}
                onChange={(event) => set('autoMatchByCode', event.target.checked ? undefined : false)}
                className="h-4 w-4 accent-primary"
              />
              Preencher sozinho os campos de mesmo código
            </label>
            {autoMatch ? (
              <p className="text-xs leading-[1.45] text-tx-muted">
                {isLoadingTarget
                  ? 'Carregando campos...'
                  : automatic.length > 0
                    ? `Vão sozinhos: ${automatic.map(({ target }) => target.label).join(', ')}.`
                    : 'Nenhum campo do destino tem o mesmo código de um campo deste processo.'}
              </p>
            ) : null}
            {automatic
              .filter(({ compatibility }) => compatibility === 'incompatible')
              .map(({ target }) => (
                <p key={target.code} className="text-xs font-semibold text-nc-danger">
                  {target.label}: {COMPATIBILITY_NOTE.incompatible}
                </p>
              ))}
          </Field>

          <Field
            label="De onde vem cada campo (opcional)"
            hint="Vale mais que o mesmo código. Seleções casam pelo valor ou pelo rótulo da opção; os arquivos vão como anexos."
          >
            <div className="grid gap-3">
              {mappings.map((mapping, index) => {
                const target = targets.find((field) => field.code === mapping.targetFieldCode);
                const isText = !mapping.sourceFieldCode && typeof mapping.value === 'string';
                const source = mapping.sourceFieldCode ? sourceByCode.get(mapping.sourceFieldCode) : undefined;
                const compatibility =
                  target && (source || isText)
                    ? forwardCompatibility(isText ? null : (source?.fieldType ?? null), target.fieldType)
                    : 'ok';
                return (
                  <div key={index} className="grid gap-1.5 rounded-lg border border-border-default p-2.5">
                    <div className="flex items-center gap-2">
                      <Select
                        value={mapping.targetFieldCode}
                        isPlaceholder={!mapping.targetFieldCode}
                        onChange={(event) => updateMapping(index, { ...mapping, targetFieldCode: event.target.value })}
                        aria-label="Campo do destino"
                      >
                        <option value="">Campo do destino</option>
                        {targets.map((field) => (
                          <option key={field.code} value={field.code}>
                            {field.label}
                          </option>
                        ))}
                      </Select>
                      <span aria-hidden className="shrink-0 text-tx-muted">
                        ←
                      </span>
                      <Select
                        value={isText ? FORWARD_TEXT_SOURCE : (mapping.sourceFieldCode ?? '')}
                        isPlaceholder={!isText && !mapping.sourceFieldCode}
                        onChange={(event) => {
                          const value = event.target.value;
                          updateMapping(
                            index,
                            value === FORWARD_TEXT_SOURCE
                              ? { targetFieldCode: mapping.targetFieldCode, value: '' }
                              : { targetFieldCode: mapping.targetFieldCode, sourceFieldCode: value || undefined },
                          );
                        }}
                        aria-label="De onde vem o valor"
                      >
                        <option value="">De onde vem</option>
                        {sources.map((field) => (
                          <option key={field.code} value={field.code}>
                            {field.label}
                          </option>
                        ))}
                        <option value={FORWARD_TEXT_SOURCE}>Texto ou variável…</option>
                      </Select>
                      <button
                        type="button"
                        onClick={() => updateMappings(mappings.filter((_, i) => i !== index))}
                        className="shrink-0 rounded-[8px] border border-border-default px-2 py-1 text-xs font-bold text-tx-muted hover:bg-bg-surface"
                      >
                        Remover
                      </button>
                    </div>
                    {isText ? (
                      <input
                        className={inputCls}
                        value={mapping.value ?? ''}
                        onChange={(event) => updateMapping(index, { ...mapping, value: event.target.value })}
                        placeholder="Ex: Veio da lista de espera em {{submitted_at}}"
                        aria-label="Texto do campo"
                      />
                    ) : null}
                    {compatibility !== 'ok' ? (
                      <p
                        className={`text-xs ${compatibility === 'incompatible' ? 'font-semibold text-nc-danger' : 'text-tx-muted'}`}
                      >
                        {COMPATIBILITY_NOTE[compatibility]}
                      </p>
                    ) : null}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => updateMappings([...mappings, { targetFieldCode: '' }])}
                className="w-fit rounded-[8px] border border-border-default px-3 py-1.5 text-xs font-bold text-tx-primary hover:bg-bg-surface"
              >
                + Campo
              </button>
            </div>
          </Field>
        </>
      ) : null}

      <Field label="Anexos e repetição">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-tx-primary">
          <input
            type="checkbox"
            checked={d.copyAttachments !== false}
            onChange={(event) => set('copyAttachments', event.target.checked ? undefined : false)}
            className="h-4 w-4 accent-primary"
          />
          Levar os anexos do card (cópia dos arquivos)
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-tx-primary">
          <input
            type="checkbox"
            checked={d.stopIfExisting !== false}
            onChange={(event) => set('stopIfExisting', event.target.checked ? undefined : false)}
            className="h-4 w-4 accent-primary"
          />
          Card já encaminhado para este processo: parar o caminho aqui
        </label>
        <p className="text-xs leading-[1.45] text-tx-muted">
          Cada card vai uma vez para cada processo. Os passos seguintes continuam no card de origem (ex.: encerrar
          o card daqui).
        </p>
      </Field>
    </div>
  );
}

function ResponsibleActionForm({
  d,
  set,
}: {
  d: FlowNodeData;
  set: (k: string, v: unknown) => void;
}) {
  const { data: users = [], isLoading } = useUsers('solicitations.manage');

  function handleChange(userId: string) {
    const user = users.find((candidate) => candidate.id === userId);
    set('userId', userId || undefined);
    set('userName', user?.fullName ?? undefined);
  }

  return (
    <div className="grid gap-4">
      <Field label="Responsável" error={!d.userId ? 'Selecione um responsável.' : undefined}>
        <Select
          value={String(d.userId ?? '')}
          onChange={(event) => handleChange(event.target.value)}
          disabled={isLoading}
        >
          <option value="">{isLoading ? 'Carregando usuários...' : 'Selecionar usuário'}</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.fullName} ({user.email})
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

function WhatsAppActionForm({
  d,
  formId,
  set,
}: {
  d: FlowNodeData;
  formId: string | null;
  set: (k: string, v: unknown) => void;
}) {
  const { data: fields = [] } = useFlowFormFields(formId);
  const recipientType = String(d.recipientType ?? 'requester');
  const includeApprovalLink = Boolean(d.includeApprovalLink);

  return (
    <div className="grid gap-4">
      <Field label="Destinatário">
        <Select
          value={recipientType}
          onChange={(event) => set('recipientType', event.target.value)}
        >
          <option value="requester">Solicitante</option>
          <option value="responsible">Responsável</option>
          <option value="custom">Número fixo</option>
        </Select>
      </Field>

      {recipientType === 'custom' ? (
        <Field
          label="Número fixo"
          error={!String(d.customPhone ?? '').trim() ? 'Informe o número fixo.' : undefined}
        >
          <input
            className={inputCls}
            value={String(d.customPhone ?? '')}
            onChange={(event) => set('customPhone', event.target.value)}
            placeholder="5585999999999"
          />
        </Field>
      ) : null}

      <Field
        label="Mensagem"
        hint="Variáveis disponíveis: {{solicitation_number}}, {{solicitation_title}}, {{solicitation_requester_name}}, {{approval_link}}."
        error={!String(d.message ?? '').trim() ? 'A mensagem não pode estar vazia.' : undefined}
      >
        <textarea
          className={textareaCls}
          rows={5}
          value={String(d.message ?? '')}
          onChange={(event) => set('message', event.target.value)}
          placeholder="Olá {{solicitation_requester_name}}, sua solicitação {{solicitation_title}} foi atualizada."
        />
      </Field>

      <Toggle
        title="Incluir link de aprovação"
        checked={includeApprovalLink}
        onChange={(value) => set('includeApprovalLink', value)}
      />

      <VariablesSection fields={fields} />
    </div>
  );
}

// ── Run-flow form ──────────────────────────────────────────────────────

function RunFlowForm({
  d,
  set,
  currentFlowId,
}: {
  d: FlowNodeData;
  set: (k: string, v: unknown) => void;
  currentFlowId?: string | null;
}) {
  const { data: flows = [], isLoading } = useFlowsForPanel(currentFlowId);
  const [search, setSearch] = useState('');
  const mode = String(d.mode ?? 'sync');
  const passContext = d.passContext !== false; // default true when undefined

  const normalizedSearch = search.trim().toLowerCase();
  const filteredFlows = normalizedSearch
    ? flows.filter((f) => f.name.toLowerCase().includes(normalizedSearch))
    : flows;

  const selectedFlow = flows.find((f) => f.id === d.flowId);

  function handleFlowSelect(flowId: string) {
    const flow = flows.find((f) => f.id === flowId);
    set('flowId', flowId || undefined);
    set('flowName', flow?.name ?? undefined);
  }

  return (
    <div className="grid gap-4">
      <Info text="Este nó chama outro fluxo como sub-rotina. Em modo síncrono, o pai aguarda o filho terminar e falhas propagam. Em modo assíncrono, o filho é disparado sem bloqueio e falhas são ignoradas." />

      <Field
        label="Fluxo filho"
        error={!d.flowId ? 'Selecione o fluxo a ser chamado.' : undefined}
      >
        <input
          className={inputCls}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar fluxo..."
        />
        {isLoading ? (
          <p className="mt-2 text-sm text-tx-muted">Carregando fluxos...</p>
        ) : (
          <div className="mt-1 max-h-[180px] overflow-y-auto rounded-[8px] border border-border-default bg-bg-s2">
            {filteredFlows.length === 0 ? (
              <p className="p-3 text-sm text-tx-muted">Nenhum fluxo encontrado.</p>
            ) : (
              filteredFlows.map((flow) => (
                <label
                  key={flow.id}
                  className="flex cursor-pointer items-center gap-3 border-b border-border-subtle px-3 py-2 last:border-0 hover:bg-bg-surface"
                >
                  <input
                    type="radio"
                    name={`run-flow-id-${currentFlowId ?? 'new'}`}
                    checked={d.flowId === flow.id}
                    onChange={() => handleFlowSelect(flow.id)}
                    className="h-4 w-4 accent-primary"
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={[
                        'text-sm font-bold leading-tight',
                        flow.isActive ? 'text-tx-primary' : 'text-tx-muted',
                      ].join(' ')}
                    >
                      {flow.name}
                    </p>
                    {!flow.isActive && (
                      <p className="text-[11px] italic text-tx-muted">inativo</p>
                    )}
                  </div>
                </label>
              ))
            )}
          </div>
        )}
        {selectedFlow && !selectedFlow.isActive && (
          <p className="mt-1 text-[11px] font-bold text-[#d97706]">
            ⚠ O fluxo selecionado está inativo e não será executado.
          </p>
        )}
      </Field>

      <Field
        label="Modo de execução"
        hint={
          mode === 'sync'
            ? 'O fluxo pai aguarda o filho terminar. Falha do filho torna o nó pai como falha parcial.'
            : 'O filho é disparado sem bloquear o pai. Falhas são registradas no log sem afetar o fluxo pai.'
        }
      >
        <div className="flex gap-4">
          {(['sync', 'async'] as const).map((m) => (
            <label key={m} className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name={`run-flow-mode-${currentFlowId ?? 'new'}`}
                value={m}
                checked={mode === m}
                onChange={() => set('mode', m)}
                className="h-4 w-4 accent-primary"
              />
              <span className="text-sm font-bold text-tx-primary">
                {m === 'sync' ? 'Síncrono' : 'Assíncrono'}
              </span>
            </label>
          ))}
        </div>
      </Field>

      <Toggle
        title="Passar contexto"
        description="Compartilha variáveis e dados da solicitação com o fluxo filho."
        checked={passContext}
        onChange={(value) => set('passContext', value)}
      />
    </div>
  );
}

// ── ERP operation form ─────────────────────────────────────────────────

function ErpOperationForm({ d, set, section }: FormProps) {
  const connectorId = String(d.connectorId ?? '');
  const templateId = String(d.templateId ?? '');

  const { data: connectors = [], isLoading: loadingConnectors } = useErpConnectorsPanel();
  const { data: templates = [], isLoading: loadingTemplates } = useErpTemplatesPanel(
    connectorId || null,
  );

  const selectedTemplate = templates.find((t) => t.id === templateId);

  function handleConnectorChange(value: string) {
    const connector = connectors.find((c) => c.id === value);
    set('connectorId', value || undefined);
    set('connectorName', connector?.name ?? undefined);
    set('templateId', undefined);
    set('templateName', undefined);
    set('templateMethod', undefined);
  }

  if (!loadingConnectors && connectors.length === 0) {
    return (
      <FieldGrid>
        <Info text="Nenhum conector ERP configurado. Acesse Administração > ERP para criar um conector antes de usar esta ação." />
      </FieldGrid>
    );
  }

  return (
    <FormSections
      section={section}
      parts={{
        conector: (
          <Field label="Conector ERP" error={!connectorId ? 'Selecione um conector ERP.' : undefined}>
            <Select
              value={connectorId}
              onChange={(e) => handleConnectorChange(e.target.value)}
              disabled={loadingConnectors}
              isPlaceholder={!connectorId}
            >
              <option value="">
                {loadingConnectors ? 'Carregando conectores...' : 'Selecionar conector'}
              </option>
              {connectors
                .filter((c) => c.isActive)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </Field>
        ),
        operacao: connectorId ? (
          <>
            <Field label="Operação" error={!templateId ? 'Selecione a operação.' : undefined}>
              <Select
                value={templateId}
                onChange={(e) => {
                  const tpl = templates.find((t) => t.id === e.target.value);
                  set('templateId', e.target.value || undefined);
                  set('templateName', tpl?.name ?? undefined);
                  set('templateMethod', tpl?.method ?? undefined);
                }}
                disabled={loadingTemplates}
                isPlaceholder={!templateId}
              >
                <option value="">
                  {loadingTemplates ? 'Carregando operações...' : 'Selecionar operação'}
                </option>
                {templates
                  .filter((t) => t.isActive)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </Select>
            </Field>
            {selectedTemplate && (
              <EndpointPreview
                connector={d.connectorName ? String(d.connectorName) : undefined}
                method={selectedTemplate.method}
                path={selectedTemplate.endpointPath}
              />
            )}
          </>
        ) : (
          <p className="col-span-full text-[13px] text-tx-muted">Selecione um conector ERP.</p>
        ),
      }}
    />
  );
}

// ── LOPS IA form ───────────────────────────────────────────────────────

export function AiAgentActionForm({ d, set, section }: FormProps) {
  const { data: agents = [], isLoading, isError, error, refetch, isFetching } = useLopsAiAgentsQuery();

  const slug = String(d.agentSlug ?? '').trim();
  const selected = agents.find((agent) => agent.slug === slug);
  // Agente salvo no nó que não existe mais na lista (ex.: removido na LOPS IA): continua
  // visível no select em vez de o nó parecer "sem agente".
  const missingFromList = slug !== '' && !isLoading && !isError && !selected;

  function handleAgentChange(nextSlug: string) {
    const agent = agents.find((item) => item.slug === nextSlug);
    set('agentSlug', nextSlug || undefined);
    set('agentName', agent?.name ?? undefined);
  }

  return (
    <FormSections
      section={section}
      intro="Chama um agente da LOPS IA com a imagem do anexo do contexto (ex: vindo do gatilho 'Anexo enviado')."
      parts={{
        agente: (
          <>
            <Field
              label="Agente"
              hint={
                selected
                  ? `slug: ${selected.slug}${selected.model ? ` · modelo: ${selected.model}` : ''}`
                  : undefined
              }
              error={!slug && !isLoading && !isError ? 'Escolha o agente.' : undefined}
            >
              <Select
                aria-label="Agente"
                value={slug}
                onChange={(event) => handleAgentChange(event.target.value)}
                disabled={isLoading}
                isPlaceholder={!slug}
              >
                <option value="">{isLoading ? 'Carregando agentes...' : 'Selecionar agente'}</option>
                {missingFromList ? (
                  <option value={slug}>{`${String(d.agentName ?? slug)} (não encontrado na LOPS IA)`}</option>
                ) : null}
                {agents.map((agent) => (
                  <option key={agent.slug} value={agent.slug}>
                    {agent.name}
                  </option>
                ))}
              </Select>

              {isError ? (
                <div className="flex flex-wrap items-center gap-2">
                  <p role="alert" className="text-xs font-semibold text-nc-danger">
                    {getApiErrorMessage(error, 'Não foi possível carregar os agentes da LOPS IA.')}
                  </p>
                  <button
                    type="button"
                    onClick={() => void refetch()}
                    disabled={isFetching}
                    className="text-xs font-semibold text-nc-accent underline disabled:opacity-50"
                  >
                    {isFetching ? 'Tentando...' : 'Tentar novamente'}
                  </button>
                </div>
              ) : null}
            </Field>
            <Info text="A resposta é gravada para um nó de Condição (Valor da verificação) decidir a seguir, e o resultado também é salvo no próprio anexo. A URL da LOPS IA fica configurada no servidor; a chave de API é a que você informar aqui." />
          </>
        ),
        autenticacao: (
          <Field
            label="Chave de API"
            hint="Enviada no cabeçalho X-API-Key ao executar o agente. Armazenada no nó. A chave do servidor só é usada para listar os agentes."
            error={!String(d.apiKey ?? '').trim() ? 'Informe a chave de API.' : undefined}
          >
            <input
              className={inputCls}
              type="password"
              autoComplete="off"
              value={String(d.apiKey ?? '')}
              onChange={(e) => set('apiKey', e.target.value)}
              placeholder="••••••••"
            />
          </Field>
        ),
        mensagem: (
          <>
            <Field label="Mensagem" hint="Aceita variáveis. Padrão: 'Analise essa imagem.'">
              <textarea
                className={textareaCls}
                rows={4}
                value={String(d.message ?? '')}
                onChange={(e) => set('message', e.target.value)}
                placeholder="Analise essa imagem."
              />
            </Field>
            <Field
              half
              label="Timeout"
              hint="Padrão: o do servidor (LOPS_AI_TIMEOUT_MS, 30000 ms se não definido)."
            >
              <Input
                suffix="ms"
                type="number"
                min={1000}
                step={1000}
                aria-label="Timeout (ms)"
                value={String(d.timeoutMs ?? '')}
                onChange={(e) => set('timeoutMs', Number(e.target.value) || undefined)}
                placeholder="30000"
              />
            </Field>
          </>
        ),
      }}
    />
  );
}

function WaitForPhaseFieldsActionForm({
  d,
  formId,
  set,
}: {
  d: FlowNodeData;
  formId: string | null;
  set: (k: string, v: unknown) => void;
}) {
  const { data: phases = [], isLoading } = useKanbanPhasesQuery(formId);

  function handlePhaseChange(phaseId: string) {
    const phase = phases.find((p) => p.id === phaseId);
    set('phaseId', phaseId || undefined);
    set('phaseLabel', phase?.label ?? undefined);
  }

  return (
    <div className="grid gap-4">
      <Info text="Pausa a execução do fluxo até os campos desta fase serem salvos — use para encadear, num único fluxo, etapas separadas por ações manuais no meio (ex.: aprovar a foto da fase 1 e só depois pedir aprovação da quantidade apontada na fase 3)." />
      <Field label="Fase a aguardar" error={!d.phaseId ? 'Selecione a fase.' : undefined}>
        <Select
          value={String(d.phaseId ?? '')}
          onChange={(event) => handlePhaseChange(event.target.value)}
          disabled={!formId || isLoading}
        >
          <option value="">
            {!formId
              ? 'Fluxo sem formulário vinculado'
              : isLoading
                ? 'Carregando fases...'
                : 'Selecionar fase'}
          </option>
          {phases.map((phase) => (
            <option key={phase.id} value={phase.id}>
              {phase.label}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

function MovePhaseActionForm({
  d,
  formId,
  set,
}: {
  d: FlowNodeData;
  formId: string | null;
  set: (k: string, v: unknown) => void;
}) {
  const { data: phases = [], isLoading } = useKanbanPhasesQuery(formId);

  function handlePhaseChange(phaseId: string) {
    const phase = phases.find((p) => p.id === phaseId);
    set('phaseId', phaseId || undefined);
    set('phaseLabel', phase?.label ?? undefined);
  }

  return (
    <div className="grid gap-4">
      <Info text="Move a solicitação para esta fase do Kanban — reusa a mesma trava de aprovação já aplicada quando um humano move o card pela UI: só funciona se a fase atual não exigir aprovação, ou já tiver uma aprovação aprovada. Use logo depois de uma condição 'Resultado da aprovação' (ramo Sim) para fechar o ciclo automaticamente." />
      <Field label="Fase de destino" error={!d.phaseId ? 'Selecione a fase.' : undefined}>
        <Select
          value={String(d.phaseId ?? '')}
          onChange={(event) => handlePhaseChange(event.target.value)}
          disabled={!formId || isLoading}
        >
          <option value="">
            {!formId
              ? 'Fluxo sem formulário vinculado'
              : isLoading
                ? 'Carregando fases...'
                : 'Selecionar fase'}
          </option>
          {phases.map((phase) => (
            <option key={phase.id} value={phase.id}>
              {phase.label}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────

interface Props {
  node: Node;
  /** O grafo inteiro: as variáveis "Do gatilho" vêm dos nós anteriores no caminho. */
  nodes: Node[];
  edges: Edge[];
  formId: string | null;
  currentFlowId?: string | null;
  saveState?: SaveState;
  onClose: () => void;
  onUpdate: (nodeId: string, patch: Record<string, unknown>) => void;
  onDelete: (nodeId: string) => void;
}

export function NodeConfigPanel({
  node,
  nodes,
  edges,
  formId,
  currentFlowId,
  saveState,
  onClose,
  onUpdate,
  onDelete,
}: Props) {
  const type = node.type as string;
  const d = node.data as FlowNodeData;
  const variant = isCompactNodeType(type) ? 'compact' : 'full';

  const issues = getNodeIssues(type, d);
  const sections = getNodeSections(type);
  const issuesBySection = groupIssuesBySection(sections, issues);
  const { active, select, prev, next } = useActiveSection(node.id, sections, issuesBySection);
  const section = active.implicit ? undefined : active.id;
  // Nome do formulário para o resumo da etapa "Origem" (mesma query, já em cache, do formulário).
  const { data: forms = [] } = useForms(type === 'trigger_form_submit');
  const { data: endpoints = [] } = useWebhookEndpointsQuery(type === 'trigger_webhook_received');
  const summaryContext = {
    formName: forms.find((form) => form.id === d.formId)?.name,
    endpointName: endpoints.find((endpoint) => endpoint.id === d.endpointId)?.name,
  };
  const [asideOpen, setAsideOpen] = useState(false);
  const variableGroups = useMemo(
    () => buildVariableGroups(node.id, nodes, edges, nodeDisplayName),
    [node.id, nodes, edges],
  );
  const previewInput = getPreviewInput(type, d);

  function set(key: string, value: unknown) {
    onUpdate(node.id, { [key]: value });
  }

  const form = (
    <>
      {type === 'trigger_form_submit' && <TriggerForm d={d} set={set} section={section} />}
      {type === 'trigger_webhook_received' && (
        <WebhookReceivedTriggerForm d={d} set={set} section={section} />
      )}
      {type === 'trigger_solicitation_created' && (
        <SolicitationCreatedTriggerForm d={d} set={set} />
      )}
      {type === 'trigger_solicitation_moved' && <SolicitationMovedTriggerForm d={d} set={set} />}
      {type === 'trigger_approval_completed' && (
        <ApprovalCompletedTriggerForm d={d} set={set} section={section} formId={formId} />
      )}
      {type === 'trigger_sla_warning' && (
        <SlaTriggerForm
          d={d}
          set={set}
          section={section}
          formId={formId}
          intro="Dispara quando o prazo atinge o percentual de alerta: o do SLA geral (configurações do sistema) ou o da fase (configuração da fase)."
        />
      )}
      {type === 'trigger_sla_breached' && (
        <SlaTriggerForm
          d={d}
          set={set}
          section={section}
          formId={formId}
          intro="Dispara quando o prazo vence — o SLA geral da solicitação ou o prazo de uma fase do Kanban. Use para avisar responsáveis ou escalar automaticamente."
        />
      )}
      {type === 'trigger_scheduled' && <ScheduledTriggerForm d={d} set={set} section={section} />}
      {type === 'trigger_attachment_uploaded' && (
        <AttachmentUploadedTriggerForm d={d} set={set} />
      )}
      {type === 'trigger_phase_field_saved' && (
        <PhaseFieldSavedTriggerForm d={d} set={set} />
      )}
      {type === 'trigger_phase_entered' && <PhaseEnteredTriggerForm d={d} set={set} formId={formId} />}

      {type === 'condition_always_true' && <AlwaysTrueConditionForm section={section} />}
      {type === 'condition_field_value' && (
        <ConditionForm d={d} formId={formId} set={set} section={section} />
      )}
      {type === 'condition_solicitation_status' && (
        <SolicitationStatusConditionForm d={d} set={set} />
      )}
      {type === 'condition_solicitation_priority' && (
        <SolicitationPriorityConditionForm d={d} set={set} />
      )}
      {type === 'condition_response_value' && <ResponseValueConditionForm d={d} set={set} />}
      {type === 'condition_approval_result' && <ApprovalResultConditionForm d={d} set={set} />}

      {type === 'action_send_email' && (
        <EmailForm d={d} formId={formId} set={set} section={section} />
      )}
      {type === 'action_webhook' && <WebhookForm d={d} set={set} section={section} />}
      {type === 'action_http_check' && <HttpCheckForm d={d} set={set} section={section} />}
      {type === 'action_notification' && (
        <NotificationActionForm d={d} formId={formId} set={set} section={section} />
      )}
      {type === 'action_notify_users' && <NotifyForm d={d} set={set} />}
      {type === 'action_google_sheets' && <SheetsForm d={d} set={set} />}
      {(type === 'action_update_solicitation_status' || type === 'action_move_kanban_card') && (
        <SolicitationStatusActionForm d={d} set={set} />
      )}
      {type === 'action_create_approval' && (
        <ApprovalActionForm d={d} formId={formId} set={set} section={section} />
      )}
      {type === 'action_create_solicitation_from_payload' && (
        <SolicitationFromPayloadForm d={d} set={set} />
      )}
      {type === 'action_forward_to_process' && (
        <ForwardToProcessForm d={d} flowFormId={formId} set={set} />
      )}
      {type === 'action_assign_responsible' && <ResponsibleActionForm d={d} set={set} />}
      {type === 'action_send_whatsapp' && (
        <WhatsAppActionForm d={d} formId={formId} set={set} />
      )}
      {type === 'action_erp_operation' && <ErpOperationForm d={d} set={set} section={section} />}
      {type === 'action_ai_agent' && <AiAgentActionForm d={d} set={set} section={section} />}
      {type === 'action_wait_for_phase_fields' && (
        <WaitForPhaseFieldsActionForm d={d} formId={formId} set={set} />
      )}
      {type === 'action_move_phase' && (
        <MovePhaseActionForm d={d} formId={formId} set={set} />
      )}
      {type === 'action_run_flow' && (
        <RunFlowForm d={d} set={set} currentFlowId={currentFlowId} />
      )}
    </>
  );

  if (variant === 'compact') {
    // Painel compacto (nós de 0–3 campos): descrição sem caixa, os campos e as variáveis do nó.
    const main = sections[0];
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <NodeConfigHeader
          type={type}
          alias={String(d.label ?? '')}
          onAliasChange={(value) => set('label', value)}
          onClose={onClose}
          variant="compact"
        />
        <div className="admin-scroll grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-5 pb-5 pt-1">
          {main.description && (
            <p className="text-[13px] leading-[1.5] text-tx-secondary">{main.description}</p>
          )}
          {main.fields.length > 0 && form}
          <CompactVariables items={NODE_OUTPUTS[type]?.vars ?? []} />
        </div>
        <NodeConfigFooter
          variant="compact"
          onDelete={() => onDelete(node.id)}
          onClose={onClose}
          saveState={saveState}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <NodeConfigHeader
        type={type}
        alias={String(d.label ?? '')}
        onAliasChange={(value) => set('label', value)}
        issueCount={issues.length}
        saveState={saveState}
        asideToggle={{ open: asideOpen, onToggle: () => setAsideOpen((open) => !open) }}
        onClose={onClose}
        variant="full"
      />

      <NodeConfigBody
        nav={
          sections.length > 1 ? (
            <SectionNav
              sections={sections}
              activeId={active.id}
              issuesBySection={issuesBySection}
              d={d}
              summaryContext={summaryContext}
              onSelect={select}
            />
          ) : undefined
        }
        section={active}
        aside={
          <NodeAside
            groups={variableGroups}
            formId={formId}
            preview={previewInput ? <MessagePreview input={previewInput} formId={formId} /> : undefined}
          />
        }
        asideOpen={asideOpen}
      >
        {form}
      </NodeConfigBody>

      <NodeConfigFooter
        variant="full"
        onDelete={() => onDelete(node.id)}
        onClose={onClose}
        onPrev={prev}
        onNext={next}
        saveState={saveState}
      />
    </div>
  );
}

/** Nome do nó nos grupos de variáveis: o alias, ou o nome do tipo. */
function nodeDisplayName(node: { type?: string; data?: unknown }): string {
  const alias = String((node.data as FlowNodeData | undefined)?.label ?? '').trim();
  return alias || (NODE_META[node.type ?? ''] ?? FALLBACK_META).label;
}
