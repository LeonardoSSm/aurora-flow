import { api } from '../../../services/api';
import type {
  Agregacao,
  AreaDoFiltro,
  CampoDisponivel,
  DimensaoDisponivel,
  FormularioDisponivel,
  PainelLivre,
  PainelLivreResumo,
  StatusDoFiltro,
  WidgetConfig,
  WidgetResultado,
} from '../types';
import type { SalvarPainelInput } from './dashboards-api';

/**
 * Painéis livres — os que cruzam formulários.
 *
 * Rota separada da do painel de formulário porque o recurso é outro: aqui não
 * existe formulário no caminho, cada bloco carrega o seu.
 */

export async function fetchPaineis(): Promise<PainelLivreResumo[]> {
  const { data } = await api.get<PainelLivreResumo[]>('/dashboards');
  return data;
}

export type FiltrosPainel = {
  periodoDias?: number | null;
  /** Filtro global — vale para todo bloco, não é escolhido bloco a bloco. */
  areaId?: string | null;
  status?: string | null;
};

export async function fetchPainel(id: string, filtros: FiltrosPainel = {}): Promise<PainelLivre> {
  const params: Record<string, string | number> = {};
  if (filtros.periodoDias) params.periodoDias = filtros.periodoDias;
  if (filtros.areaId) params.areaId = filtros.areaId;
  if (filtros.status) params.status = filtros.status;

  const { data } = await api.get<PainelLivre>(`/dashboards/${id}`, {
    params: Object.keys(params).length > 0 ? params : undefined,
  });
  return data;
}

/** Áreas disponíveis para o filtro global. */
export async function fetchAreasDoFiltro(): Promise<AreaDoFiltro[]> {
  const { data } = await api.get<AreaDoFiltro[]>('/dashboards/areas');
  return data;
}

/** Status de solicitação disponíveis para o filtro global. */
export async function fetchStatusDoFiltro(): Promise<StatusDoFiltro[]> {
  const { data } = await api.get<StatusDoFiltro[]>('/dashboards/solicitacoes/status');
  return data;
}

/** Formulários que o usuário pode usar como fonte de um bloco. */
export async function fetchFormulariosDisponiveis(): Promise<FormularioDisponivel[]> {
  const { data } = await api.get<FormularioDisponivel[]>('/dashboards/formularios');
  return data;
}

export async function fetchCamposDoFormulario(formId: string): Promise<CampoDisponivel[]> {
  const { data } = await api.get<CampoDisponivel[]>(`/dashboards/formularios/${formId}/campos`);
  return data;
}

/** Dimensões e medidas da fonte de solicitações — o análogo dos campos. */
export async function fetchDimensoesSolicitacao(): Promise<{
  dimensoes: DimensaoDisponivel[];
  agregacoes: Agregacao[];
}> {
  const { data } = await api.get<{ dimensoes: DimensaoDisponivel[]; agregacoes: Agregacao[] }>(
    '/dashboards/solicitacoes/dimensoes',
  );
  return data;
}

/**
 * Calcula um indicador sem gravar.
 *
 * O formulário vai no corpo e não na rota, e é opcional: bloco de solicitações
 * não tem formulário nenhum.
 */
export async function previsualizarWidgetLivre(
  formId: string | null,
  config: WidgetConfig,
): Promise<WidgetResultado> {
  const { data } = await api.post<WidgetResultado>('/dashboards/previsualizar', {
    ...config,
    formId: formId ?? undefined,
  });
  return data;
}

export async function criarPainel(input: SalvarPainelInput): Promise<string> {
  const { data } = await api.post<{ id: string }>('/dashboards', input);
  return data.id;
}

export async function salvarPainel(id: string, input: SalvarPainelInput): Promise<PainelLivre> {
  const { data } = await api.put<PainelLivre>(`/dashboards/${id}`, input);
  return data;
}

export async function publicarPainel(id: string, publicado: boolean): Promise<PainelLivre> {
  const { data } = await api.post<PainelLivre>(`/dashboards/${id}/publicar`, { publicado });
  return data;
}

export async function removerPainel(id: string): Promise<void> {
  await api.delete(`/dashboards/${id}`);
}
