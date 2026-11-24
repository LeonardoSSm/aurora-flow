import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Globe2, Loader2, Lock, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, useToast } from '../../../components/ui';
import { WidgetEditorModal } from '../components/widget-editor-modal';
import { WidgetGrid, paraRascunho, resultadosPorChave } from '../components/widget-grid';
import {
  fetchAreasDoFiltro,
  fetchFormulariosDisponiveis,
  fetchPainel,
  fetchStatusDoFiltro,
  publicarPainel,
  removerPainel,
  salvarPainel,
} from '../services/paineis-api';
import { OPCOES_PERIODO, type DraftWidget } from '../types';

const NOME_PADRAO = 'Novo painel';

function mensagemDeErro(erro: unknown, padrao: string): string {
  return (
    (erro as { response?: { data?: { message?: string } } }).response?.data?.message ?? padrao
  );
}

/**
 * Um painel livre aberto.
 *
 * A estrutura é a mesma do painel do formulário — ver e montar no mesmo lugar,
 * rascunho local até salvar — com dois acréscimos que só existem aqui: cada
 * bloco escolhe de qual formulário lê, e o painel pode ser publicado.
 */
export function PainelLivreView() {
  const { painelId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // Criar um painel leva direto para a edição: um painel vazio recém-criado só
  // tem sentido se a pessoa já puder montá-lo.
  const [editando, setEditando] = useState(searchParams.get('editar') === '1');
  const [rascunho, setRascunho] = useState<DraftWidget[]>([]);
  const [nome, setNome] = useState(NOME_PADRAO);
  const [editorAberto, setEditorAberto] = useState(false);
  const [widgetEmEdicao, setWidgetEmEdicao] = useState<DraftWidget | null>(null);
  const [periodoGlobal, setPeriodoGlobal] = useState<number | null>(null);
  // Área e status vêm da barra do topo, nunca do editor de bloco — vale para o
  // painel inteiro, inclusive blocos sobre respostas de formulário (aí é a área
  // do próprio formulário que decide se o bloco contribui algo, ou nada).
  const [areaGlobal, setAreaGlobal] = useState<string | null>(null);
  const [statusGlobal, setStatusGlobal] = useState<string | null>(null);

  const painelQuery = useQuery({
    queryKey: ['painel', painelId, periodoGlobal, areaGlobal, statusGlobal],
    queryFn: () =>
      fetchPainel(painelId, {
        periodoDias: periodoGlobal,
        areaId: areaGlobal,
        status: statusGlobal,
      }),
    enabled: Boolean(painelId),
  });

  const formulariosQuery = useQuery({
    queryKey: ['painel-formularios'],
    queryFn: fetchFormulariosDisponiveis,
    enabled: editando,
    staleTime: 5 * 60_000,
  });

  const areasQuery = useQuery({
    queryKey: ['painel-areas'],
    queryFn: fetchAreasDoFiltro,
    enabled: !editando,
    staleTime: 10 * 60_000,
  });

  const statusQuery = useQuery({
    queryKey: ['painel-status-solicitacao'],
    queryFn: fetchStatusDoFiltro,
    enabled: !editando,
    staleTime: 30 * 60_000,
  });

  const painel = painelQuery.data ?? null;

  // `painel` só muda de referência quando a query de fato busca de novo — sem
  // memo, digitar no nome do painel (ou qualquer outro estado local daqui)
  // recriaria a lista e o mapa a cada tecla, e a grade encararia isso como
  // "os blocos mudaram" mesmo sem nada ter mudado de verdade.
  const widgetsSalvos = painel?.widgets ?? [];
  const widgetsSalvosComoRascunho = useMemo(() => paraRascunho(widgetsSalvos), [widgetsSalvos]);
  const resultados = useMemo(() => resultadosPorChave(widgetsSalvos), [widgetsSalvos]);

  useEffect(() => {
    if (!editando) return;
    setNome(painel?.name ?? NOME_PADRAO);
    setRascunho(paraRascunho(painel?.widgets ?? []));
  }, [editando, painel]);

  // A marca de "entre editando" cumpriu o papel; deixá-la na URL faria a edição
  // voltar sozinha a cada recarga.
  useEffect(() => {
    if (searchParams.get('editar') !== '1') return;
    searchParams.delete('editar');
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const salvarMutation = useMutation({
    mutationFn: () =>
      salvarPainel(painelId, {
        name: nome.trim() || NOME_PADRAO,
        description: painel?.description ?? null,
        widgets: rascunho.map((widget, indice) => ({
          id: widget.id,
          title: widget.title,
          kind: widget.kind,
          configJson: widget.configJson,
          position: indice,
          x: widget.x,
          y: widget.y,
          w: widget.w,
          h: widget.h,
        })),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['painel', painelId] });
      await queryClient.invalidateQueries({ queryKey: ['paineis'] });
      setEditando(false);
      showToast({ title: 'Painel salvo', variant: 'success' });
    },
    onError: (erro: unknown) => {
      showToast({
        title: 'Falha ao salvar',
        description: mensagemDeErro(erro, 'Não foi possível salvar o painel.'),
        variant: 'error',
      });
    },
  });

  const publicarMutation = useMutation({
    mutationFn: (publicado: boolean) => publicarPainel(painelId, publicado),
    onSuccess: async (atualizado) => {
      await queryClient.invalidateQueries({ queryKey: ['painel', painelId] });
      await queryClient.invalidateQueries({ queryKey: ['paineis'] });
      showToast({
        title: atualizado.publicado ? 'Painel publicado' : 'Painel voltou a privado',
        description: atualizado.publicado
          ? 'Quem tem acesso a indicadores já pode abri-lo. Cada um vê só os números dos formulários que enxerga.'
          : undefined,
        variant: 'success',
      });
    },
    onError: (erro: unknown) => {
      showToast({
        title: 'Falha ao publicar',
        description: mensagemDeErro(erro, 'Não foi possível mudar a visibilidade.'),
        variant: 'error',
      });
    },
  });

  const removerMutation = useMutation({
    mutationFn: () => removerPainel(painelId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['paineis'] });
      showToast({ title: 'Painel excluído', variant: 'success' });
      navigate('/paineis');
    },
    onError: (erro: unknown) => {
      showToast({
        title: 'Falha ao excluir',
        description: mensagemDeErro(erro, 'Não foi possível excluir o painel.'),
        variant: 'error',
      });
    },
  });

  if (painelQuery.isLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-tx-secondary" />
      </div>
    );
  }

  if (painelQuery.isError || !painel) {
    return (
      <section className="grid gap-4">
        <Link to="/paineis" className="flex items-center gap-1.5 text-sm font-semibold text-primary">
          <ArrowLeft className="h-4 w-4" />
          Voltar aos painéis
        </Link>
        <div className="rounded-[12px] border border-dashed border-border-strong bg-bg-s2 px-6 py-14 text-center">
          <p className="text-sm font-semibold text-tx-secondary">
            Este painel não existe ou não está disponível para você.
          </p>
        </div>
      </section>
    );
  }

  const widgets = editando ? rascunho : widgetsSalvosComoRascunho;

  return (
    <section className="grid gap-4">
      <Link
        to="/paineis"
        className="flex w-fit items-center gap-1.5 text-sm font-semibold text-tx-secondary hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Painéis
      </Link>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          {editando ? (
            <input
              value={nome}
              onChange={(event) => setNome(event.target.value)}
              placeholder={NOME_PADRAO}
              className="h-10 w-full max-w-md rounded-[8px] border border-border-strong bg-bg-surface px-3 text-lg font-extrabold text-tx-primary outline-none focus:border-primary"
            />
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-2xl font-extrabold tracking-tight text-tx-primary">
                {painel.name}
              </h1>
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
          )}
          <p className="mt-0.5 text-xs text-tx-secondary">
            {editando
              ? 'Arraste para mover, puxe o canto para redimensionar. Cada bloco lê de um formulário só.'
              : `${widgets.length} indicador(es) · dados ao vivo`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!editando ? (
            <>
              <label className="flex items-center gap-2 text-xs font-bold text-tx-secondary">
                Área
                <select
                  value={areaGlobal ?? ''}
                  onChange={(event) => setAreaGlobal(event.target.value || null)}
                  className="h-9 min-w-0 rounded-[8px] border border-border-default bg-bg-surface px-3 text-sm font-medium text-tx-primary outline-none focus:border-primary"
                >
                  <option value="">Todas as áreas</option>
                  {(areasQuery.data ?? []).map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>
              </label>
              <label
                className="flex items-center gap-2 text-xs font-bold text-tx-secondary"
                title="Só afeta blocos sobre solicitações — respostas de formulário não têm status de fila."
              >
                Status
                <select
                  value={statusGlobal ?? ''}
                  onChange={(event) => setStatusGlobal(event.target.value || null)}
                  className="h-9 min-w-0 rounded-[8px] border border-border-default bg-bg-surface px-3 text-sm font-medium text-tx-primary outline-none focus:border-primary"
                >
                  <option value="">Qualquer status</option>
                  {(statusQuery.data ?? []).map((item) => (
                    <option key={item.status} value={item.status}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs font-bold text-tx-secondary">
                Período
                <select
                  value={periodoGlobal === null ? '' : String(periodoGlobal)}
                  onChange={(event) =>
                    setPeriodoGlobal(event.target.value === '' ? null : Number(event.target.value))
                  }
                  className="h-9 min-w-0 rounded-[8px] border border-border-default bg-bg-surface px-3 text-sm font-medium text-tx-primary outline-none focus:border-primary"
                >
                  <option value="">Cada bloco</option>
                  {OPCOES_PERIODO.filter((opcao) => opcao.valor !== null).map((opcao) => (
                    <option key={opcao.rotulo} value={String(opcao.valor)}>
                      {opcao.rotulo}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}

          {editando ? (
            <>
              <Button size="sm" variant="subtle" onClick={() => setEditorAberto(true)}>
                <Plus className="mr-1.5 inline h-4 w-4" />
                Adicionar indicador
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => removerMutation.mutate()}
                disabled={removerMutation.isPending}
              >
                <Trash2 className="mr-1.5 inline h-4 w-4" />
                Excluir painel
              </Button>
              <Button size="sm" variant="subtle" onClick={() => setEditando(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={() => salvarMutation.mutate()}
                disabled={salvarMutation.isPending}
              >
                {salvarMutation.isPending ? 'Salvando...' : 'Salvar painel'}
              </Button>
            </>
          ) : painel.podeEditar ? (
            <>
              <Button
                size="sm"
                variant="subtle"
                onClick={() => publicarMutation.mutate(!painel.publicado)}
                disabled={publicarMutation.isPending}
              >
                {painel.publicado ? (
                  <>
                    <Lock className="mr-1.5 inline h-4 w-4" />
                    Voltar a privado
                  </>
                ) : (
                  <>
                    <Globe2 className="mr-1.5 inline h-4 w-4" />
                    Publicar
                  </>
                )}
              </Button>
              <Button size="sm" onClick={() => setEditando(true)}>
                Editar painel
              </Button>
            </>
          ) : null}
        </div>
      </header>

      <WidgetGrid
        widgets={widgets}
        resultados={resultados}
        editando={editando}
        onLayoutChange={setRascunho}
        onAdicionar={() => setEditorAberto(true)}
        onEditar={(widget) => {
          setWidgetEmEdicao(widget);
          setEditorAberto(true);
        }}
        onRemover={(key) => setRascunho((atual) => atual.filter((w) => w.key !== key))}
      />

      {editorAberto ? (
        <WidgetEditorModal
          fonte={{ modo: 'livre', formularios: formulariosQuery.data ?? [] }}
          inicial={widgetEmEdicao}
          existentes={rascunho}
          onFechar={() => {
            setEditorAberto(false);
            setWidgetEmEdicao(null);
          }}
          onSalvar={(widget) => {
            setRascunho((atual) => {
              const existe = atual.some((w) => w.key === widget.key);
              return existe
                ? atual.map((w) => (w.key === widget.key ? widget : w))
                : [...atual, widget];
            });
            setEditorAberto(false);
            setWidgetEmEdicao(null);
          }}
        />
      ) : null}
    </section>
  );
}
