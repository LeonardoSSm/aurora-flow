import { ShieldCheck } from 'lucide-react';
import { Button, useToast } from '../../../components/ui';
import { useEscapeKey } from '../../../hooks/use-escape-key';
import { queryClient } from '../../../lib/query-client';
import { queryKeys } from '../../../lib/query-keys';
import { getApiErrorMessage } from '../../approvals/components/approval-modal-utils';
import { useRequestPhaseApprovalMutation } from '../../solicitations/hooks/use-solicitation-attachments';
import { describeApprovers, type PhaseApprovalBlock } from '../lib/phase-approval-block';

/**
 * Pop-up de quando o card não sai da fase por falta de aprovação. Quem não aprova a fase pode pedir
 * a aprovação ali mesmo; o card fica parado na fase até a decisão. Com uma já pendente, só avisa.
 */
export function PhaseApprovalBlockDialog({
  block,
  solicitationId,
  cardTitle,
  onClose,
}: {
  block: PhaseApprovalBlock;
  solicitationId: string;
  cardTitle?: string;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const request = useRequestPhaseApprovalMutation(solicitationId);
  useEscapeKey(onClose, !request.isPending);

  const offersRequest = block.code === 'phase_approval_required' && block.canRequest;
  const approvers = describeApprovers(block.approvers);
  const phase = block.phaseLabel ? `"${block.phaseLabel}"` : 'atual';

  async function handleRequest() {
    try {
      await request.mutateAsync();
      void queryClient.invalidateQueries({ queryKey: ['solicitations', 'kanban'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.approvals.myPending() });
      showToast({
        title: 'Aprovação solicitada',
        description: `O card fica na fase ${phase} aguardando a decisão de ${approvers}.`,
        variant: 'success',
      });
      onClose();
    } catch (error) {
      showToast({
        title: 'Não foi possível solicitar a aprovação',
        description: getApiErrorMessage(error, 'Tente novamente em instantes.'),
        variant: 'error',
      });
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="phase-approval-block-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4"
    >
      <div className="w-full max-w-md rounded-2xl bg-bg-surface p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 id="phase-approval-block-title" className="text-base font-bold text-tx-primary">
              {block.code === 'phase_approval_pending' ? 'Aguardando aprovação' : 'Esta fase precisa de aprovação'}
            </h3>
            {cardTitle ? <p className="mt-0.5 break-words text-xs text-tx-secondary">{cardTitle}</p> : null}
          </div>
        </div>

        <div className="mt-4 grid gap-2 text-sm text-tx-secondary">
          {block.code === 'phase_approval_required' ? (
            <p>
              Para sair da fase {phase}, o card precisa da aprovação de{' '}
              <strong className="text-tx-primary">{approvers}</strong>.
            </p>
          ) : (
            <p>{block.message}</p>
          )}
          {block.code === 'phase_approval_pending' && block.approvers.length > 0 ? (
            <p>
              Quem aprova: <strong className="text-tx-primary">{approvers}</strong>.
            </p>
          ) : null}
          {offersRequest ? (
            <p>Quer solicitar a aprovação agora? O card fica travado nesta fase, pendente da autorização.</p>
          ) : block.code === 'phase_approval_required' ? (
            <p>Peça a quem atua nesta fase para solicitar a aprovação.</p>
          ) : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          {offersRequest ? (
            <>
              <Button variant="ghost" size="sm" onClick={onClose} disabled={request.isPending}>
                Cancelar
              </Button>
              <Button size="sm" onClick={() => void handleRequest()} disabled={request.isPending}>
                {request.isPending ? 'Solicitando...' : 'Solicitar aprovação'}
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={onClose}>
              Entendi
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
