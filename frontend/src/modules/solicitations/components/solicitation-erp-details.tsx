import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, Database, Loader2, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { brandCssVars, themeAwareFieldVars } from '../../../brand/css-vars';
import { useBrand } from '../../../brand/hooks/useBrand';
import { queryKeys } from '../../../lib/query-keys';
import { ErpLookupDetailsCard } from '../../public-form/components/erp-lookup-details';
import { fetchSolicitationErpDetails, type SolicitationErpDetail } from '../services/solicitations-api';

/**
 * "Dados do ERP" de uma solicitação: a ficha de CADA campo "Lista do ERP" respondido no formulário
 * (o pedido, o cliente…), consultada no ERP na hora — qualquer formulário, qualquer lista, sem
 * configurar nada. Reutilizável onde alguém decide sobre a solicitação: aprovação, card da fase.
 * Sem campo de ERP respondido, não renderiza nada.
 */
export function SolicitationErpDetails({
  solicitationId,
  defaultOpen = true,
}: {
  solicitationId: string;
  /** Fichas abertas ao montar; o usuário pode recolher cada uma. */
  defaultOpen?: boolean;
}) {
  const brand = useBrand();
  const query = useQuery({
    queryKey: queryKeys.solicitations.erpDetails(solicitationId),
    queryFn: () => fetchSolicitationErpDetails(solicitationId),
    staleTime: 60_000,
    retry: 1,
  });

  if (query.isLoading) {
    return (
      <p className="flex items-center gap-2 text-xs text-tx-secondary">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Consultando o ERP...
      </p>
    );
  }
  if (query.isError) {
    return (
      <p role="alert" className="flex items-center gap-2 text-xs text-[#ef4444]">
        <AlertTriangle className="h-3.5 w-3.5" /> Não foi possível carregar os dados do ERP.
        <button type="button" onClick={() => void query.refetch()} className="font-bold underline">
          Tentar de novo
        </button>
      </p>
    );
  }
  const items = query.data ?? [];
  if (items.length === 0) return null;

  return (
    <section
      aria-label="Dados do ERP"
      className="grid gap-2"
      style={{
        ...brandCssVars(brand),
        ...themeAwareFieldVars,
        // azul da marca some no fundo escuro (aba ativa "Itens"); no claro continua o da marca
        ['--tf-primary' as string]: `var(--tf-primary-on-dark, ${brand.colors.primary})`,
      }}
    >
      {items.map((item) => (
        <ErpDetailItem
          key={item.fieldCode}
          item={item}
          defaultOpen={defaultOpen}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ))}
    </section>
  );
}

function ErpDetailItem({
  item,
  defaultOpen,
  onRetry,
  retrying,
}: {
  item: SolicitationErpDetail;
  defaultOpen: boolean;
  onRetry: () => void;
  retrying: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="grid gap-2 rounded-[10px] border border-border-default bg-bg-surface p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-w-0 items-center gap-2 text-left"
      >
        <Database className="h-4 w-4 shrink-0 text-tx-secondary" />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-bold uppercase tracking-wide text-tx-secondary">
            {item.fieldLabel} (ERP)
          </span>
          <span className="block break-words text-sm font-semibold text-tx-primary">{item.label}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-tx-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        item.status === 'ok' && item.details ? (
          <ErpLookupDetailsCard details={item.details} />
        ) : item.status === 'indisponivel' ? (
          <p className="flex flex-wrap items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            ERP indisponível agora — mostrando o que foi gravado no envio.
            <button
              type="button"
              onClick={onRetry}
              disabled={retrying}
              className="inline-flex items-center gap-1 font-bold underline disabled:opacity-60"
            >
              <RefreshCw className={`h-3 w-3 ${retrying ? 'animate-spin' : ''}`} /> Consultar de novo
            </button>
          </p>
        ) : (
          <p className="text-xs text-tx-muted">Esta lista do ERP não tem ficha detalhada para este item.</p>
        )
      ) : null}
    </div>
  );
}
