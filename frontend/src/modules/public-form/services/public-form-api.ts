import { appendUploadLabel, type UploadLabel } from '../../../lib/attachment-upload';
import { api } from '../../../services/api';
import type { PublicForm, PublicProgressPayload, PublicSubmitPayload } from '../types';

export async function fetchPublicForm(formId: string) {
  const { data } = await api.get<PublicForm>(`/public/forms/${formId}`);
  return data;
}

export async function submitPublicForm(payload: PublicSubmitPayload): Promise<{ id: string }> {
  const { data } = await api.post<{ id: string }>('/responses/submit', payload);
  return data;
}

export async function submitProgress(
  payload: PublicProgressPayload,
): Promise<{ progressId: string }> {
  const { data } = await api.post<{ progressId: string }>('/responses/progress', payload);
  return data;
}

export async function uploadSubmissionAttachment(
  submissionId: string,
  file: File,
  label?: UploadLabel,
): Promise<void> {
  const form = new FormData();
  form.append('file', file);
  appendUploadLabel(form, label);
  await api.post(`/public/submissions/${submissionId}/attachments`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}
