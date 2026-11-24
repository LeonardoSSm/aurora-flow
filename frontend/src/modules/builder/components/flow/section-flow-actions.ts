import { createContext, useContext } from 'react';

/** Ações do menu "⋯" do nó de seção, vindas do canvas. */
export type SectionFlowActions = {
  onEditSection: (sectionId: string) => void;
  /** Ausente quando o formulário tem uma seção só (não dá para remover a última). */
  onRemoveSection?: (sectionId: string) => void;
  /** Texto do nó final. Padrão: "Enviar resposta" (formulário de abertura). */
  terminalLabel?: string;
};

export const SectionFlowActionsContext = createContext<SectionFlowActions | null>(null);

export function useSectionFlowActions(): SectionFlowActions | null {
  return useContext(SectionFlowActionsContext);
}
