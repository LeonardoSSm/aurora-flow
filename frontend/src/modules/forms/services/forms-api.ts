import { api } from '../../../services/api';
import type {
  CreateFormInput,
  DownloadFileSettings,
  FormAppearance,
  FormDetail,
  FormGoogleSheetsState,
  FormSummary,
  FormStatus,
} from '../types';

export type PaginatedForms = {
  data: FormSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type FetchFormsParams = {
  page?: number;
  limit?: number;
  search?: string;
  status?: FormStatus;
  excludeStatus?: FormStatus;
  category?: string;
  area?: string;
};

export async function fetchForms(params?: FetchFormsParams): Promise<PaginatedForms> {
  const { data } = await api.get<PaginatedForms>('/forms', { params });
  return data;
}

/** Categorias já usadas por algum processo e áreas ativas do cadastro (listas do Criador). */
export type FormClassificationOptions = { categories: string[]; areas: string[] };

export async function fetchFormClassificationOptions(): Promise<FormClassificationOptions> {
  const { data } = await api.get<FormClassificationOptions>('/forms/classification-options');
  return data;
}

export async function fetchFormById(formId: string): Promise<FormDetail> {
  const { data } = await api.get<FormDetail>(`/forms/${formId}`);
  return data;
}

export async function createForm(payload: CreateFormInput): Promise<FormDetail> {
  const { data } = await api.post<FormDetail>('/forms', payload);
  return data;
}

export async function updateForm(formId: string, payload: CreateFormInput): Promise<FormDetail> {
  const { data } = await api.patch<FormDetail>(`/forms/${formId}`, payload);
  return data;
}

export async function changeFormStatus(formId: string, status: FormStatus): Promise<FormDetail> {
  const { data } = await api.patch<FormDetail>(`/forms/${formId}/status`, { status });
  return data;
}

/** Cor e ícone do card: não cria versão nova. Campo ausente mantém; null volta ao padrão. */
export async function updateFormAppearance(
  formId: string,
  appearance: Partial<FormAppearance>,
): Promise<FormAppearance> {
  const { data } = await api.patch<FormAppearance>(`/forms/${formId}/appearance`, appearance);
  return data;
}

/**
 * Envia o arquivo de um campo "Arquivo para baixar". Devolve o que vai no
 * `settingsJson.downloadFile` do campo; só vale para o link depois de salvar e publicar.
 */
export async function uploadFormDownloadFile(formId: string, file: File): Promise<DownloadFileSettings> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post<DownloadFileSettings>(`/forms/${formId}/download-files`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function duplicateForm(formId: string): Promise<FormDetail> {
  const { data } = await api.post<FormDetail>(`/forms/${formId}/duplicate`);
  return data;
}

export async function deleteForm(formId: string): Promise<void> {
  await api.delete(`/forms/${formId}`);
}

export async function fetchFormGoogleSheetsStatus(formId: string): Promise<FormGoogleSheetsState> {
  const { data } = await api.get<FormGoogleSheetsState>(`/forms/${formId}/google-sheets`);
  return data;
}

export async function createFormGoogleSpreadsheet(formId: string): Promise<FormGoogleSheetsState> {
  const { data } = await api.post<FormGoogleSheetsState>(`/forms/${formId}/google-sheets/create`);
  return data;
}

export type ReenqueueGoogleSheetsResponse = {
  requeuedJobs: number;
  recoveredProcessingJobs: number;
  status: FormGoogleSheetsState;
};

export async function reenqueueFormGoogleSheetsSync(
  formId: string,
): Promise<ReenqueueGoogleSheetsResponse> {
  const { data } = await api.post<ReenqueueGoogleSheetsResponse>(
    `/forms/${formId}/google-sheets/reenqueue`,
  );
  return data;
}

export type ReprocessGoogleSheetsResponse = {
  createdJobs: number;
  skippedExistingJobs: number;
  skippedCompletedJobs: number;
  status: FormGoogleSheetsState;
};

export async function reprocessFormGoogleSheetsSync(
  formId: string,
): Promise<ReprocessGoogleSheetsResponse> {
  const { data } = await api.post<ReprocessGoogleSheetsResponse>(
    `/forms/${formId}/google-sheets/reprocess`,
  );
  return data;
}
