import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  AlertTriangle,
  ArrowDownToLine,
  CheckSquare,
  Clock,
  ClipboardCheck,
  ExternalLink,
  Kanban,
  Network,
  Paperclip,
  Save,
  LogIn,
  Timer,
  Zap,
} from 'lucide-react';
import { useFlowCanvasCtx } from '../context/FlowCanvasContext';
import { SOLICITATION_ORIGIN_LABELS, type FlowNodeData } from '../types/flow.types';
import { useTheme } from '../../../hooks/use-theme';

// ── Constants ──────────────────────────────────────────────────────────────

const CYAN = '#00C9D4';
const RED  = '#DC2626';

const EXEC_GLOW: Record<string, string> = {
  success: '#16A34A',
  failed:  '#DC2626',
  skipped: '#94a3b8',
};

const TRIGGER_CONFIG: Record<
  string,
  {
    title: string;
    subtitle: string;
    Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  }
> = {
  trigger_form_submit: {
    title: 'Formulário submetido',
    subtitle: 'início do fluxo',
    Icon: Zap,
  },
  trigger_webhook_received: {
    title: 'Webhook recebido',
    subtitle: 'integração de entrada',
    Icon: ArrowDownToLine,
  },
  trigger_solicitation_created: {
    title: 'Solicitação criada',
    subtitle: 'nova solicitação operacional',
    Icon: Network,
  },
  trigger_solicitation_moved: {
    title: 'Card movido no Kanban',
    subtitle: 'mudança de coluna',
    Icon: Kanban,
  },
  trigger_approval_completed: {
    title: 'Aprovação concluída',
    subtitle: 'aprovada ou reprovada',
    Icon: ClipboardCheck,
  },
  trigger_sla_warning: {
    title: 'SLA em Alerta',
    subtitle: 'prazo próximo do vencimento',
    Icon: AlertTriangle,
  },
  trigger_sla_breached: {
    title: 'SLA Vencido',
    subtitle: 'prazo excedido',
    Icon: Clock,
  },
  trigger_approval_created: {
    title: 'Aprovação criada',
    subtitle: 'início do processo de aprovação',
    Icon: CheckSquare,
  },
  trigger_scheduled: {
    title: 'Agendado',
    subtitle: 'roda sozinho por intervalo ou cron',
    Icon: Timer,
  },
  trigger_attachment_uploaded: {
    title: 'Anexo enviado',
    subtitle: 'imagem enviada em uma submissão',
    Icon: Paperclip,
  },
  trigger_phase_field_saved: {
    title: 'Campos de fase salvos',
    subtitle: 'apontamento salvo em uma fase do Kanban',
    Icon: Save,
  },
  trigger_phase_entered: {
    title: 'Entrou na fase',
    subtitle: 'card movido para uma fase do Kanban',
    Icon: LogIn,
  },
};

// ── Summary ────────────────────────────────────────────────────────────────

function triggerSummary(type: string, d: FlowNodeData, formName: string | null): string {
  if (type === 'trigger_form_submit') return formName ?? 'Qualquer formulário';
  if (type === 'trigger_webhook_received') {
    const endpoint = d.endpointId ? 'Endpoint específico' : 'Qualquer endpoint';
    const split = String(d.splitItemsPath ?? '').trim();
    return split ? `${endpoint} · um por item de "${split}"` : endpoint;
  }
  if (type === 'trigger_solicitation_created') {
    const form = formName ?? 'Qualquer formulário';
    const origins = (d.originTypes ?? []).map((origin) => SOLICITATION_ORIGIN_LABELS[origin] ?? origin);
    return origins.length > 0 ? `${form} · ${origins.join(', ')}` : form;
  }
  if (type === 'trigger_solicitation_moved') {
    const from = d.fromStatus ? String(d.fromStatus) : 'qualquer';
    const to   = d.toStatus   ? String(d.toStatus)   : 'qualquer';
    return `${from} → ${to}`;
  }
  if (type === 'trigger_approval_completed') {
    if (d.result === 'approved') return 'Somente aprovada';
    if (d.result === 'rejected') return 'Somente reprovada';
    return 'Qualquer resultado';
  }
  if (type === 'trigger_scheduled') {
    if (d.mode === 'cron') return d.cronExpression ? String(d.cronExpression) : 'Configurar...';
    if (d.intervalValue && d.intervalUnit) {
      const unitLabel =
        d.intervalUnit === 'minutes' ? 'min' : d.intervalUnit === 'hours' ? 'h' : 'dia(s)';
      return `A cada ${d.intervalValue} ${unitLabel}`;
    }
    return 'Configurar...';
  }
  if (type === 'trigger_attachment_uploaded') {
    return d.fieldCode ? `Campo: ${String(d.fieldCode)}` : 'Qualquer campo de imagem';
  }
  if (type === 'trigger_phase_field_saved') {
    return d.phaseId ? 'Fase específica' : 'Qualquer fase';
  }
  if (type === 'trigger_phase_entered') {
    if (d.phaseId && d.fromPhaseId) return 'Fase específica, vindo de outra';
    return d.phaseId ? 'Fase específica' : 'Qualquer fase';
  }
  if (type === 'trigger_approval_completed' && d.phaseId) return 'Aprovação de uma fase';
  if (type === 'trigger_sla_warning' || type === 'trigger_sla_breached') {
    if (d.slaScope !== 'phase') return 'SLA geral da solicitação';
    return d.phaseId ? 'Prazo de uma fase' : 'Prazo de qualquer fase';
  }
  return '';
}

