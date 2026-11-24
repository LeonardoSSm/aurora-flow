import { api } from '../../../services/api';
import type {
  CampoDisponivel,
  Dashboard,
  DraftWidget,
  WidgetConfig,
  WidgetResultado,
} from '../types';

export type SalvarPainelInput = {
  name: string;
  description?: string | null;
  widgets: Array<{
    id?: string;
    title: string;
    kind: DraftWidget['kind'];
    configJson: DraftWidget['configJson'];
    position: number;
    x: number;
    y: number;
    w: number;
    h: number;
  }>;
};

/**
 * Painel do formulário com os indicadores já calculados.
 *
 * Sem painel salvo o backend devolve uma sugestão montada na hora
 * (`gerado: true`), então esta chamada nunca volta vazia — é o que faz a aba ter
 * conteúdo desde o primeiro acesso, sem depender do analytics antigo.
 */
export async function fetchDashboard(
  formId: string,
  periodoDias?: number | null,
): Promise<Dashboard> {
  const { data } = await api.get<Dashboard>(`/forms/${formId}/dashboard`, {
    params: periodoDias ? { periodoDias } : undefined,
  });
  return data;
}

export async function fetchCamposDisponiveis(formId: string): Promise<CampoDisponivel[]> {
  const { data } = await api.get<CampoDisponivel[]>(`/forms/${formId}/dashboard/campos`);
  return data;
}

/** Calcula um indicador sem gravar — alimenta a pré-visualização do editor. */
export async function previsualizarWidget(
  formId: string,
  config: WidgetConfig,
): Promise<WidgetResultado> {
  const { data } = await api.post<WidgetResultado>(
    `/forms/${formId}/dashboard/previsualizar`,
    config,
  );
  return data;
}

export async function salvarDashboard(
  formId: string,
  input: SalvarPainelInput,
): Promise<Dashboard> {
  const { data } = await api.put<Dashboard>(`/forms/${formId}/dashboard`, input);
  return data;
}

export async function removerDashboard(formId: string): Promise<void> {
  await api.delete(`/forms/${formId}/dashboard`);
}
