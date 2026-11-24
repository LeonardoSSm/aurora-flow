import { Check } from 'lucide-react';
import type { NodeIssue } from '../../lib/node-issues';
import type { FlowNodeData } from '../../types/flow.types';
import type { NodeSection, SectionSummaryContext } from './node-sections';

interface Props {
  sections: readonly NodeSection[];
  activeId: string;
  issuesBySection: Record<string, NodeIssue[]>;
  d: FlowNodeData;
  summaryContext: SectionSummaryContext;
  onSelect: (id: string) => void;
}

/**
 * Etapas do nó. Abaixo de 760px vira uma linha de abas sobre o conteúdo; acima, a coluna de 220px.
 * Indicador: número na etapa atual, ✓ sem pendência, ! com pendência.
 */
export function SectionNav({
  sections,
  activeId,
  issuesBySection,
  d,
  summaryContext,
  onSelect,
}: Props) {
  return (
    <nav
      aria-label="Etapas"
      className="admin-scroll flex shrink-0 gap-0.5 overflow-x-auto border-b border-border-subtle bg-bg-s2 px-3 py-2 min-[760px]:flex-col min-[760px]:overflow-y-auto min-[760px]:overflow-x-hidden min-[760px]:border-b-0 min-[760px]:border-r min-[760px]:py-4"
    >
      {sections.map((section, index) => {
        const current = section.id === activeId;
        const pending = (issuesBySection[section.id]?.length ?? 0) > 0;
        const subtitle = pending ? 'Falta preencher' : section.summary?.(d, summaryContext);

        return (
          <button
            key={section.id}
            type="button"
            onClick={() => onSelect(section.id)}
            aria-current={current ? 'step' : undefined}
            className={[
              'flex shrink-0 items-start gap-2.5 rounded-[9px] px-2.5 py-[9px] text-left min-[760px]:shrink',
              current ? 'bg-bg-surface shadow-nc-nav' : 'hover:bg-bg-surface',
            ].join(' ')}
          >
            <span
              aria-hidden
              className={[
                'mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold',
                // A pendência vence: a etapa aberta com campo faltando mostra "!", não o número.
                pending
                  ? 'bg-nc-warn-bg text-nc-warn'
                  : current
                    ? 'bg-nc-btn text-white'
                    : 'bg-nc-ok-bg text-nc-ok',
              ].join(' ')}
            >
              {pending ? '!' : current ? index + 1 : <Check className="h-3 w-3" strokeWidth={3} />}
            </span>
            <span className="min-w-0">
              <span
                className={[
                  'block text-[13px] font-semibold leading-5',
                  current ? 'text-nc-accent' : 'text-tx-primary',
                ].join(' ')}
              >
                {section.label}
              </span>
              {subtitle && (
                <span className="block max-w-[160px] truncate text-xs text-tx-muted">
                  {subtitle}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
