import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import { FormAttachmentsList } from '../../solicitations/components/attachment-display';
import { fetchSubmissionAttachments } from '../services/responses-api';

/** Arquivos que vieram com a resposta. Sem permissão ou sem arquivos, não mostra nada. */
export function SubmissionAttachments({ submissionId }: { submissionId: string }) {
  const query = useQuery({
    queryKey: queryKeys.responses.attachments(submissionId),
    queryFn: () => fetchSubmissionAttachments(submissionId),
  });

  return <FormAttachmentsList attachments={query.data ?? []} />;
}
