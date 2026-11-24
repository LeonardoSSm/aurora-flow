import { useQuery } from '@tanstack/react-query';
import { ArrowLeftToLine, ArrowRightFromLine } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { queryKeys } from '../../../lib/query-keys';
import { fetchSolicitationHandoffs, type SolicitationHandoffLink } from '../services/solicitations-api';

/**
 * Cards ligados por "Encaminhar para outro processo": de onde este veio e para onde foi. Sem
 * nenhum, não renderiza nada. Abrir o card ligado passa pela checagem de acesso dele.
 */
export function SolicitationHandoffLinks({ solicitationId }: { solicitationId: string }) {
  const query = useQuery({
    queryKey: queryKeys.solicitations.handoffs(solicitationId),
    queryFn: () => fetchSolicitationHandoffs(solicitationId),
    staleTime: 60_000,
    retry: 1,
  });
  const source = query.data?.source ?? null;
  const forwarded = query.data?.forwarded ?? [];
  if (!source && forwarded.length === 0) return null;

  return (
    <section aria-label="Encaminhamento entre processos" className="grid gap-1.5 rounded-[10px] border border-border-default bg-bg-surface px-3 py-2.5">
      {source ? (
        <HandoffRow icon={<ArrowLeftToLine className="h-3.5 w-3.5" />} prefix="Veio de" link={source} />
      ) : null}
      {forwarded.map((link) => (
        <HandoffRow
          key={link.id}
          icon={<ArrowRightFromLine className="h-3.5 w-3.5" />}
          prefix="Encaminhado para"
          link={link}
        />
      ))}
    </section>
  );
}

function HandoffRow({
  icon,
  prefix,
  link,
}: {
  icon: ReactNode;
  prefix: string;
  link: SolicitationHandoffLink;
}) {
  return (
    <p className="flex min-w-0 items-center gap-2 text-xs text-tx-secondary">
      <span aria-hidden className="shrink-0 text-tx-muted">
        {icon}
      </span>
      <span className="shrink-0">{prefix}</span>
      <span className="shrink-0 font-semibold text-tx-primary">{link.formName ?? 'outro processo'}:</span>
      <Link
        to={`/solicitacoes?solicitationId=${encodeURIComponent(link.id)}`}
        className="min-w-0 truncate font-semibold text-brand-primary underline-offset-2 hover:underline dark:text-blue-300"
      >
        {link.title}
      </Link>
    </p>
  );
}