// ── Component ──────────────────────────────────────────────────────────────

export function TriggerNode({ id, data, type, selected }: NodeProps) {
  const d = data as FlowNodeData;
  const nodeType = String(type ?? 'trigger_form_submit');
  const { isDark } = useTheme();
  const {
    executionStatus,
    problematicNodeIds,
    availableForms,
    onOpenLinkedForm,
  } = useFlowCanvasCtx();

  const execStatus = executionStatus?.[id];
  const isProblematic = problematicNodeIds.has(id);
  const dimmed = executionStatus !== null && execStatus === undefined;

  const selectedFormId = (d.formId as string | null | undefined) ?? null;
  const selectedForm   = availableForms.find((f) => f.id === selectedFormId) ?? null;

  const cfg = TRIGGER_CONFIG[nodeType] ?? TRIGGER_CONFIG.trigger_form_submit;
  const { title, subtitle, Icon } = cfg;

  // Is the node fully configured?
  const isConfigured =
    nodeType === 'trigger_form_submit'
      ? !!selectedFormId
      : nodeType === 'trigger_solicitation_created'
        ? true
        : nodeType === 'trigger_solicitation_moved'
          ? !!d.fromStatus || !!d.toStatus
          : nodeType === 'trigger_approval_completed'
            ? true
            : nodeType === 'trigger_webhook_received'
              ? true
              : nodeType === 'trigger_scheduled'
                ? d.mode === 'cron'
                  ? !!String(d.cronExpression ?? '').trim()
                  : !!d.intervalValue && !!d.intervalUnit
                : nodeType === 'trigger_attachment_uploaded'
                  ? true
                  : nodeType === 'trigger_phase_field_saved'
                    ? true
                    : true;

  // Execution state overrides
  const execColor = execStatus ? EXEC_GLOW[execStatus] : null;
  const borderColor = execColor ?? (isConfigured && !isProblematic ? CYAN : RED);

  // Build box-shadow layers
  const glowShadow = `0 0 20px ${borderColor}30`;
  const borderShadow = `0 0 0 1px ${borderColor}${isConfigured ? '60' : 'aa'}`;
  const selectedShadow = selected ? `, 0 0 0 3px ${borderColor}90` : '';
  const execRingShadow = execColor ? `, 0 0 0 3px ${execColor}80` : '';

  const boxShadow = [
    isDark ? '0 8px 32px rgba(0,0,0,0.4)' : '0 4px 16px rgba(0,0,0,0.12)',
    isDark ? 'inset 0 1px 0 rgba(255,255,255,0.08)' : 'inset 0 1px 0 rgba(255,255,255,0.6)',
    glowShadow,
    borderShadow,
    selectedShadow,
    execRingShadow,
  ]
    .filter(Boolean)
    .join(', ');

  // Pulsing animation for unconfigured state
  const animation = !isConfigured && !execStatus
    ? 'flow-node-pulse 2s ease-in-out infinite'
    : undefined;

  const summary = triggerSummary(nodeType, d, selectedForm?.name ?? null);

  return (
    <div
      className="glass-node-trigger"
      style={{
        minWidth: 220,
        minHeight: 64,
        borderRadius: 10,
        padding: '10px 16px 10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        background: isDark ? 'rgba(0,201,212,0.07)' : 'rgba(0,201,212,0.10)',
        backdropFilter: isDark ? 'blur(16px)' : 'none',
        WebkitBackdropFilter: isDark ? 'blur(16px)' : 'none',
        border: `1px solid ${borderColor}60`,
        boxShadow,
        opacity: dimmed ? 0.3 : 1,
        transition: 'opacity 0.2s',
        animation,
        cursor: 'default',
        position: 'relative',
      }}
    >
      {/* Main row: icon + text */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Icon circle */}
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'rgba(0,201,212,0.15)',
            border: '1px solid rgba(0,201,212,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon style={{ color: CYAN, width: 18, height: 18 }} />
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'ui-monospace, "Courier New", monospace',
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '3px',
              color: CYAN,
              lineHeight: 1,
              marginBottom: 3,
            }}
          >
            GATILHO
          </div>
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
            {d.label ? String(d.label) : title}
          </div>
          <div
            style={{
              fontSize: 11,
              color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.45)',
              lineHeight: 1.2,
              marginTop: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {subtitle}
          </div>
        </div>

        {/* Warning badge (unconfigured) */}
        {!isConfigured && !execStatus && (
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: 'rgba(220,38,38,0.2)',
              border: '1px solid rgba(220,38,38,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <AlertTriangle style={{ width: 10, height: 10, color: RED }} />
          </div>
        )}
      </div>

      {/* Summary line */}
      {summary && (
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: `${CYAN}cc`,
            paddingLeft: 46,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {summary}
        </div>
      )}

      {/* "Ver formulário" button */}
      {selectedForm && (
        <div
          className="nodrag"
          style={{ paddingLeft: 46, marginTop: 2 }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => onOpenLinkedForm(selectedForm.id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              height: 24,
              padding: '0 8px',
              borderRadius: 100,
              background: 'rgba(0,201,212,0.12)',
              border: '1px solid rgba(0,201,212,0.3)',
              color: CYAN,
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <ExternalLink style={{ width: 10, height: 10 }} />
            Ver formulário
          </button>
        </div>
      )}

      {/* Source handle — right center */}
      <Handle
        type="source"
        position={Position.Right}
        title="Arraste para conectar"
      />
    </div>
  );
}
