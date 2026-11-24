import axios from 'axios';
import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useToast } from '../../../components/ui';
import {
  changeFormStatus,
  createForm,
  fetchFormById,
  fetchForms,
  updateForm,
} from '../../forms/services/forms-api';
import { fetchAssignableUsers } from '../../users/services/users-api';
import type {
  FieldConditions,
  FieldSettings,
  FormFieldType,
  VisibilityRule,
} from '../../forms/types';
import {
  mapDraftToCreatePayload,
  type DraftField,
  type DraftFieldOption,
  type DraftSectionBranch,
  type FieldTypeChoice,
  type FormDraft,
} from '../types';
import { createLocalId, mapFormToDraft } from '../state/draft.helpers';
import { builderReducer, makeInitialState } from '../state/builder-reducer';
import { firstValidationMessage, validateDraft } from '../state/draft.validators';
import { useFormBuilderGoogle } from './use-form-builder-google';

const PAGE_SIZE = 20;

function axiosMsg(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.message === 'string'
    ? error.response.data.message
    : fallback;
}

export function useFormBuilder() {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = searchParams.get('mode');
  const selectedFormId = searchParams.get('formId') ?? '';
  const [state, dispatch] = useReducer(builderReducer, undefined, makeInitialState);

  // ── Queries ────────────────────────────────────────────────────────────────

  const formsQ = useQuery({
    queryKey: ['builder', 'forms'],
    queryFn: () => fetchForms({ limit: PAGE_SIZE, page: 1 }),
    staleTime: 30_000,
  });
  const formDetailQ = useQuery({
    queryKey: ['builder', 'form', selectedFormId],
    queryFn: () => fetchFormById(selectedFormId),
    enabled: Boolean(selectedFormId) && mode !== 'new',
    staleTime: 0,
  });
  const usersQ = useQuery({
    queryKey: ['users', 'assignable'],
    queryFn: () => fetchAssignableUsers(),
    staleTime: 5 * 60_000,
  });

  const google = useFormBuilderGoogle(selectedFormId, mode === 'new', () => formsQ.refetch());

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (formDetailQ.data)
      dispatch({ type: 'SET_DRAFT', payload: mapFormToDraft(formDetailQ.data), mode: 'edit' });
  }, [formDetailQ.data]);

  useEffect(() => {
    if (mode === 'new') dispatch({ type: 'RESET_DRAFT' });
  }, [mode]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = mapDraftToCreatePayload(state.draft);
      return mode === 'new' || !selectedFormId
        ? createForm(payload)
        : updateForm(selectedFormId, payload);
    },
    onSuccess: async (created) => {
      await formsQ.refetch();
      const next = new URLSearchParams(searchParams);
      next.delete('mode');
      next.set('formId', created.id);
      setSearchParams(next, { replace: false });
      showToast({
        title: 'Processo salvo',
        description:
          mode === 'new' || !selectedFormId
            ? 'Criado em modo draft.'
            : 'Nova versão em draft salva.',
        variant: 'success',
      });
      if (created.googleLastError)
        showToast({
          title: 'Integração Google pendente',
          description: created.googleLastError,
          variant: 'warning',
        });
    },
    onError: (e) => {
      if (axios.isAxiosError(e) && e.response?.status === 401) return;
      showToast({
        title: 'Falha ao salvar',
        description: axiosMsg(e, 'Falha ao salvar o formulário.'),
        variant: 'error',
      });
    },
  });

  const publishMut = useMutation({
    mutationFn: () => changeFormStatus(selectedFormId, 'published'),
    onSuccess: async () => {
      await Promise.all([formsQ.refetch(), formDetailQ.refetch()]);
      showToast({
        title: 'Formulário publicado',
        description: 'Publicado com sucesso.',
        variant: 'success',
      });
    },
    onError: (e) => {
      if (axios.isAxiosError(e) && e.response?.status === 401) return;
      showToast({
        title: 'Falha ao publicar',
        description: axiosMsg(e, 'Falha ao publicar formulário.'),
        variant: 'error',
      });
    },
  });

  // ── Operations ─────────────────────────────────────────────────────────────

  /** Grava o rascunho. Devolve false se a validação barrou ou o servidor recusou (já avisado). */
  const save = useCallback(async (): Promise<boolean> => {
    const errors = validateDraft(state.draft);
    if (errors) {
      dispatch({ type: 'SET_VALIDATION_ERRORS', errors });
      const title = errors.name
        ? 'Nome obrigatório'
        : errors.description
          ? 'Descrição obrigatória'
          : errors.sections
            ? 'Seção incompleta'
            : errors.fields
              ? 'Campo incompleto'
              : 'Opções obrigatórias';
      showToast({ title, description: firstValidationMessage(errors), variant: 'warning' });
      return false;
    }
    dispatch({ type: 'SET_VALIDATION_ERRORS', errors: null });
    try {
      await saveMut.mutateAsync();
      return true;
    } catch {
      // O onError da mutation já mostrou o aviso.
      return false;
    }
  }, [state.draft, saveMut, showToast]);

  const publish = useCallback(async () => {
    if (!selectedFormId) {
      showToast({
        title: 'Selecione um formulário',
        description: 'Selecione um formulário salvo para publicar.',
        variant: 'warning',
      });
      return;
    }
    await publishMut.mutateAsync();
  }, [selectedFormId, publishMut, showToast]);

  const startNewDraft = useCallback(() => {
    dispatch({ type: 'RESET_DRAFT' });
    const next = new URLSearchParams(searchParams);
    next.delete('formId');
    next.set('mode', 'new');
    setSearchParams(next, { replace: false });
  }, [searchParams, setSearchParams]);

  const openExistingForm = useCallback(
    (formId: string) => {
      if (!formId) {
        startNewDraft();
        return;
      }
      const next = new URLSearchParams(searchParams);
      next.delete('mode');
      next.set('formId', formId);
      setSearchParams(next, { replace: false });
    },
    [searchParams, setSearchParams, startNewDraft],
  );

  // ── Derived ────────────────────────────────────────────────────────────────

  const forms = useMemo(() => formsQ.data?.data ?? [], [formsQ.data]);
  const hasMoreForms = useMemo(() => (formsQ.data?.totalPages ?? 0) > 1, [formsQ.data]);
  const latestVersion = useMemo(() => {
    const v = formDetailQ.data?.versions;
    return v?.length ? [...v].sort((a, b) => b.versionNumber - a.versionNumber)[0] : null;
  }, [formDetailQ.data]);
  const selectedFormSummary = useMemo(
    () => forms.find((f) => f.id === selectedFormId) ?? null,
    [forms, selectedFormId],
  );

  return {
    state,
    dispatch,
    draft: state.draft,
    forms,
    selectedForm: formDetailQ.data ?? null,
    selectedFormSummary,
    selectedFormId,
    latestVersion,
    hasMoreForms,
    assignableUsers: usersQ.data ?? [],
    loadingForms: formsQ.isLoading,
    loadingFormDetail: formDetailQ.isLoading || formDetailQ.isFetching,
    loadingAssignableUsers: usersQ.isLoading,
    saving: saveMut.isPending,
    publishing: publishMut.isPending,
    save,
    saveDraft: save,
    publish,
    publishSelected: publish,
    startNewDraft,
    openExistingForm,
    loadMoreForms: () => void formsQ.refetch(),
    setDraftField: (key: keyof FormDraft, value: FormDraft[keyof FormDraft]) =>
      dispatch({ type: 'SET_DRAFT_FIELD', key, value }),
    /** Adiciona uma seção ao fim e devolve o id dela. */
    addSection: (): string => {
      const sectionId = createLocalId('section');
      dispatch({ type: 'ADD_SECTION', sectionId });
      return sectionId;
    },
    removeSection: (sectionId: string) => dispatch({ type: 'REMOVE_SECTION', sectionId }),
    updateSection: (sectionId: string, key: 'title' | 'description', value: string) =>
      dispatch({ type: 'UPDATE_SECTION', sectionId, key, value }),
    setSectionFlow: (
      sectionId: string,
      nextSectionId: string | null,
      nextIsSubmit: boolean,
      branches: DraftSectionBranch[],
    ) => dispatch({ type: 'SET_SECTION_FLOW', sectionId, nextSectionId, nextIsSubmit, branches }),
    setSectionFlowPosition: (sectionId: string, x: number, y: number) =>
      dispatch({ type: 'SET_SECTION_FLOW_POSITION', sectionId, x, y }),
    /** Reposiciona todas as seções pelo caminho (botão "Organizar" do mapa). */
    organizeSectionFlow: () => dispatch({ type: 'ORGANIZE_SECTION_FLOW' }),
    /** Adiciona o campo ao fim da seção e devolve o id dele. */
    addField: (sectionId: string, fieldType?: FieldTypeChoice): string => {
      const fieldId = createLocalId('field');
      dispatch({ type: 'ADD_FIELD', sectionId, fieldType, fieldId });
      return fieldId;
    },
    removeField: (sectionId: string, fieldId: string) =>
      dispatch({ type: 'REMOVE_FIELD', sectionId, fieldId }),
    /** Duplica o campo logo abaixo dele e devolve o id da cópia. */
    duplicateField: (sectionId: string, fieldId: string): string => {
      const newFieldId = createLocalId('field');
      dispatch({ type: 'DUPLICATE_FIELD', sectionId, fieldId, newFieldId });
      return newFieldId;
    },
    updateField: (
      sectionId: string,
      fieldId: string,
      key: keyof DraftField,
      value:
        | string
        | boolean
        | FormFieldType
        | FieldSettings
        | FieldConditions
        | VisibilityRule[]
        | DraftFieldOption[]
        | null,
    ) => dispatch({ type: 'UPDATE_FIELD', sectionId, fieldId, key, value }),
    moveField: (sectionId: string, fromIndex: number, toIndex: number) =>
      dispatch({ type: 'MOVE_FIELD', sectionId, fromIndex, toIndex }),
    ...google,
  };
}
