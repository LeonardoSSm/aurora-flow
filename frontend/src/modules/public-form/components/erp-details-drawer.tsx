import { useEffect, useRef } from 'react';
import type { ErpLookupDetails } from '../../erp-lookup/erp-lookup-api';
import { ErpLookupDetailsCard } from './erp-lookup-details';

/**
 * Ficha de uma "Lista do ERP" numa gaveta que desliza pela direita, por cima do formulário.
 * Usada na etapa que tem uma tabela larga junto da lista (ver `isWideErpSection`): o formulário
 * fica com a largura toda e a ficha só aparece quando pedida. Fecha no X, no Esc ou no fundo;
 * ao fechar, o foco volta para quem abriu.
 */
export function ErpDetailsDrawer({
  details,
  onClose,
}: {
  details: ErpLookupDetails;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      opener?.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Vidro embaçado: o formulário continua visível atrás, desfocado. */}
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 backdrop-blur-md backdrop-saturate-150 motion-safe:animate-erp-backdrop-in"
        style={{ background: 'rgba(15, 23, 42, 0.18)' }}
      />
      {/* Só o cartão da ficha aparece: a gaveta em si é transparente e deixa o clique passar
          para o fundo (fecha) fora do cartão. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Detalhes: ${details.titulo}`}
        tabIndex={-1}
        className="pointer-events-none relative flex h-full w-full max-w-[780px] flex-col outline-none motion-safe:animate-erp-drawer-in"
        style={{ padding: 16 }}
      >
        <div className="pointer-events-auto flex min-h-0 flex-col">
          <ErpLookupDetailsCard details={details} layout="side" onDismiss={onClose} />
        </div>
      </div>
    </div>
  );
}
