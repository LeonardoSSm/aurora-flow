import React, { useEffect } from 'react';
import { isForbidden } from '../api/client';
import { useApproval } from '../api/queries';
import type { RootScreenProps } from '../navigation/types';
import { Screen, ScreenHeader } from '../ui/layout';
import { EmptyState, ErrorState, LoadingBlock } from '../ui/primitives';

/** Link de aviso de uma aprovação (`/aprovacoes?id=…`): descobre o card e abre direto nele. */
export default function ApprovalLinkScreen({ route, navigation }: RootScreenProps<'ApprovalLink'>) {
  const approval = useApproval(route.params.approvalId);
  useEffect(() => {
    if (approval.data) {
      navigation.replace('Card', { solicitationId: approval.data.solicitationId, focusDecision: true });
    }
  }, [approval.data, navigation]);
  return (
    <Screen>
      <ScreenHeader back title="Aprovação" />
      {approval.isError ? (
        isForbidden(approval.error) ? (
          <EmptyState icon="lock" title="Sem acesso a esta aprovação" />
        ) : (
          <ErrorState onRetry={() => void approval.refetch()} />
        )
      ) : (
        <LoadingBlock label="Abrindo a aprovação…" />
      )}
    </Screen>
  );
}
