import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  AlertTriangle,
  Bell,
  BellRing,
  Bot,
  ClipboardCheck,
  Database,
  GitMerge,
  Globe,
  Hourglass,
  Kanban,
  Link2,
  Mail,
  MessageCircle,
  PackagePlus,
  Sheet,
  UserPlus,
  Forward,
} from 'lucide-react';
import type { FlowNodeData } from '../types/flow.types';
import { getNotificationConfigError, summarizeNotification } from '../lib/notification-config';
import { isApproverSourceConfigured } from '../lib/flow-validation';
import { useFlowCanvasCtx } from '../context/FlowCanvasContext';
import { useTheme } from '../../../hooks/use-theme';

// ── Category color / label maps ────────────────────────────────────────────

/** Accent color by action type (spec §PARTE F) */
const ACCENT: Record<string, string> = {
  action_send_email:                   '#4F6EF7',
  action_notify_users:                 '#4F6EF7',
  action_send_whatsapp:                '#4F6EF7',
  action_update_solicitation_status:   '#16A34A',
  action_move_kanban_card:             '#16A34A',
  action_create_approval:              '#16A34A',
  action_create_solicitation_from_payload: '#16A34A',
  action_forward_to_process:           '#16A34A',
  action_assign_responsible:           '#16A34A',
  action_webhook:                      '#B06EFF',
  action_http_check:                   '#B06EFF',
  action_google_sheets:                '#B06EFF',
  action_erp_operation:                '#B06EFF',
  action_ai_agent:                     '#B06EFF',
  action_wait_for_phase_fields:        '#16A34A',
  action_move_phase:                   '#16A34A',
  action_run_flow:                     '#7C3AED',
  action_notification:                 '#4F6EF7',
};

const CATEGORY_LABEL: Record<string, string> = {
  action_send_email:                   'COMUNICAÇÃO',
  action_notify_users:                 'COMUNICAÇÃO',
  action_send_whatsapp:                'COMUNICAÇÃO',
  action_update_solicitation_status:   'SOLICITAÇÃO',
  action_move_kanban_card:             'SOLICITAÇÃO',
  action_create_approval:              'SOLICITAÇÃO',
  action_create_solicitation_from_payload: 'SOLICITAÇÃO',
  action_forward_to_process:           'SOLICITAÇÃO',
  action_assign_responsible:           'SOLICITAÇÃO',
  action_webhook:                      'INTEGRAÇÃO',
  action_http_check:                   'INTEGRAÇÃO',
  action_google_sheets:                'INTEGRAÇÃO',
  action_erp_operation:                'INTEGRAÇÃO',
  action_ai_agent:                     'INTEGRAÇÃO',
  action_wait_for_phase_fields:        'SOLICITAÇÃO',
  action_move_phase:                   'SOLICITAÇÃO',
  action_run_flow:                     'SUB-FLUXO',
  action_notification:                 'COMUNICAÇÃO',
};

// ── Node config (label, icon, isConfigured, summary) ──────────────────────

type Cfg = {
  label: string;
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  isConfigured: (d: FlowNodeData) => boolean;
  summary: (d: FlowNodeData) => string;
};

