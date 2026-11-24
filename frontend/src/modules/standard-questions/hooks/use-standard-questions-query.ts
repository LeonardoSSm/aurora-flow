import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import { fetchStandardQuestions } from '../services/standard-questions-api';
import type { StandardQuestion } from '../types';

export function useStandardQuestionsQuery(formId: string | null) {
  return useQuery<StandardQuestion[]>({
    queryKey: queryKeys.standardQuestions.byForm(formId ?? 'draft'),
    queryFn: () => fetchStandardQuestions(formId as string),
    enabled: !!formId,
    staleTime: 30_000,
  });
}
