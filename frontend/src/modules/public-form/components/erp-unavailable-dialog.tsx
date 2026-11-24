import { useEffect, useRef } from 'react';

/**
 * Popup de "banco do ERP fora do ar" (decisão de 2026-10-07): o envio foi recusado e nada foi
 * gravado, mas as respostas continuam no formulário para tentar de novo.
 */
export function ErpUnavailableDialog({
  message,
  retrying,
  onRetry,
  onClose,
}: {
  message: string;
  retrying: boolean;
  onRetry: () => void;
  onClose: () => void;
}) {
  const retryRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    retryRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="erp-unavailable-title"
        aria-describedby="erp-unavailable-message"
        className="w-full max-w-[440px]"
        style={{
          background: 'var(--tf-surface)',
          borderRadius: 16,
          padding: 24,
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
        }}
      >
        <h2
          id="erp-unavailable-title"
          className="text-lg font-extrabold"
          style={{ color: 'var(--tf-text)', margin: 0 }}
        >
          Banco do ERP fora do ar
        </h2>
        <p
          id="erp-unavailable-message"
          className="text-sm"
          style={{ color: 'var(--tf-text-muted)', margin: '10px 0 0', lineHeight: 1.5 }}
        >
          {message}
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="font-bold"
            style={{
              background: 'var(--tf-surface)',
              color: 'var(--tf-primary)',
              border: '1.5px solid var(--tf-primary)',
              padding: '10px 18px',
              borderRadius: 12,
              fontSize: 14,
            }}
          >
            Fechar
          </button>
          <button
            ref={retryRef}
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="font-extrabold disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              background: 'var(--tf-primary)',
              color: '#fff',
              border: 'none',
              padding: '10px 18px',
              borderRadius: 12,
              fontSize: 14,
            }}
          >
            {retrying ? 'Enviando...' : 'Tentar enviar de novo'}
          </button>
        </div>
      </div>
    </div>
  );
}
