import { AlertTriangle, Eye, Loader2 } from 'lucide-react';
import { getApiErrorMessage } from '../../../approvals/components/approval-modal-utils';
import { useFlowFormFields } from '../../hooks/use-flow-form-fields';
import { useNotificationPreview } from '../../hooks/use-notification-preview';
import { channelInfo, RECIPIENT_TYPES } from '../../lib/notification-config';
import type {
  FlowNodeData,
  NotificationChannel,
  NotificationRecipientSpec,
} from '../../types/flow.types';

interface PreviewInput {
  channel: NotificationChannel | undefined;
  title: string;
  content: string;
  to: string;
}

const WHATSAPP_RECIPIENTS: Record<string, string> = {
  requester: 'Solicitante',
  responsible: 'Responsável',
};

/** Texto curto de "Para" de uma notificação: "Solicitante, 2 usuários, a@x.com". */
function describeRecipients(recipients: NotificationRecipientSpec[]): string {
  return recipients
    .map((spec) => {
      if (spec.type === 'users') {
        const n = Array.isArray(spec.userIds) ? spec.userIds.length : 0;
        return n === 1 ? '1 usuário' : `${n} usuários`;
      }
      if (spec.type === 'custom' && spec.value) return String(spec.value);
      return RECIPIENT_TYPES.find((option) => option.type === spec.type)?.label ?? spec.type;
    })
    .join(', ');
}

/** O que a prévia mostra para cada nó que envia texto; null = o nó não tem prévia. */
export function getPreviewInput(type: string, d: FlowNodeData): PreviewInput | null {
  switch (type) {
    case 'action_send_email':
      return {
        channel: 'email',
        title: String(d.subject ?? ''),
        content: String(d.body ?? ''),
        to: String(d.toEmail ?? ''),
      };
    case 'action_notification':
      return {
        channel: d.channel,
        title: String(d.title ?? ''),
        content: String(d.content ?? ''),
        to: describeRecipients(Array.isArray(d.recipients) ? d.recipients : []),
      };
    case 'action_send_whatsapp': {
      const recipientType = String(d.recipientType ?? 'requester');
      return {
        channel: 'whatsapp',
        title: '',
        content: String(d.message ?? ''),
        to:
          recipientType === 'custom'
            ? String(d.customPhone ?? '')
            : (WHATSAPP_RECIPIENTS[recipientType] ?? ''),
      };
    }
    default:
      return null;
  }
}

/**
 * Prévia fixa no topo da coluna direita, renderizada pelo backend (a mesma renderização do envio,
 * com valores de exemplo) via useNotificationPreview.
 */
export function MessagePreview({ input, formId }: { input: PreviewInput; formId: string | null }) {
  const { data: fields = [] } = useFlowFormFields(formId);
  const preview = useNotificationPreview({
    channel: input.channel,
    title: input.title,
    content: input.content,
    fieldCodes: fields.map((field) => field.code),
  });
  const channelLabel = channelInfo(input.channel)?.label ?? 'Mensagem';
  const titleLabel = input.channel === 'email' ? 'Assunto' : 'Título';
  const renderedTitle = preview.canPreview ? preview.data?.title : undefined;

  return (
    <section aria-label="Prévia da mensagem" className="grid gap-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-tx-muted">
        <Eye className="h-[13px] w-[13px]" />
        Prévia · {channelLabel}
        {(preview.isFetching || preview.isDebouncing) && preview.canPreview && (
          <Loader2 aria-label="Atualizando prévia" className="h-3 w-3 animate-spin" />
        )}
      </p>

      <div className="overflow-hidden rounded-xl border border-border-default bg-bg-surface">
        {(input.to || renderedTitle) && (
          <div className="grid gap-1 border-b border-border-subtle px-3.5 py-3 text-xs text-tx-muted">
            {input.to && (
              <span className="break-words">
                Para <span className="text-tx-primary">{input.to}</span>
              </span>
            )}
            {renderedTitle && (
              <span className="break-words">
                {titleLabel} <span className="font-semibold text-tx-primary">{renderedTitle}</span>
              </span>
            )}
          </div>
        )}
        <div className="whitespace-pre-wrap break-words p-3.5 text-[13px] leading-[1.55] text-tx-primary">
          {!preview.canPreview ? (
            <span className="text-tx-muted">Escreva a mensagem para ver a prévia.</span>
          ) : preview.isError ? (
            <span role="alert" className="font-semibold text-nc-danger">
              {getApiErrorMessage(preview.error, 'Não foi possível gerar a prévia.')}
            </span>
          ) : preview.data ? (
            preview.data.body
          ) : (
            <span className="text-tx-muted">Gerando prévia…</span>
          )}
        </div>
      </div>

      {preview.canPreview && preview.data && preview.data.missingVariables.length > 0 && (
        <p role="status" className="flex items-start gap-1.5 text-xs text-nc-warn">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Variáveis não reconhecidas (ficam em branco):{' '}
            {preview.data.missingVariables.map((name) => `{{${name}}}`).join(', ')}
          </span>
        </p>
      )}
      <p className="text-xs leading-[1.45] text-tx-muted">
        Valores de exemplo. No envio, cada variável é trocada pelo dado da solicitação.
      </p>
    </section>
  );
}
