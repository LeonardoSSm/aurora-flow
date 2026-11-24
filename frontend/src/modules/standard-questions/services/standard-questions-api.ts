import { api } from '../../../services/api';
import type { StandardQuestion } from '../types';

export async function fetchStandardQuestions(formId: string): Promise<StandardQuestion[]> {
  const { data } = await api.get<StandardQuestion[]>(`/forms/${formId}/standard-questions`);
  return data;
}

export type SaveStandardQuestionInput = {
  id?: string;
  code: string;
  label: string;
  fieldType: string;
  required?: boolean;
  order: number;
  settingsJson?: Record<string, unknown> | null;
  options?: { value: string; label: string }[];
};

export async function saveStandardQuestions(
  formId: string,
  questions: SaveStandardQuestionInput[],
): Promise<StandardQuestion[]> {
  const { data } = await api.put<StandardQuestion[]>(`/forms/${formId}/standard-questions`, {
    questions,
  });
  return data;
}
