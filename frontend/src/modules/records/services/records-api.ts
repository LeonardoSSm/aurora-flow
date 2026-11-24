import { api } from '../../../services/api';
import type {
  RecordFilters,
  RecordReportConfig,
  RecordsMeta,
  RecordsPage,
  RecordsQuery,
  ReportTemplate,
} from '../types';

export async function fetchRecordsMeta(formId: string): Promise<RecordsMeta> {
  const { data } = await api.get<RecordsMeta>(`/records/form/${formId}/meta`);
  return data;
}

export async function fetchRecords(formId: string, query: RecordsQuery): Promise<RecordsPage> {
  const { data } = await api.post<RecordsPage>(`/records/form/${formId}/query`, query);
  return data;
}

/** Gera o relatório no servidor (PDF montado ou CSV com as mesmas colunas). Devolve o arquivo e o nome sugerido. */
export async function downloadRecordsReport(
  formId: string,
  filters: RecordFilters,
  report: RecordReportConfig,
  format: 'pdf' | 'csv' = 'pdf',
  /** Nome sem extensão quando o navegador não expõe o Content-Disposition (API em outra porta/origem). */
  fallbackName = 'registros',
): Promise<{ blob: Blob; filename: string }> {
  const response = await api.post(`/records/form/${formId}/report/${format}`, { ...filters, report }, { responseType: 'blob' });
  const disposition = String(response.headers['content-disposition'] ?? '');
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const plain = /filename="([^"]+)"/i.exec(disposition)?.[1];
  const filename = encoded ? decodeURIComponent(encoded) : (plain ?? `${fallbackName}.${format}`);
  const type = format === 'pdf' ? 'application/pdf' : 'text/csv;charset=utf-8';
  return { blob: new Blob([response.data as BlobPart], { type }), filename };
}

/** O erro do PDF vem como Blob (responseType: 'blob'); lê a mensagem do servidor. */
export async function readBlobError(error: unknown): Promise<string | null> {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (!(data instanceof Blob)) return null;
  try {
    const parsed = JSON.parse(await data.text()) as { message?: string | string[] };
    return Array.isArray(parsed.message) ? parsed.message.join(' ') : (parsed.message ?? null);
  } catch {
    return null;
  }
}

export async function fetchReportTemplates(formId: string): Promise<ReportTemplate[]> {
  const { data } = await api.get<ReportTemplate[]>(`/records/form/${formId}/report-templates`);
  return data;
}

export async function createReportTemplate(
  formId: string,
  name: string,
  config: RecordReportConfig,
): Promise<ReportTemplate> {
  const { data } = await api.post<ReportTemplate>(`/records/form/${formId}/report-templates`, { name, config });
  return data;
}

export async function updateReportTemplate(
  id: string,
  changes: { name?: string; config?: RecordReportConfig },
): Promise<ReportTemplate> {
  const { data } = await api.patch<ReportTemplate>(`/records/report-templates/${id}`, changes);
  return data;
}

export async function deleteReportTemplate(id: string): Promise<void> {
  await api.delete(`/records/report-templates/${id}`);
}
