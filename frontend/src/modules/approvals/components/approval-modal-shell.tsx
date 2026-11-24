import { X } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Card } from '../../../components/ui';

type ApprovalModalShellProps = {
  title: string;
  description?: string;
  onClose: () => void;
  closeDisabled?: boolean;
  /** Ações do modal. Ficam num rodapé fixo, sempre visível mesmo com o conteúdo rolando. */
  footer: ReactNode;
  children: ReactNode;
};

/**
 * Casca responsiva dos modais de aprovação.
 *
 * - Celular: folha ancorada embaixo, largura total, altura limitada por `dvh` (descontando a
 *   barra do navegador) e rodapé de ações fixo.
 * - Tablet/desktop: caixa centralizada de até `max-w-2xl`.
 *
 * `grid-cols-1` é o que impede o estouro horizontal: sem ele o grid usa uma coluna implícita
 * `auto`, que cresce até caber o maior conteúdo sem quebra (título, nome de arquivo) e empurra
 * tudo para fora do card.
 */
export function ApprovalModalShell({
  title,
  description,
  onClose,
  closeDisabled = false,
  footer,
  children,
}: ApprovalModalShellProps) {
  const titleId = useId();

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="grid max-h-[92dvh] w-full max-w-2xl grid-cols-1 gap-4 overflow-y-auto overflow-x-hidden overscroll-contain rounded-b-none sm:max-h-[90dvh] sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="break-words text-lg font-extrabold leading-snug text-tx-primary sm:text-xl"
            >
              {title}
            </h2>
            {description ? (
              <p className="mt-1 break-words text-sm text-tx-secondary">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-tx-secondary hover:bg-surface-container-high disabled:opacity-50 sm:h-8 sm:w-8"
            title="Fechar"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {children}

        <div className="sticky -bottom-4 z-10 -mx-4 -mb-4 border-t border-border-default/40 bg-surface-container-lowest px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {footer}
        </div>
      </Card>
    </div>
  );
}
