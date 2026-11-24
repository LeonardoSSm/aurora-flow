import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AlertTriangle, GitBranch } from 'lucide-react';
import type { FlowNodeData } from '../types/flow.types';
import { useFlowCanvasCtx } from '../context/FlowCanvasContext';
import { useTheme } from '../../../hooks/use-theme';

// ── Constants ──────────────────────────────────────────────────────────────

const AMBER  = '#F0A500';
const GREEN  = '#16A34A';
const RED    = '#DC2626';

const OPERATOR_LABELS: Record<string, string> = {
  equals:       '=',
  not_equals:   '≠',
  contains:     'contém',
  greater_than: '>',
  less_than:    '<',
  is_empty:     'vazio',
  is_not_empty: 'não vazio',
};

const STATUS_LABELS: Record<string, string> = {
  open:                'Aberta',
  waiting:             'Aguardando',
  resolved:            'Resolvida',
  canceled:            'Cancelada',
  new:                 'Nova',
  in_analysis:         'Em análise',
  waiting_approval:    'Ag. aprovação',
  in_progress:         'Em execução',
  approved:            'Aprovada',
  rejected:            'Reprovada',
  waiting_integration: 'Ag. integração',
  completed:           'Concluída',
  cancelled:           'Cancelada',
};

const PRIORITY_LABELS: Record<string, string> = {
  low:      'Baixa',
  medium:   'Média',
  high:     'Alta',
  urgent:   'Crítica',
  critical: 'Crítica',
};

const APPROVAL_RESULT_LABELS: Record<string, string> = {
  approved: 'Aprovada',
  rejected: 'Reprovada',
};

const EXEC_GLOW: Record<string, string> = {
  success: GREEN,
  failed:  RED,
  skipped: '#94a3b8',
};

// ── Summary ────────────────────────────────────────────────────────────────

function buildSummary(
  type: string | undefined,
  d: FlowNodeData,
): { line1: string; line2?: string } {
  const t = String(type ?? '');
  if (t === 'condition_always_true') return { line1: 'Sempre verdadeiro' };

  if (t === 'condition_solicitation_status') {
    const op = d.operator ? (OPERATOR_LABELS[d.operator] ?? d.operator) : '=';
    if (!d.value) return { line1: 'Status', line2: 'Configurar...' };
    return {
      line1: 'Status',
      line2: `${op} ${STATUS_LABELS[String(d.value)] ?? String(d.value)}`,
    };
  }

  if (t === 'condition_solicitation_priority') {
    const op = d.operator ? (OPERATOR_LABELS[d.operator] ?? d.operator) : '=';
    if (!d.value) return { line1: 'Prioridade', line2: 'Configurar...' };
    return {
      line1: 'Prioridade',
      line2: `${op} ${PRIORITY_LABELS[String(d.value)] ?? String(d.value)}`,
    };
  }

  if (t === 'condition_approval_result') {
    const op = d.operator ? (OPERATOR_LABELS[d.operator] ?? d.operator) : '=';
    if (!d.value) return { line1: 'Resultado da aprovação', line2: 'Configurar...' };
    return {
      line1: 'Aprovação',
      line2: `${op} ${APPROVAL_RESULT_LABELS[String(d.value)] ?? String(d.value)}`,
    };
  }

  if (t === 'condition_response_value') {
    const op = d.operator ? (OPERATOR_LABELS[d.operator] ?? d.operator) : '=';
    const needsVal = d.operator !== 'is_empty' && d.operator !== 'is_not_empty';
    if (!d.path) return { line1: 'Valor da verificação', line2: 'Configurar...' };
    return {
      line1: String(d.path),
      line2: `${op}${needsVal && d.value ? ` ${String(d.value)}` : ''}`.trim(),
    };
  }

  if (d.fieldCode) {
    const op = d.operator ? (OPERATOR_LABELS[d.operator] ?? d.operator) : '=';
    const needsVal = d.operator !== 'is_empty' && d.operator !== 'is_not_empty';
    return {
      line1: String(d.fieldCode),
      line2: `${op}${needsVal && d.value ? ` ${String(d.value)}` : ''}`.trim(),
    };
  }

  return { line1: 'Condição', line2: 'Configurar...' };
}

