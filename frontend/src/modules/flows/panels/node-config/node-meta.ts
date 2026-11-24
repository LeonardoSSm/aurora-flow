import type { ComponentType, CSSProperties } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowDownToLine,
  Bell,
  BellRing,
  Bot,
  ClipboardCheck,
  Database,
  GitBranch,
  GitMerge,
  Globe,
  Hourglass,
  Kanban,
  Link2,
  Mail,
  MessageCircle,
  Network,
  Paperclip,
  PackagePlus,
  Save,
  LogIn,
  Sheet,
  Timer,
  UserPlus,
  Zap,
  Forward,
} from 'lucide-react';

/** Rótulo, ícone e cores de cada tipo de nó no modal de configuração. */

export const NODE_META: Record<
  string,
  {
    label: string;
    Icon: ComponentType<{ className?: string; style?: CSSProperties }>;
    color: string;
    bg: string;
  }
> = {
  trigger_form_submit: { label: 'Envio de formulário', Icon: Zap, color: '#16A34A', bg: '#F0FDF4' },
  trigger_webhook_received: {
    label: 'Webhook recebido',
    Icon: ArrowDownToLine,
    color: '#16A34A',
    bg: '#F0FDF4',
  },
  trigger_solicitation_created: {
    label: 'Solicitação criada',
    Icon: Network,
    color: '#16A34A',
    bg: '#F0FDF4',
  },
  trigger_solicitation_moved: {
    label: 'Card movido no Kanban',
    Icon: Kanban,
    color: '#16A34A',
    bg: '#F0FDF4',
  },
  trigger_approval_completed: {
    label: 'Aprovação concluída',
    Icon: ClipboardCheck,
    color: '#16A34A',
    bg: '#F0FDF4',
  },
  trigger_sla_warning: {
    label: 'SLA em alerta',
    Icon: AlertTriangle,
    color: '#D97706',
    bg: '#FFFBEB',
  },
  trigger_sla_breached: {
    label: 'SLA vencido',
    Icon: AlertOctagon,
    color: '#DC2626',
    bg: '#FEF2F2',
  },
  trigger_scheduled: {
    label: 'Agendado (cron/intervalo)',
    Icon: Timer,
    color: '#16A34A',
    bg: '#F0FDF4',
  },
  trigger_attachment_uploaded: {
    label: 'Anexo enviado',
    Icon: Paperclip,
    color: '#16A34A',
    bg: '#F0FDF4',
  },
  trigger_phase_field_saved: {
    label: 'Campos de fase salvos',
    Icon: Save,
    color: '#16A34A',
    bg: '#F0FDF4',
  },
  trigger_phase_entered: {
    label: 'Entrou na fase',
    Icon: LogIn,
    color: '#16A34A',
    bg: '#F0FDF4',
  },
  condition_field_value: {
    label: 'Condição de campo',
    Icon: GitBranch,
    color: '#D97706',
    bg: '#FFFBEB',
  },
  condition_always_true: {
    label: 'Sempre verdadeiro',
    Icon: GitBranch,
    color: '#D97706',
    bg: '#FFFBEB',
  },
  condition_solicitation_status: {
    label: 'Status da solicitação',
    Icon: GitBranch,
    color: '#D97706',
    bg: '#FFFBEB',
  },
  condition_solicitation_priority: {
    label: 'Prioridade da solicitação',
    Icon: GitBranch,
    color: '#D97706',
    bg: '#FFFBEB',
  },
  condition_response_value: {
    label: 'Valor da verificação',
    Icon: GitBranch,
    color: '#D97706',
    bg: '#FFFBEB',
  },
  condition_approval_result: {
    label: 'Resultado da aprovação',
    Icon: GitBranch,
    color: '#D97706',
    bg: '#FFFBEB',
  },
  action_send_email: { label: 'Enviar e-mail', Icon: Mail, color: '#2563EB', bg: '#EFF6FF' },
  action_webhook: { label: 'Webhook', Icon: Link2, color: '#7C3AED', bg: '#F5F3FF' },
  action_http_check: { label: 'Verificação HTTP', Icon: Globe, color: '#7C3AED', bg: '#F5F3FF' },
  action_notification: { label: 'Notificação', Icon: BellRing, color: '#2563EB', bg: '#EFF6FF' },
  action_notify_users: { label: 'Notificar usuários', Icon: Bell, color: '#4F46E5', bg: '#EEF2FF' },
  action_google_sheets: { label: 'Google Sheets', Icon: Sheet, color: '#15803D', bg: '#F0FDF4' },
  action_update_solicitation_status: {
    label: 'Atualizar status',
    Icon: Kanban,
    color: '#4F46E5',
    bg: '#EEF2FF',
  },
  action_move_kanban_card: {
    label: 'Mover card no Kanban',
    Icon: Kanban,
    color: '#7C3AED',
    bg: '#F5F3FF',
  },
  action_create_approval: {
    label: 'Criar aprovação',
    Icon: ClipboardCheck,
    color: '#4F46E5',
    bg: '#EEF2FF',
  },
  action_create_solicitation_from_payload: {
    label: 'Criar solicitação (payload)',
    Icon: PackagePlus,
    color: '#16A34A',
    bg: '#F0FDF4',
  },
  action_forward_to_process: {
    label: 'Encaminhar para outro processo',
    Icon: Forward,
    color: '#16A34A',
    bg: '#F0FDF4',
  },
  action_assign_responsible: {
    label: 'Atribuir responsável',
    Icon: UserPlus,
    color: '#7C3AED',
    bg: '#F5F3FF',
  },
  action_send_whatsapp: {
    label: 'Enviar WhatsApp',
    Icon: MessageCircle,
    color: '#15803D',
    bg: '#F0FDF4',
  },
  action_erp_operation: {
    label: 'Operação ERP',
    Icon: Database,
    color: '#1E3A5F',
    bg: '#EFF4FF',
  },
  action_ai_agent: {
    label: 'Agente de IA',
    Icon: Bot,
    color: '#7C3AED',
    bg: '#F5F3FF',
  },
  action_wait_for_phase_fields: {
    label: 'Aguardar campos de fase',
    Icon: Hourglass,
    color: '#4F46E5',
    bg: '#EEF2FF',
  },
  action_move_phase: {
    label: 'Mover para fase',
    Icon: Kanban,
    color: '#4F46E5',
    bg: '#EEF2FF',
  },
  action_run_flow: {
    label: 'Chamar Fluxo',
    Icon: GitMerge,
    color: '#7C3AED',
    bg: '#F5F3FF',
  },
};

export const FALLBACK_META = NODE_META['action_send_email'];

export type NodeKind = 'Gatilho' | 'Condição' | 'Ação';

/** Família do nó, usada no kicker do cabeçalho ("Ação · Criar aprovação"). */
export function nodeKind(type: string): NodeKind {
  if (type.startsWith('trigger_')) return 'Gatilho';
  if (type.startsWith('condition_')) return 'Condição';
  return 'Ação';
}

/** Nós com 0–3 campos: abrem no painel compacto de 520px em vez do modal com etapas. */
export const COMPACT_NODE_TYPES: ReadonlySet<string> = new Set([
  'trigger_sla_warning',
  'trigger_sla_breached',
  'trigger_approval_completed',
  'condition_always_true',
]);

export function isCompactNodeType(type: string | undefined): boolean {
  return !!type && COMPACT_NODE_TYPES.has(type);
}