const CONFIG: Record<string, Cfg> = {
  action_send_email: {
    label: 'Enviar E-mail',
    Icon: Mail,
    isConfigured: (d) => !!d.toEmail,
    summary: (d) => (d.toEmail ? String(d.toEmail) : 'Configurar...'),
  },
  action_webhook: {
    label: 'Webhook',
    Icon: Link2,
    isConfigured: (d) => !!d.webhookUrl,
    summary: (d) => {
      if (!d.webhookUrl) return 'Configurar...';
      const url = String(d.webhookUrl);
      return url.length > 28 ? `${url.slice(0, 28)}…` : url;
    },
  },
  action_http_check: {
    label: 'Verificação HTTP',
    Icon: Globe,
    isConfigured: (d) => !!String(d.url ?? '').trim(),
    summary: (d) => {
      if (!d.url) return 'Configurar...';
      const url = String(d.url);
      return url.length > 28 ? `${url.slice(0, 28)}…` : url;
    },
  },
  action_notify_users: {
    label: 'Notificar Usuários',
    Icon: Bell,
    isConfigured: (d) => !!d.message,
    summary: (d) => {
      if (!d.message) return 'Configurar...';
      const m = String(d.message);
      return m.length > 30 ? `${m.slice(0, 30)}…` : m;
    },
  },
  action_google_sheets: {
    label: 'Google Sheets',
    Icon: Sheet,
    isConfigured: (d) => !!d.spreadsheetId,
    summary: (d) =>
      d.sheetName
        ? String(d.sheetName)
        : d.spreadsheetId
          ? 'Planilha conectada'
          : 'Configurar...',
  },
  action_update_solicitation_status: {
    label: 'Atualizar Status',
    Icon: Kanban,
    isConfigured: (d) => !!d.status,
    summary: (d) => (d.status ? `→ ${String(d.status)}` : 'Configurar...'),
  },
  action_move_kanban_card: {
    label: 'Mover Card',
    Icon: Kanban,
    isConfigured: (d) => !!d.status,
    summary: (d) => (d.status ? `→ ${String(d.status)}` : 'Configurar...'),
  },
  action_create_approval: {
    label: 'Criar Aprovação',
    Icon: ClipboardCheck,
    isConfigured: (d) => !!String(d.title ?? '').trim() && isApproverSourceConfigured(d),
    summary: (d) => (d.title ? String(d.title) : 'Configurar...'),
  },
  action_create_solicitation_from_payload: {
    label: 'Criar Solicitação',
    Icon: PackagePlus,
    isConfigured: (d) =>
      !!String(d.titleTemplate ?? '').trim() || !!String(d.titlePath ?? '').trim(),
    summary: (d) => {
      const title = String(d.titleTemplate ?? '').trim() || String(d.titlePath ?? '').trim();
      if (!title) return 'Configurar...';
      const prazo = d.dueInMonths
        ? ` · vence em ${String(d.dueInMonths)} mês(es)`
        : d.dueInDays
          ? ` · vence em ${String(d.dueInDays)} dia(s)`
          : '';
      return `${title}${prazo}`;
    },
  },
  action_forward_to_process: {
    label: 'Encaminhar para processo',
    Icon: Forward,
    isConfigured: (d) => !!String(d.formId ?? '').trim(),
    summary: (d) => {
      if (!String(d.formId ?? '').trim()) return 'Escolha o processo de destino';
      const mapped = Array.isArray(d.fieldMappings) ? d.fieldMappings.length : 0;
      const auto = d.autoMatchByCode !== false ? 'campos de mesmo código' : '';
      const parts = [auto, mapped > 0 ? `${mapped} campo(s) mapeado(s)` : ''].filter(Boolean);
      return parts.length > 0 ? `Leva ${parts.join(' + ')}` : 'Sem respostas copiadas';
    },
  },
  action_assign_responsible: {
    label: 'Atribuir Responsável',
    Icon: UserPlus,
    isConfigured: (d) => !!d.userId,
    summary: (d) =>
      d.userName
        ? String(d.userName)
        : d.userId
          ? 'Responsável definido'
          : 'Configurar...',
  },
  action_send_whatsapp: {
    label: 'Enviar WhatsApp',
    Icon: MessageCircle,
    isConfigured: (d) =>
      !!String(d.message ?? '').trim() &&
      (d.recipientType !== 'custom' || !!String(d.customPhone ?? '').trim()),
    summary: (d) => {
      const who =
        d.recipientType === 'custom'
          ? maskPhone(String(d.customPhone ?? ''))
          : d.recipientType === 'responsible'
            ? 'Responsável'
            : 'Solicitante';
      const msg = String(d.message ?? '').trim();
      const prev = msg.length > 22 ? `${msg.slice(0, 22)}…` : msg;
      return prev ? `${who} · ${prev}` : 'Configurar...';
    },
  },
  action_erp_operation: {
    label: 'Operação ERP',
    Icon: Database,
    isConfigured: (d) => !!d.connectorId && !!d.templateId,
    summary: () => 'Configurar conector...',
  },
  action_notification: {
    label: 'Notificação',
    Icon: BellRing,
    isConfigured: (d) => getNotificationConfigError(d) === null,
    summary: (d) => summarizeNotification(d),
  },
  action_run_flow: {
    label: 'Chamar Fluxo',
    Icon: GitMerge,
    isConfigured: (d) => !!d.flowId,
    summary: (d) =>
      d.flowName ? String(d.flowName) : d.flowId ? 'Fluxo configurado' : 'Configurar...',
  },
  action_ai_agent: {
    label: 'Agente de IA',
    Icon: Bot,
    // A URL vem do servidor; o agente (escolhido na lista) e a chave de API são por nó.
    isConfigured: (d) => !!String(d.agentSlug ?? '').trim() && !!String(d.apiKey ?? '').trim(),
    summary: (d) =>
      d.agentName ? String(d.agentName) : d.agentSlug ? String(d.agentSlug) : 'Configurar...',
  },
  action_wait_for_phase_fields: {
    label: 'Aguardar campos de fase',
    Icon: Hourglass,
    isConfigured: (d) => !!String(d.phaseId ?? '').trim(),
    summary: (d) =>
      d.phaseLabel ? String(d.phaseLabel) : d.phaseId ? 'Fase configurada' : 'Configurar...',
  },
  action_move_phase: {
    label: 'Mover para fase',
    Icon: Kanban,
    isConfigured: (d) => !!String(d.phaseId ?? '').trim(),
    summary: (d) =>
      d.phaseLabel ? `→ ${String(d.phaseLabel)}` : d.phaseId ? 'Fase configurada' : 'Configurar...',
  },
};

