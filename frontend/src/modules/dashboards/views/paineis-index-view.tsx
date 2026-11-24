import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe2, LayoutDashboard, Loader2, Lock, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../app/auth-context';
import { Button, useToast } from '../../../components/ui';
import { criarPainel, fetchPaineis } from '../services/paineis-api';
import type { PainelLivreResumo } from '../types';

const NOME_PADRAO = 'Novo painel';

function dataCurta(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime())
    ? ''
    : data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function CardPainel({ painel }: { painel: PainelLivreResumo }) {
  return (
    <Link
      to={`/paineis/${painel.id}`}
      className="group flex min-w-0 flex-col gap-4 rounded-[10px] border border-border-default bg-bg-surface p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      {/* `min-w-0` na cadeia toda: o nome usa truncate (nowrap) e sem isso o
          min-content dele alarga o card além da tela no celular. */}
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] bg-primary/10 text-primary">
            <LayoutDashboard className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold text-tx-primary" title={painel.name}>
              {painel.name}
            </p>
            <p className="truncate text-xs text-tx-secondary">
              {painel.ehDono ? 'Seu painel' : 'Publicado por outra pessoa'} ·{' '}
              {dataCurta(painel.atualizadoEm)}
            </p>
          </div>
        </div>
        <span
          title={painel.publicado ? 'Visível para a organização' : 'Só você vê'}
          className={[
            'flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
            painel.publicado
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'bg-bg-s2 text-tx-secondary',
          ].join(' ')}
        >
          {painel.publicado ? <Globe2 className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
          {painel.publicado ? 'Publicado' : 'Privado'}
        </span>
      </div>

      <div className="flex min-w-0 items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-3xl font-extrabold text-tx-primary">{painel.totalWidgets}</p>
          <p className="text-xs text-tx-secondary">
            {painel.totalWidgets === 1 ? 'indicador' : 'indicadores'}
          </p>
        </div>
        <span className="text-sm font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100">
          Abrir painel →
        </span>
      </div>
    </Link>
  );
}

/**
 * Lista de painéis livres.
 *
 * Mostra os seus e os que outras pessoas publicaram, na mesma grade — a etiqueta
 * de privado/publicado é o que separa. Painel privado alheio não aparece aqui
 * porque o backend nem o devolve.
 */
export function PaineisIndexView() {
  const [busca, setBusca] = useState('');
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const paineisQuery = useQuery({ queryKey: ['paineis'], queryFn: fetchPaineis });
  const podeMontar = hasPermission('dashboards.manage');

  const criarMutation = useMutation({
    mutationFn: () => criarPainel({ name: NOME_PADRAO, description: null, widgets: [] }),
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ['paineis'] });
      navigate(`/paineis/${id}?editar=1`);
    },
    onError: (erro: unknown) => {
      const mensagem =
        (erro as { response?: { data?: { message?: string } } }).response?.data?.message ??
        'Não foi possível criar o painel.';
      showToast({ title: 'Falha ao criar', description: mensagem, variant: 'error' });
    },
  });

  const paineis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (paineisQuery.data ?? []).filter((painel) =>
      termo ? painel.name.toLowerCase().includes(termo) : true,
    );
  }, [paineisQuery.data, busca]);

  return (
    <section className="grid gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold tracking-tight text-tx-primary">Painéis</h1>
          <p className="mt-1 text-sm text-tx-secondary">
            Monte um painel com indicadores de vários formulários e publique para a equipe.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-tx-ph" />
            <input
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Buscar painel..."
              className="h-9 w-56 rounded-[8px] border border-border-default bg-bg-surface pl-9 pr-3 text-sm text-tx-primary outline-none focus:border-primary"
            />
          </div>
          {podeMontar ? (
            <Button
              size="sm"
              onClick={() => criarMutation.mutate()}
              disabled={criarMutation.isPending}
            >
              <Plus className="mr-1.5 inline h-4 w-4" />
              Novo painel
            </Button>
          ) : null}
        </div>
      </header>

      {paineisQuery.isLoading ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-tx-secondary" />
        </div>
      ) : paineis.length === 0 ? (
        <div className="grid place-items-center gap-3 rounded-[12px] border border-dashed border-border-strong bg-bg-s2 px-6 py-14 text-center">
          <LayoutDashboard className="h-8 w-8 text-tx-ph" />
          <p className="text-sm font-semibold text-tx-secondary">
            {busca.trim()
              ? 'Nenhum painel com esse nome.'
              : 'Nenhum painel ainda. Crie o primeiro e escolha os indicadores.'}
          </p>
          {podeMontar && !busca.trim() ? (
            <Button size="sm" onClick={() => criarMutation.mutate()}>
              <Plus className="mr-1.5 inline h-4 w-4" />
              Novo painel
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {paineis.map((painel) => (
            <CardPainel key={painel.id} painel={painel} />
          ))}
        </div>
      )}
    </section>
  );
}
