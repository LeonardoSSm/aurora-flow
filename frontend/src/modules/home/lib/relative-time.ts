/** Formats "{prefix} há Xh"/"X min"/"X dia(s)" relative to now, matching the Home summary cards' copy style. */
export function formatRelativeMeta(prefix: string, isoDate: string | null): string {
  if (!isoDate) return `${prefix} há --`;

  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffMin = Math.max(Math.floor(diffMs / 60_000), 0);

  if (diffMin < 1) return `${prefix} agora`;
  if (diffMin < 60) return `${prefix} há ${diffMin} min`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${prefix} há ${diffHours}h`;

  const diffDays = Math.floor(diffHours / 24);
  return `${prefix} há ${diffDays} dia${diffDays === 1 ? '' : 's'}`;
}