// ── Component ──────────────────────────────────────────────────────────────

export function ConditionNode({ id, data, type, selected }: NodeProps) {
  const d = data as FlowNodeData;
  const { isDark } = useTheme();
  const { executionStatus, problematicNodeIds } = useFlowCanvasCtx();
  const execStatus    = executionStatus?.[id];
  const isProblematic = problematicNodeIds.has(id);
  const dimmed        = executionStatus !== null && execStatus === undefined;

  const isAlwaysTrue          = type === 'condition_always_true';
  const isSolicitationStatus  = type === 'condition_solicitation_status';
  const isSolicitationPriority = type === 'condition_solicitation_priority';

  const isConfigured =
    isAlwaysTrue ||
    (type === 'condition_field_value'      && !!d.fieldCode) ||
    (isSolicitationStatus                  && !!d.operator && !!d.value) ||
    (isSolicitationPriority                && !!d.operator && !!d.value) ||
    (type === 'condition_response_value'   && !!String(d.path ?? '').trim() && !!d.operator) ||
    (type === 'condition_approval_result'  && !!d.operator && !!d.value);

  const execColor   = execStatus ? EXEC_GLOW[execStatus] : null;
  const accentColor = execColor ?? (isConfigured && !isProblematic ? AMBER : RED);

  const { line1, line2 } = buildSummary(type, d);
  const isUnconfigured   = !isConfigured || isProblematic;

  const baseShadow = isDark
    ? '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)'
    : '0 4px 16px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.8)';
  const selectedShadow = selected ? `, 0 0 0 2px ${accentColor}80` : '';
  const execShadow     = execColor ? `, 0 0 0 2px ${execColor}70` : '';
  const boxShadow      = baseShadow + selectedShadow + execShadow;

  return (
    <div
      className="glass-node-cond"
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
      <Handle type="target" position={Position.Left} title="Entrada da condição" />

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
        CONDIÇÃO
      </div>

      {/* Icon + title row */}
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
          <GitBranch style={{ width: 14, height: 14, color: accentColor }} />
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
            {d.label ? String(d.label) : line1}
          </div>
        </div>

        {/* Warning badge */}
        {isUnconfigured && !execStatus && (
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
            <AlertTriangle style={{ width: 9, height: 9, color: RED }} />
          </div>
        )}
      </div>

      {/* Subtitle */}
      {line2 && (
        <div
          style={{
            fontSize: 12,
            color: isUnconfigured
              ? (isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.3)')
              : (isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.5)'),
            fontStyle: isUnconfigured ? 'italic' : 'normal',
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {line2}
        </div>
      )}

      {/* Source "yes" — right-top */}
      <Handle
        id="yes"
        type="source"
        position={Position.Right}
        style={{ top: '35%' }}
        title="Caminho quando verdadeiro"
      />

      {/* Source "no" — right-bottom */}
      <Handle
        id="no"
        type="source"
        position={Position.Right}
        style={{ top: '65%' }}
        title="Caminho quando falso"
      />

      {/* SIM badge */}
      <div
        style={{
          position: 'absolute',
          right: -36,
          top: '35%',
          transform: 'translateY(-50%)',
          padding: '2px 6px',
          borderRadius: 100,
          background: `${GREEN}20`,
          border: `1px solid ${GREEN}60`,
          color: GREEN,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '1px',
          fontFamily: 'ui-monospace, "Courier New", monospace',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        SIM
      </div>

      {/* NÃO badge */}
      <div
        style={{
          position: 'absolute',
          right: -36,
          top: '65%',
          transform: 'translateY(-50%)',
          padding: '2px 6px',
          borderRadius: 100,
          background: `${RED}20`,
          border: `1px solid ${RED}60`,
          color: RED,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '1px',
          fontFamily: 'ui-monospace, "Courier New", monospace',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        NÃO
      </div>
    </div>
  );
}
