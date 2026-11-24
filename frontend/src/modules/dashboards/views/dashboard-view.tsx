import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../app/auth-context';
import { Button, useToast } from '../../../components/ui';
import { WidgetEditorModal } from '../components/widget-editor-modal';
import { WidgetGrid, paraRascunho, resultadosPorChave } from '../components/widget-grid';
import {
  fetchCamposDisponiveis,
  fetchDashboard,
  removerDashboard,
  salvarDashboard,
} from '../services/dashboards-api';
import { OPCOES_PERIODO, type DraftWidget } from '../types';

type DashboardViewProps = {
  formId: string;
};

const NOME_PADRAO = 'Painel de indicadores';

/**
 * Painel de indicadores do formulário.
 *
 * Uma tela só para ver e montar: quem tem permissão de gestão entra em modo de
 * edição no mesmo lugar, sem trocar de rota. O rascunho vive local até salvar,
 * então arrastar e mexer em bloco não dispara requisição a cada gesto.
 */
export function DashboardView({ formId }: DashboardViewProps) {
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState<DraftWidget[]>([]);
  const [nome, setNome] = useState(NOME_PADRAO);
  const [editorAberto, setEditorAberto] = useState(false);
  const [widgetEmEdicao, setWidgetEmEdicao] = useState<DraftWidget | null>(null);
  const [periodoGlobal, setPeriodoGlobal] = useState<number | null>(null);

  const painelQuery = useQuery({
    queryKey: ['dashboard', formId, periodoGlobal],
    queryFn: () => fetchDashboard(formId, periodoGlobal),
    enabled: Boolean(formId),
  });

  const camposQuery = useQuery({
    queryKey: ['dashboard-campos', formId],
    queryFn: () => fetchCamposDisponiveis(formId),
    enabled: Boolean(formId) && editando,
    staleTime: 5 * 60_000,
  });

  const painel = painelQuery.data ?? null;
  const ehSugestao = painel?.gerado ?? false;
  // Sem painel montado o backend devolve nulo, então a permissão de montar vem
  // do contexto de auth — é a mesma que o guard confere na escrita.
  const podeEditar = painel?.podeEditar ?? hasPermission('dashboards.manage');

  // `painel` só muda de referência quando a query de fato busca de novo — sem
  // memo, digitar no nome do painel (ou qualquer outro estado local daqui)
  // recriaria a lista e o mapa a cada tecla, e a grade encararia isso como
  // "os blocos mudaram" mesmo sem nada ter mudado de verdade.
  const widgetsSalvos = painel?.widgets ?? [];
  const widgetsSalvosComoRascunho = useMemo(() => paraRascunho(widgetsSalvos), [widgetsSalvos]);
  const widgets = editando ? rascunho : widgetsSalvosComoRascunho;
  const resultados = useMemo(() => resultadosPorChave(widgetsSalvos), [widgetsSalvos]);

  // Ao entrar em edição, o rascunho parte do que está salvo.
  useEffect(() => {
    if (!editando) return;
    setNome(painel?.name ?? NOME_PADRAO);
    setRascunho(paraRascunho(painel?.widgets ?? []));
  }, [editando, painel]);

  const salvarMutation = useMutation({
    mutationFn: () =>
      salvarDashboard(formId, {
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
      await queryClient.invalidateQueries({ queryKey: ['dashboard', formId] });
      setEditando(false);
      showToast({ title: 'Painel salvo', variant: 'success' });
    },
    onError: (erro: unknown) => {
      const mensagem =
        (erro as { response?: { data?: { message?: string } } }).response?.data?.message ??
        'Não foi possível salvar o painel.';
      showToast({ title: 'Falha ao salvar', description: mensagem, variant: 'error' });
    },
  });

  const removerMutation = useMutation({
    mutationFn: () => removerDashboard(formId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['dashboard', formId] });
      setEditando(false);
      showToast({ title: 'Painel removido', variant: 'success' });
    },
  });

  if (painelQuery.isLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-tx-secondary" />
      </div>
    );
  }

  return (
    <section className="grid gap-4">
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
            <h2 className="truncate text-lg font-extrabold text-tx-primary">
              {painel?.name ?? NOME_PADRAO}
            </h2>
          )}
          <p className="mt-0.5 text-xs text-tx-secondary">
            {editando
              ? 'Arraste para mover, puxe o canto para redimensionar. Os números são recalculados a cada abertura.'
              : `${widgets.length} indicador(es) · dados ao vivo`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!editando ? (
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
          ) : null}
          {editando ? (
            <>
              <Button size="sm" variant="subtle" onClick={() => setEditorAberto(true)}>
                <Plus className="mr-1.5 inline h-4 w-4" />
                Adicionar indicador
              </Button>
              {painel && !ehSugestao ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removerMutation.mutate()}
                  disabled={removerMutation.isPending}
                >
                  <Trash2 className="mr-1.5 inline h-4 w-4" />
                  Excluir painel
                </Button>
              ) : null}
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
          ) : podeEditar ? (
            <Button size="sm" variant={ehSugestao ? "primary" : "subtle"} onClick={() => setEditando(true)}>
              {ehSugestao ? "Personalizar painel" : "Editar painel"}
            </Button>
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
          fonte={{ modo: 'formulario', formId, campos: camposQuery.data ?? [] }}
          inicial={widgetEmEdicao}
          existentes={rascunho}
          onFechar={() => {
            setEditorAberto(false);
            setWidgetEmEdicao(null);
          }}
          onSalvar={(widget) => {
            setRascunho((atual) => {
              const existe = atual.some((w) => w.key === widget.key);
              return existe ? atual.map((w) => (w.key === widget.key ? widget : w)) : [...atual, widget];
            });
            setEditorAberto(false);
            setWidgetEmEdicao(null);
          }}
        />
      ) : null}
    </section>
  );
}

