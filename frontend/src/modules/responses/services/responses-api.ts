import { api } from '../../../services/api';
import type { Attachment } from '../../solicitations/types';
import type { ResponseRecord } from '../types';

/** Arquivos enviados junto com a resposta (o campo de arquivo não vira item da resposta). */
export async function fetchSubmissionAttachments(submissionId: string): Promise<Attachment[]> {
  const { data } = await api.get<Attachment[]>(`/submissions/${submissionId}/attachments`);
  return data;
}

export async function fetchResponseById(id: string): Promise<ResponseRecord> {
  const { data } = await api.get<ResponseRecord>(`/responses/${id}`);
  return data;
}
