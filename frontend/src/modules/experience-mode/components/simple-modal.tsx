import { X } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { cn } from '../../../lib/cn';

type SimpleModalProps = {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Algo ao lado do título, antes do fechar (ex.: a chave Simples | Avançado). */
  headerExtra?: ReactNode;
  /** Largura máxima; padrão max-w-3xl. */
  widthClass?: string;
  /** O conteúdo traz o próprio cabeçalho e rodapé: a janela só dá o fundo, o tamanho e o Esc. */
  bare?: boolean;
};

/** Janela grande e simples do modo simplificado: título, conteúdo que rola e rodapé fixo. */
export function SimpleModal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  headerExtra,
  widthClass,
  bare = false,
}: SimpleModalProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className={cn(
          'flex max-h-[92vh] w-full flex-col overflow-hidden rounded-3xl bg-bg-surface shadow-soft',
          widthClass ?? 'max-w-3xl',
        )}
      >
        {bare ? (
          children
        ) : (
          <>
            <header className="flex shrink-0 items-start gap-4 border-b border-border-default px-6 py-5">
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold text-tx-primary">{title}</h2>
                {subtitle ? <p className="mt-0.5 text-sm text-tx-secondary">{subtitle}</p> : null}
              </div>
              {headerExtra}
              <button
                type="button"
                aria-label="Fechar"
                onClick={onClose}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-tx-secondary hover:bg-bg-hover"
              >
                <X className="h-5 w-5" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer ? (
              <footer className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-border-default px-6 py-4">
                {footer}
              </footer>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
