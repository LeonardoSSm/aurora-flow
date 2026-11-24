import axios from 'axios';
import { api } from '../../services/api';
import type { ErpLookupMode, ErpTableSourceColumn } from '../forms/types';
import type { ErpTableSourceRow } from '../public-form/types';

export type ErpLookupItem = { value: string; label: string };
export type ErpLookupSource = { id: string; label: string; modo: ErpLookupMode };
export type ErpLookupConnector = { id: string; name: string };

/** Ficha do item escolhido: vem pronta do ERP (textos já formatados), só é desenhada aqui. */
export type ErpLookupDetailField = { label: string; valor: string; largo?: boolean };
export type ErpLookupDetailTable = {
  titulo: string;
  colunas: Array<{ chave: string; label: string; numerica?: boolean }>;
  linhas: Array<Record<string, string>>;
  total?: Record<string, string>;
};
export type ErpLookupDetails = {
  value: string;
  titulo: string;
  alertas: Array<{ tipo: 'perigo' | 'aviso'; texto: string }>;
  resumo: ErpLookupDetailField[];
  secoes: Array<{ titulo: string; campos: ErpLookupDetailField[] }>;
  tabelas: ErpLookupDetailTable[];
};

/** Chaves do React Query deste módulo. */
export const erpLookupKeys = {
  connectors: () => ['erp-lookup', 'connectors'] as const,
  sources: (connectorId: string) => ['erp-lookup', 'sources', connectorId] as const,
  search: (formId: string, fieldCode: string, q: string) =>
    ['erp-lookup', 'search', formId, fieldCode, q] as const,
  details: (formId: string, fieldCode: string, value: string) =>
    ['erp-lookup', 'details', formId, fieldCode, value] as const,
};

/** Construtor: conectores de ERP ativos (só id e nome). */
export async function fetchErpLookupConnectors(): Promise<ErpLookupConnector[]> {
  const { data } = await api.get<ErpLookupConnector[]>('/erp/lookup/connectors');
  return data;
}

/** Construtor: listas que a API erp-lookup de um conector oferece. */
export async function fetchErpLookupSources(connectorId: string): Promise<ErpLookupSource[]> {
  const { data } = await api.get<ErpLookupSource[]>(
    `/erp/lookup/connectors/${encodeURIComponent(connectorId)}/fontes`,
  );
  return data;
}

/** Preenchimento: pesquisa no campo "Lista do ERP" de um formulário publicado. */
export async function searchErpLookupField(
  formId: string,
  fieldCode: string,
  q: string,
): Promise<ErpLookupItem[]> {
  const { data } = await api.get<{ items: ErpLookupItem[] }>(
    `/public/forms/${encodeURIComponent(formId)}/fields/${encodeURIComponent(fieldCode)}/lookup`,
    { params: q ? { q } : undefined },
  );
  return data.items;
}

/** Preenchimento: ficha do item escolhido. `null` = a lista não tem ficha para mostrar. */
export async function fetchErpLookupFieldDetails(
  formId: string,
  fieldCode: string,
  value: string,
): Promise<ErpLookupDetails | null> {
  const { data } = await api.get<{ detalhes: ErpLookupDetails | null }>(
    `/public/forms/${encodeURIComponent(formId)}/fields/${encodeURIComponent(fieldCode)}/lookup/detalhes`,
    { params: { value } },
  );
  return data.detalhes;
}

export const ERP_INDISPONIVEL_FALLBACK_MESSAGE =
  'O banco de dados do ERP está fora do ar no momento. Suas respostas não foram perdidas: tente enviar novamente em alguns minutos.';

/** 503 com `code: "ERP_INDISPONIVEL"` — o backend usa para "banco do ERP fora do ar". */
export function getErpUnavailableMessage(error: unknown): string | null {
  if (!axios.isAxiosError(error) || error.response?.status !== 503) return null;
  const data = error.response.data as { code?: unknown; message?: unknown } | undefined;
  if (data?.code !== 'ERP_INDISPONIVEL') return null;
  return typeof data.message === 'string' && data.message.trim()
    ? data.message
    : ERP_INDISPONIVEL_FALLBACK_MESSAGE;
}

