import { createContext, useContext } from 'react';
import type { FormSummary } from '../../forms/types';

export interface FlowCanvasCtx {
  executionStatus: Record<string, 'success' | 'failed' | 'skipped'> | null;
  problematicNodeIds: Set<string>;
  availableForms: FormSummary[];
  isLoadingForms: boolean;
  onOpenLinkedForm: (formId: string) => void;
}

export const FlowCanvasContext = createContext<FlowCanvasCtx>({
  executionStatus: null,
  problematicNodeIds: new Set(),
  availableForms: [],
  isLoadingForms: false,
  onOpenLinkedForm: () => {},
});

export function useFlowCanvasCtx(): FlowCanvasCtx {
  return useContext(FlowCanvasContext);
}
