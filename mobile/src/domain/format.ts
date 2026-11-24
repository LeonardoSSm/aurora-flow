import type { Tone } from '../ui/theme';

/**
 * Rótulos e formatos do domínio num lugar só (antes cada tela tinha o seu mapa de status, e a
 * Início mostrava "new" cru porque o dela não tinha a chave).
 */

const STATUS: Record<string, { label: string; tone: Tone }> = {
  new: { label: 'Nova', tone: 'brand' },
  open: { label: 'Aberta', tone: 'brand' },
  in_analysis: { label: 'Em análise', tone: 'purple' },
  waiting_approval: { label: 'Aguardando aprovação', tone: 'warning' },
  waiting: { label: 'Aguardando', tone: 'warning' },
  approved: { label: 'Aprovada', tone: 'success' },
  in_progress: { label: 'Em andamento', tone: 'info' },
  waiting_integration: { label: 'Aguardando integração', tone: 'purple' },
  completed: { label: 'Concluída', tone: 'success' },
  resolved: { label: 'Resolvida', tone: 'success' },
  rejected: { label: 'Reprovada', tone: 'danger' },
  cancelled: { label: 'Cancelada', tone: 'neutral' },
  canceled: { label: 'Cancelada', tone: 'neutral' },
};

export function statusMeta(status: string | null | undefined): { label: string; tone: Tone } {
  if (!status) return { label: '—', tone: 'neutral' };
  return STATUS[status] ?? { label: humanize(status), tone: 'neutral' };
}

const PRIORITY: Record<string, { label: string; tone: Tone }> = {
  low: { label: 'Baixa', tone: 'neutral' },
  medium: { label: 'Média', tone: 'brand' },
  high: { label: 'Alta', tone: 'warning' },
  urgent: { label: 'Urgente', tone: 'danger' },
};

export function priorityMeta(priority: string | null | undefined): { label: string; tone: Tone } {
  return (priority && PRIORITY[priority]) || { label: '—', tone: 'neutral' };
}

const SLA: Record<string, { label: string; tone: Tone }> = {
  on_track: { label: 'No prazo', tone: 'success' },
  warning: { label: 'Em risco', tone: 'warning' },
  breached: { label: 'Vencido', tone: 'danger' },
  paused: { label: 'Pausado', tone: 'neutral' },
  completed: { label: 'Concluído', tone: 'success' },
};

export function slaMeta(sla: string | null | undefined): { label: string; tone: Tone } | null {
  return (sla && SLA[sla]) || null;
}

export function approvalStatusMeta(status: string): { label: string; tone: Tone } {
  switch (status) {
    case 'approved':
      return { label: 'Aprovada', tone: 'success' };
    case 'rejected':
      return { label: 'Reprovada', tone: 'danger' };
    case 'cancelled':
      return { label: 'Cancelada', tone: 'neutral' };
    case 'skipped':
      return { label: 'Dispensada', tone: 'neutral' };
    case 'waiting':
      return { label: 'Na fila', tone: 'neutral' };
    default:
      return { label: 'Pendente', tone: 'warning' };
  }
}

function humanize(value: string): string {
  const text = value.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Código curto que o web mostra no card: #A1B2C3D4. */
export function shortCode(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

/** "agora", "há 5 min", "há 3 h", "ontem", "há 4 dias", depois a data. */
export function timeAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.round((now - then) / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'ontem';
  if (days < 30) return `há ${days} dias`;
  return formatDate(iso);
}

/** "2d 3h", "45min" — mesma conta do web (phase-sla.ts). */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(Math.abs(minutes)));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = total % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
  return `${mins}min`;
}

export function phaseSlaLabel(minutesRemaining: number): string {
  return minutesRemaining >= 0
    ? `Vence em ${formatDuration(minutesRemaining)}`
    : `Venceu há ${formatDuration(minutesRemaining)}`;
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return BRL.format(value);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`;
  return `${(bytes / 1_048_576).toFixed(1).replace('.', ',')} MB`;
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function firstName(name: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] ?? '';
}

/** "1 item", "3 itens". */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrador',
  manager: 'Gerente',
  editor: 'Editor',
  viewer: 'Leitor',
};

/** Nome do perfil para mostrar (perfis criados no sistema aparecem pelo código, legível). */
export function roleLabel(role: string | null | undefined): string {
  if (!role) return '—';
  return ROLE_LABEL[role] ?? humanize(role);
}