// ─── Tabela dinâmica do ERP ──────────────────────────────────────────────────

export type ErpTableDefinition = {
  id: string;
  label: string;
  parameters: Array<{ name: string; type: 'text' | 'number'; required: boolean }>;
  columns: ErpTableSourceColumn[];
  rowKey: string | null;
  maxRows: number;
};

export type ErpTableLoadResult = {
  schemaVersion: 1;
  sourceHash: string;
  fetchedAt: string;
  rows: ErpTableSourceRow[];
};

export const erpTableKeys = {
  features: () => ['erp-lookup', 'features'] as const,
  tables: (connectorId: string, fonte: string) =>
    ['erp-lookup', 'tables', connectorId, fonte] as const,
};

/** Construtor: o que está ligado neste ambiente (a tabela fica atrás de ERP_TABLE_ENABLED). */
export async function fetchErpFeatures(): Promise<{ erpTable: boolean }> {
  const { data } = await api.get<{ erpTable: boolean }>('/erp/lookup/features');
  return data;
}

/** Construtor: tabelas que uma lista do erp-lookup expõe. */
export async function fetchErpTables(
  connectorId: string,
  fonte: string,
): Promise<ErpTableDefinition[]> {
  const { data } = await api.get<{ tables: ErpTableDefinition[] }>(
    `/erp/lookup/connectors/${encodeURIComponent(connectorId)}/fontes/${encodeURIComponent(fonte)}/tabelas`,
  );
  return data.tables;
}

/** Construtor: "Testar consulta" com parâmetros digitados (primeiras 20 linhas). */
export async function testErpTable(
  connectorId: string,
  fonte: string,
  dataset: string,
  parametros: Record<string, string>,
): Promise<{ found: boolean; totalRows: number; rows: ErpTableSourceRow[] }> {
  const { data } = await api.post<{ found: boolean; totalRows: number; rows: ErpTableSourceRow[] }>(
    `/erp/lookup/connectors/${encodeURIComponent(connectorId)}/fontes/${encodeURIComponent(fonte)}/tabelas/${encodeURIComponent(dataset)}/teste`,
    { parametros },
  );
  return data;
}

/** Preenchimento: linhas da tabela para os valores atuais dos campos de que ela depende. */
export async function loadErpTableField(
  formId: string,
  fieldCode: string,
  dependencies: Record<string, string>,
  signal?: AbortSignal,
): Promise<ErpTableLoadResult> {
  const { data } = await api.post<ErpTableLoadResult>(
    `/public/forms/${encodeURIComponent(formId)}/fields/${encodeURIComponent(fieldCode)}/erp-table/load`,
    { dependencies },
    { signal },
  );
  return data;
}

/** 409 `ERP_TABLE_CHANGED` no envio: códigos dos campos de tabela que mudaram no ERP. */
export function getErpTableChangedFields(error: unknown): string[] | null {
  if (!axios.isAxiosError(error) || error.response?.status !== 409) return null;
  const data = error.response.data as { code?: unknown; fields?: unknown } | undefined;
  if (data?.code !== 'ERP_TABLE_CHANGED') return null;
  return Array.isArray(data.fields)
    ? data.fields.filter((code): code is string => typeof code === 'string')
    : [];
}

/** Mensagem de erro de uma chamada da tabela (503 do ERP, 404, 400 do backend). */
export function getErpTableErrorMessage(error: unknown): string {
  const unavailable = getErpUnavailableMessage(error);
  if (unavailable) return unavailable;
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: unknown } | undefined;
    if (typeof data?.message === 'string' && data.message.trim()) return data.message;
  }
  return 'Não foi possível carregar a tabela do ERP.';
}
