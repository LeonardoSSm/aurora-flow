import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../../../components/ui';
import { queryKeys } from '../../../lib/query-keys';
import { useRoleOptionsQuery } from '../../admin/hooks/use-roles';
import type { FormulaAvailableField } from '../../builder/components/formula-editor';
import { useFlowFormFields } from '../../flows/hooks/use-flow-form-fields';
import type { FormFieldType } from '../../forms/types';
import { isPhaseLayoutType } from '../lib/phase-field-types';
import { NO_PEOPLE } from '../lib/phase-people';
import {
  draftSaveIssue,
  EMPTY_VISIBILITY,
  makeLocalId,
  slugify,
  toDraft,
  toSavePayload,
} from '../lib/phase-draft';
import { PHASE_COLOR_PALETTE, type DraftKanbanPhase } from '../types';
import { useKanbanPhasesQuery } from './use-kanban-phases-query';
import { useSaveKanbanPhasesMutation } from './use-save-kanban-phases-mutation';

export function newDraftPhase(index: number): DraftKanbanPhase {
  return {
    id: makeLocalId('phase'),
    serverId: null,
    key: slugify(`fase_${index + 1}`),
    label: '',
    color: PHASE_COLOR_PALETTE[index % PHASE_COLOR_PALETTE.length].value,
    description: '',
    isTerminal: false,
    actors: { ...NO_PEOPLE },
    requiresApproval: false,
    approvers: { ...NO_PEOPLE },
    approvalMode: 'any',
    approvalRequest: 'manual',
    approvalOnApproved: 'stay',
    approvalOnRejected: 'stay',
    requireFieldsToExit: false,
    requireAssigneeToExit: false,
    blockMoveBack: false,
    restrictVisibility: false,
    visibleTo: { ...EMPTY_VISIBILITY },
    slaHours: null,
    slaBusinessHours: false,
    slaWarningPercent: null,
    fields: [],
    sectionFlow: {},
  };
}

/**
 * Rascunho das fases de um formulário/processo: carrega do servidor uma vez, guarda as edições
 * locais e grava tudo junto em `save()`. Usado pelo editor de fases e pelo mapa do processo.
 */
export function usePhasesDraft(formId: string | null) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const phasesQuery = useKanbanPhasesQuery(formId);
  const saveMutation = useSaveKanbanPhasesMutation(formId);
  const roleOptionsQuery = useRoleOptionsQuery();
  const roleOptions = useMemo(() => roleOptionsQuery.data ?? [], [roleOptionsQuery.data]);

  const [draft, setDraft] = useState<DraftKanbanPhase[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const initializedForRef = useRef<string | null>(null);

  useEffect(() => {
    // Troca de formulário: o rascunho anterior não vale para o novo.
    if (initializedForRef.current !== formId) {
      initializedForRef.current = null;
      setDraft([]);
      setSavedSnapshot('');
    }
  }, [formId]);

  useEffect(() => {
    if (phasesQuery.data && formId && initializedForRef.current !== formId) {
      const initial = toDraft(phasesQuery.data);
      setDraft(initial);
      setSavedSnapshot(JSON.stringify(toSavePayload(initial)));
      initializedForRef.current = formId;
    }
  }, [phasesQuery.data, formId]);

  const initialized = initializedForRef.current === formId && formId !== null;
  const hasUnsavedChanges = useMemo(
    () => initialized && JSON.stringify(toSavePayload(draft)) !== savedSnapshot,
    [initialized, draft, savedSnapshot],
  );

  // "Cálculo" de fase: campos do formulário (salvos) + os das fases como estão no rascunho.
  const formFieldsQuery = useFlowFormFields(formId);
  const formulaFieldsFor = useCallback(
    (phaseId: string): FormulaAvailableField[] => [
      ...(formFieldsQuery.data ?? [])
        .filter((field) => !field.phaseLabel)
        .map((field) => ({ code: field.code, label: field.label, fieldType: field.fieldType as FormFieldType })),
      ...draft
        .filter((phase) => phase.id !== phaseId)
        .flatMap((phase) =>
          phase.fields
            .filter((field) => !isPhaseLayoutType(field.fieldType) && field.code)
            .map((field) => ({
              code: field.code,
              label: `${field.label || field.code} (fase ${phase.label || 'sem nome'})`,
              fieldType: field.fieldType,
            })),
        ),
    ],
    [formFieldsQuery.data, draft],
  );

  /** Acrescenta uma fase ao fim e devolve o id local dela. */
  const addPhase = useCallback((): string => {
    const phase = newDraftPhase(draft.length);
    setDraft((current) => [...current, phase]);
    return phase.id;
  }, [draft.length]);

  const updatePhase = useCallback((phaseId: string, next: DraftKanbanPhase) => {
    setDraft((current) => current.map((p) => (p.id === phaseId ? next : p)));
  }, []);

  const removePhase = useCallback((phaseId: string) => {
    setDraft((current) => current.filter((p) => p.id !== phaseId));
  }, []);

  const movePhase = useCallback((fromIndex: number, toIndex: number) => {
    setDraft((current) => {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return current;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(Math.min(toIndex, next.length), 0, moved);
      return next;
    });
  }, []);

  /** Grava as fases. Devolve false (com aviso) se o rascunho não pode ser salvo ou o servidor recusou. */
  const save = useCallback(async (): Promise<boolean> => {
    const issue = draftSaveIssue(draft);
    if (issue) {
      showToast({ title: 'Revise as fases', description: issue, variant: 'error' });
      return false;
    }
    try {
      const saved = await saveMutation.mutateAsync(toSavePayload(draft));
      const next = toDraft(saved);
      setDraft(next);
      setSavedSnapshot(JSON.stringify(toSavePayload(next)));
      if (formId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.solicitations.kanbanBoard(formId) });
        // Campos de fase entram nas listas de campos (fluxos, "Valor do card", fórmulas).
        void queryClient.invalidateQueries({ queryKey: ['panel-form-fields', formId] });
      }
      showToast({ title: 'Fases salvas', description: 'A configuração do Kanban foi atualizada.', variant: 'success' });
      return true;
    } catch {
      showToast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar as fases. Tente novamente.',
        variant: 'error',
      });
      return false;
    }
  }, [draft, formId, queryClient, saveMutation, showToast]);

  return {
    draft,
    setDraft,
    roleOptions,
    isLoading: phasesQuery.isLoading,
    initialized,
    hasUnsavedChanges,
    isSaving: saveMutation.isPending,
    formulaFieldsFor,
    addPhase,
    updatePhase,
    removePhase,
    movePhase,
    save,
  };
}
