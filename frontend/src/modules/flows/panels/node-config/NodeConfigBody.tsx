import type { ReactNode } from 'react';
import type { NodeSection } from './node-sections';

interface Props {
  /** Navegação de etapas; sem ela (nó de etapa única) a coluna some. */
  nav?: ReactNode;
  section: NodeSection;
  /** Coluna direita (variáveis/prévia). */
  aside?: ReactNode;
  /** Abaixo de 1100px a coluna direita só aparece, por cima do conteúdo, quando aberta. */
  asideOpen: boolean;
  children: ReactNode;
}

/**
 * Corpo do modal completo: navegação (220px) · etapa atual · coluna direita (300px).
 * Abaixo de 760px a navegação vira abas no topo; abaixo de 1100px a coluna direita se recolhe.
 */
export function NodeConfigBody({ nav, section, aside, asideOpen, children }: Props) {
  return (
    <div
      className={[
        'relative flex min-h-0 flex-1 flex-col',
        nav
          ? 'min-[760px]:grid min-[760px]:grid-cols-[220px_minmax(0,1fr)] min-[760px]:grid-rows-[minmax(0,1fr)] min-[1100px]:grid-cols-[220px_minmax(0,1fr)_300px]'
          : 'min-[1100px]:grid min-[1100px]:grid-cols-[minmax(0,1fr)_300px] min-[1100px]:grid-rows-[minmax(0,1fr)]',
      ].join(' ')}
    >
      {nav}

      <div className="admin-scroll min-h-0 flex-1 overflow-y-auto px-7 py-6">
        {!section.implicit && (
          <div className="mb-5">
            <h3 className="text-base font-semibold tracking-[-0.01em]">{section.label}</h3>
            {section.description && (
              <p className="mt-1 text-[13px] leading-[1.45] [text-wrap:pretty]">
                {section.description}
              </p>
            )}
          </div>
        )}
        {children}
      </div>

      <aside
        aria-label="Variáveis para os próximos nós"
        className={[
          'admin-scroll min-h-0 overflow-y-auto overflow-x-hidden border-l border-border-subtle bg-bg-s2 px-5 py-[22px]',
          'min-[1100px]:static min-[1100px]:block min-[1100px]:w-auto min-[1100px]:shadow-none',
          asideOpen ? 'absolute inset-y-0 right-0 z-10 block w-[300px] shadow-xl' : 'hidden',
        ].join(' ')}
      >
        {aside}
      </aside>
    </div>
  );
}
