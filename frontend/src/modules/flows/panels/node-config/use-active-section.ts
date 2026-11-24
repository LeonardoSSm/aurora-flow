import { useState } from 'react';
import type { NodeIssue } from '../../lib/node-issues';
import type { NodeSection } from './node-sections';

/** Última etapa aberta em cada nó, enquanto a página viver (o painel remonta a cada nó aberto). */
const lastSectionByNode = new Map<string, string>();

/**
 * Etapa ativa do modal. Ao abrir: a última escolhida neste nó; senão a primeira com pendência;
 * senão a primeira. A navegação é livre — "Próximo" nunca bloqueia, a edição já está salva.
 */
export function useActiveSection(
  nodeId: string,
  sections: readonly NodeSection[],
  issuesBySection: Record<string, NodeIssue[]>,
) {
  const [chosen, setChosen] = useState(() => {
    const remembered = lastSectionByNode.get(nodeId);
    if (remembered && sections.some((s) => s.id === remembered)) return remembered;
    return (sections.find((s) => issuesBySection[s.id]?.length) ?? sections[0]).id;
  });

  const index = Math.max(
    0,
    sections.findIndex((s) => s.id === chosen),
  );

  function select(id: string) {
    lastSectionByNode.set(nodeId, id);
    setChosen(id);
  }

  return {
    active: sections[index],
    select,
    prev: index > 0 ? () => select(sections[index - 1].id) : undefined,
    next: index < sections.length - 1 ? () => select(sections[index + 1].id) : undefined,
  };
}
