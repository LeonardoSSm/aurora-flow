import { Mail } from 'lucide-react';
import { Button, useToast } from '../../../components/ui';
import type { ApprovalStep } from '../../solicitations/types';
import { useResendApprovalLinkMutation } from '../hooks/use-resend-approval-link-mutation';
import { getApiErrorMessage } from './approval-modal-utils';

/** Quem deve decidir a etapa: usuário, e-mail externo ou perfil. */
export function stepAssigneeLabel(step: ApprovalStep): string {
  if (step.assignedUser?.fullName) return step.assignedUser.fullName;
  if (step.assignedEmail) return `${step.assignedEmail} (externo)`;
  if (step.assignedRole) return `Perfil: ${step.assignedRole.name}`;
  return step.assignedUserId ?? '—';
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Situação do link de um aprovador externo pendente, para quem gerencia a aprovação. */
export function externalLinkStatus(
  step: ApprovalStep,
  now: Date = new Date(),
): { label: string; tone: 'ok' | 'warn' } | null {
  if (!step.assignedEmail || step.status !== 'pending') return null;
  if (!step.accessLinkSentAt) {
    return { label: 'Link ainda não enviado — use “Reenviar link”', tone: 'warn' };
  }
  const expiresAt = step.accessTokenExpiresAt ? new Date(step.accessTokenExpiresAt) : null;
  if (expiresAt && expiresAt.getTime() <= now.getTime()) {
    return { label: 'Link expirado — use “Reenviar link”', tone: 'warn' };
  }
  return {
    label: `Link enviado em ${formatDateTime(step.accessLinkSentAt)}${
      expiresAt ? ` (vale até ${formatDateTime(step.accessTokenExpiresAt as string)})` : ''
    }`,
    tone: 'ok',
  };
}

/**
 * Linha extra de uma etapa de aprovador externo: estado do link e botão de reenvio. O reenvio gera
 * um link novo — o anterior deixa de valer —, então serve também quando o e-mail se perdeu ou o
 * link expirou ou foi bloqueado.
 */
export function ExternalStepActions({
  step,
  solicitationId,
  canManage,
}: {
  step: ApprovalStep;
  solicitationId: string;
  canManage: boolean;
}) {
  const { showToast } = useToast();
  const mutation = useResendApprovalLinkMutation(solicitationId);
  const status = externalLinkStatus(step);
  if (!status) return null;

  function resend() {
    mutation.mutate(step.id, {
      onSuccess: (result) => {
        if (result.sent) {
          showToast({ title: 'Link reenviado', description: `Enviado para ${result.sentTo}.`, variant: 'success' });
        } else {
          showToast({
            title: 'O link foi gerado, mas o e-mail não saiu',
            description: result.error ?? 'Verifique a configuração de e-mail do servidor e tente de novo.',
            variant: 'warning',
          });
        }
      },
      onError: (error) => {
        showToast({
          title: 'Não foi possível reenviar o link',
          description: getApiErrorMessage(error, 'Tente novamente em instantes.'),
          variant: 'error',
        });
      },
    });
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
      <Mail
        className={['h-3 w-3 shrink-0', status.tone === 'warn' ? 'text-amber-600' : 'text-tx-secondary'].join(' ')}
        aria-hidden="true"
      />
      <span className={status.tone === 'warn' ? 'font-semibold text-amber-700' : 'text-tx-secondary'}>
        {status.label}
      </span>
      {canManage ? (
        <Button size="sm" variant="subtle" disabled={mutation.isPending} onClick={resend}>
          {mutation.isPending ? 'Enviando...' : 'Reenviar link'}
        </Button>
      ) : null}
    </div>
  );
}
