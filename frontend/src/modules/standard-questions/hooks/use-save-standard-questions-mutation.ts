import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import { saveStandardQuestions, type SaveStandardQuestionInput } from '../services/standard-questions-api';

export function useSaveStandardQuestionsMutation(formId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (questions: SaveStandardQuestionInput[]) =>
      saveStandardQuestions(formId as string, questions),
    onSuccess: () => {
      if (!formId) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.standardQuestions.byForm(formId) });
    },
  });
}