const FALLBACK: Cfg = {
  label: 'Ação',
  Icon: Link2,
  isConfigured: () => false,
  summary: () => 'Configurar...',
};

// ── Exec ring ──────────────────────────────────────────────────────────────

const EXEC_GLOW: Record<string, string> = {
  success: '#16A34A',
  failed:  '#DC2626',
  skipped: '#94a3b8',
};

// ── Helpers ────────────────────────────────────────────────────────────────

function maskPhone(value: string): string {
  const p = value.trim();
  if (!p) return 'número';
  if (p.length <= 4) return '****';
  return `${p.slice(0, 3)}…${p.slice(-2)}`;
}

function emailRecipients(value: unknown): string[] {
  return String(value ?? '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
}

// ── Component ──────────────────────────────────────────────────────────────

export function ActionNode({ id, data, type, selected }: NodeProps) {
  const d         = data as FlowNodeData;
  const nodeType  = type as string;
  const { isDark } = useTheme();
  const { executionStatus, problematicNodeIds } = useFlowCanvasCtx();

  const execStatus  = executionStatus?.[id];
  const isProblematic = problematicNodeIds.has(id);
  const dimmed      = executionStatus !== null && execStatus === undefined;

  const { label, Icon, isConfigured, summary } = CONFIG[nodeType] ?? FALLBACK;
  const ok = isConfigured(d);

  const accent       = ACCENT[nodeType] ?? '#6B7280';
  const categoryText = CATEGORY_LABEL[nodeType] ?? 'AÇÃO';
  const execColor    = execStatus ? EXEC_GLOW[execStatus] : null;
  const accentColor  = execColor ?? (ok && !isProblematic ? accent : '#DC2626');

  const summaryText = d.label ? String(d.label) : summary(d);

  // Build box-shadow
  const baseShadow = isDark
    ? '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)'
    : '0 4px 16px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.8)';
  const selectedShadow = selected ? `, 0 0 0 2px ${accentColor}80` : '';
  const execShadow = execColor ? `, 0 0 0 2px ${execColor}70` : '';
  const boxShadow = baseShadow + selectedShadow + execShadow;

  // Email special rendering
  const isEmail = nodeType === 'action_send_email';
  const recipients = isEmail ? emailRecipients(d.toEmail) : [];
  const visibleRecipients = recipients.slice(0, 3);
  const hiddenCount = Math.max(0, recipients.length - visibleRecipients.length);

  // ERP special
  const isErp = nodeType === 'action_erp_operation';

  // Run-flow special
  const isRunFlow = nodeType === 'action_run_flow';

  return (
    <div
      className="glass-node-action"
      style={{
        minWidth: 200,
        borderRadius: 10,
        border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
        borderLeft: `3px solid ${accentColor}`,
        background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.92)',
        backdropFilter: isDark ? 'blur(16px)' : 'none',
        WebkitBackdropFilter: isDark ? 'blur(16px)' : 'none',
        boxShadow,
        opacity: dimmed ? 0.3 : 1,
        transition: 'opacity 0.2s, box-shadow 0.15s',
        cursor: 'default',
        position: 'relative',
        padding: '10px 12px 10px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        title="Entrada da ação"
      />

      {/* Category label */}
      <div
        style={{
          fontFamily: 'ui-monospace, "Courier New", monospace',
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '2px',
          color: accentColor,
          lineHeight: 1,
        }}
      >
        {categoryText}
      </div>

      {/* Icon + action name row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: `${accentColor}18`,
            border: `1px solid ${accentColor}25`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon style={{ width: 14, height: 14, color: accentColor }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "'Sora', Inter, sans-serif",
              fontSize: 13,
              fontWeight: 600,
              color: isDark ? '#ffffff' : '#0d1d29',
              lineHeight: 1.2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {d.label ? String(d.label) : label}
          </div>
        </div>

        {/* Warning badge */}
        {(!ok || isProblematic) && !execStatus && (
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: 'rgba(220,38,38,0.15)',
              border: '1px solid rgba(220,38,38,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <AlertTriangle style={{ width: 9, height: 9, color: '#DC2626' }} />
          </div>
        )}
      </div>

      {/* Subtitle / detail area */}
      {ok && !d.label ? (
        isEmail ? (
          /* Email: show each recipient */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {visibleRecipients.map((r) => (
              <div
                key={r}
                style={{
                  fontSize: 11,
                  color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.5)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={r}
              >
                {r}
              </div>
            ))}
            {hiddenCount > 0 && (
              <div style={{ fontSize: 10, color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.35)' }}>
                + {hiddenCount} destinatário{hiddenCount > 1 ? 's' : ''}
              </div>
            )}
          </div>
        ) : isErp ? (
          /* ERP: connector + template */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div
              style={{
                fontSize: 11,
                color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.5)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {d.connectorName ? String(d.connectorName) : 'Conector configurado'}
            </div>
            {d.templateName && (
              <div
                style={{
                  fontSize: 10,
                  color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.35)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {String(d.templateName)}
              </div>
            )}
            {d.templateMethod && (
              <span
                style={{
                  display: 'inline-block',
                  alignSelf: 'flex-start',
                  padding: '1px 5px',
                  borderRadius: 4,
                  fontSize: 9,
                  fontWeight: 700,
                  fontFamily: 'ui-monospace, monospace',
                  background:
                    String(d.templateMethod) === 'GET'
                      ? 'rgba(22,163,74,0.15)'
                      : 'rgba(79,110,247,0.15)',
                  color:
                    String(d.templateMethod) === 'GET' ? '#16A34A' : '#4F6EF7',
                }}
              >
                {String(d.templateMethod)}
              </span>
            )}
          </div>
        ) : isRunFlow ? (
          /* Run-flow: name + mode */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div
              style={{
                fontSize: 11,
                color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.5)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {d.flowName ? String(d.flowName) : 'Fluxo configurado'}
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <span
                style={{
                  padding: '1px 5px',
                  borderRadius: 4,
                  fontSize: 9,
                  fontWeight: 700,
                  fontFamily: 'ui-monospace, monospace',
                  background:
                    d.mode === 'async'
                      ? 'rgba(240,165,0,0.15)'
                      : 'rgba(79,110,247,0.15)',
                  color: d.mode === 'async' ? '#F0A500' : '#4F6EF7',
                }}
              >
                {d.mode === 'async' ? 'Async' : 'Sync'}
              </span>
              {d.passContext !== false && (
                <span
                  style={{
                    padding: '1px 5px',
                    borderRadius: 4,
                    fontSize: 9,
                    fontWeight: 700,
                    fontFamily: 'ui-monospace, monospace',
                    background: 'rgba(124,58,237,0.15)',
                    color: '#7C3AED',
                  }}
                >
                  Ctx
                </span>
              )}
            </div>
          </div>
        ) : (
          /* Generic subtitle */
          <div
            style={{
              fontSize: 12,
              color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.5)',
              lineHeight: 1.3,
              overflowWrap: 'anywhere',
            }}
          >
            {summaryText}
          </div>
        )
      ) : !ok ? (
        /* Not configured footer */
        <div
          style={{
            fontSize: 11,
            color: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.3)',
            fontStyle: 'italic',
          }}
        >
          Configurar...
        </div>
      ) : null}

      <Handle
        type="source"
        position={Position.Right}
        title="Arraste para conectar"
      />
    </div>
  );
}
