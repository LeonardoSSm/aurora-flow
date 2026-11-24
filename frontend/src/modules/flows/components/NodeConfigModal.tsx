import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Marca o diálogo de configuração de nó (o canvas desliga os atalhos de teclado enquanto ele existe). */
export const NODE_CONFIG_DIALOG_ATTR = 'data-node-config-dialog';

export type NodeConfigModalVariant = 'full' | 'compact';

/**
 * Configuração de um nó num modal centralizado. A variante "full" (1040px, altura fixa) acomoda a
 * navegação por etapas e a coluna de variáveis; a "compact" (520px, altura pelo conteúdo) é para os
 * nós de 0–3 campos. A edição continua ao vivo: cada mudança já vai para o canvas (e para o
 * autosave), então fechar — Esc, clique fora ou "Concluir" — nunca descarta nada.
 */
export function NodeConfigModal({
  variant = 'full',
  onClose,
  children,
}: {
  variant?: NodeConfigModalVariant;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      // Um modal aberto por cima deste (ex.: "Editar e-mail" da aprovação) fecha primeiro.
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1]?.hasAttribute(NODE_CONFIG_DIALOG_ATTR) === false) return;
      onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[85] grid animate-fade place-items-center bg-nc-backdrop px-4 py-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Configurar nó"
        {...{ [NODE_CONFIG_DIALOG_ATTR]: '' }}
        className={[
          'node-config flex max-h-[90dvh] w-full animate-admin-in flex-col overflow-hidden rounded-2xl bg-bg-surface shadow-nc-modal',
          variant === 'compact' ? 'max-w-[520px]' : 'h-[720px] max-w-[1040px]',
        ].join(' ')}
      >
        {children}
      </section>
    </div>,
    document.body,
  );
}
