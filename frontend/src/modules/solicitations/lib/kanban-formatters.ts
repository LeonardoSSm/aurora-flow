export function formatRelativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days}d`;
}

export function formatSla(
  slaDueAt: string | null,
): { text: string; overdue: boolean } | null {
  if (!slaDueAt) return null;
  const diffMs = new Date(slaDueAt).getTime() - Date.now();
  if (diffMs <= 0) return { text: 'VENCIDO', overdue: true };
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return { text: `${minutes}min`, overdue: false };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { text: `${hours}h`, overdue: false };
  const days = Math.floor(hours / 24);
  return { text: `${days}d`, overdue: false };
}
