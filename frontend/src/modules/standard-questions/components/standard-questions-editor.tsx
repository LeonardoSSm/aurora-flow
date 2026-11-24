import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Trash2, HelpCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useToast } from '../../../components/ui';
import { sharedFieldTypeOptions, supportsOptions } from '../../builder/types';
import { useStandardQuestionsQuery } from '../hooks/use-standard-questions-query';
import { useSaveStandardQuestionsMutation } from '../hooks/use-save-standard-questions-mutation';
import type { SaveStandardQuestionInput } from '../services/standard-questions-api';
import type { DraftStandardQuestion, StandardQuestion } from '../types';

function makeLocalId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function toDraft(questions: StandardQuestion[]): DraftStandardQuestion[] {
  return questions.map((question) => ({
    id: question.id,
    serverId: question.id,
    code: question.code,
    label: question.label,
    fieldType: question.fieldType,
    required: question.required,
    settingsJson: question.settingsJson ?? {},
    options: question.optionsJson ?? [],
  }));
}

function toSavePayload(questions: DraftStandardQuestion[]): SaveStandardQuestionInput[] {
  return questions.map((question, index) => ({
    id: question.serverId ?? undefined,
    code: question.code.trim() || `pergunta_${index + 1}`,
    label: question.label.trim() || `Pergunta ${index + 1}`,
    fieldType: question.fieldType,
    required: question.required,
    order: index,
    settingsJson: question.settingsJson,
    options: supportsOptions(question.fieldType) ? question.options : undefined,
  }));
}

function slugify(label: string): string {
  return (
    label
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || makeLocalId('pergunta')
  );
}

function QuestionRow({
  question,
  onChange,
  onRemove,
}: {
  question: DraftStandardQuestion;
  onChange: (next: DraftStandardQuestion) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: question.id,
  });
  const hasOptions = supportsOptions(question.fieldType);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
      className="flex min-w-0 flex-col gap-2 rounded-[10px] border border-border-strong bg-bg-surface p-3"
    >
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="grid h-8 w-8 shrink-0 cursor-grab place-items-center text-tx-muted active:cursor-grabbing"
          aria-label="Reordenar pergunta"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <input
          value={question.label}
          onChange={(e) => {
            const label = e.target.value;
            onChange({ ...question, label, code: question.serverId ? question.code : slugify(label) });
          }}
          placeholder="Pergunta (ex: Área de interesse)"
          className="h-9 min-w-0 flex-1 rounded-[8px] border border-border-default bg-bg-s2 px-2.5 text-sm font-semibold text-tx-primary outline-none focus:border-primary"
        />
        <select
          value={question.fieldType}
          onChange={(e) => onChange({ ...question, fieldType: e.target.value as typeof question.fieldType })}
          className="h-9 shrink-0 rounded-[8px] border border-border-default bg-bg-s2 px-2 text-xs text-tx-primary"
        >
          {sharedFieldTypeOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <label className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-tx-secondary">
          <input
            type="checkbox"
            checked={question.required}
            onChange={(e) => onChange({ ...question, required: e.target.checked })}
            className="h-3.5 w-3.5 rounded border-border-default"
          />
          Obrigatória
        </label>
        <button
          type="button"
          onClick={onRemove}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-tx-muted hover:bg-error/10 hover:text-error"
          aria-label="Remover pergunta"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {hasOptions ? (
        <div className="flex min-w-0 flex-col gap-1.5 pl-10">
          {question.options.map((option, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <input
                value={option.label}
                onChange={(e) => {
                  const label = e.target.value;
                  const next = [...question.options];
                  next[index] = { value: slugify(label), label };
                  onChange({ ...question, options: next });
                }}
                placeholder={`Opção ${index + 1}`}
                className="h-7 flex-1 rounded-md border border-border-default bg-bg-s2 px-2 text-[11px] text-tx-primary outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() =>
                  onChange({ ...question, options: question.options.filter((_, i) => i !== index) })
                }
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-tx-muted hover:bg-error/10 hover:text-error"
                aria-label="Remover opção"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              onChange({
                ...question,
                options: [
                  ...question.options,
                  { value: slugify(`opcao_${question.options.length + 1}`), label: '' },
                ],
              })
            }
            className="w-fit text-[11px] font-semibold text-primary hover:underline"
          >
            + Opção
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function StandardQuestionsEditor({ formId }: { formId: string | null }) {
  const { showToast } = useToast();
  const questionsQuery = useStandardQuestionsQuery(formId);
  const saveMutation = useSaveStandardQuestionsMutation(formId);

  const [draft, setDraft] = useState<DraftStandardQuestion[]>([]);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (questionsQuery.data && !initializedRef.current) {
      setDraft(toDraft(questionsQuery.data));
      initializedRef.current = true;
    }
  }, [questionsQuery.data]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  if (!formId) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[10px] border border-dashed border-border-strong bg-bg-surface py-16 text-center">
        <HelpCircle className="mb-3 h-8 w-8 text-tx-muted" />
        <p className="text-sm font-semibold text-tx-secondary">
          Salve o formulário primeiro para configurar as perguntas padrão.
        </p>
      </div>
    );
  }

  if (questionsQuery.isLoading) {
    return <p className="text-sm text-tx-secondary">Carregando perguntas...</p>;
  }

  function addQuestion() {
    const newQuestion: DraftStandardQuestion = {
      id: makeLocalId('question'),
      serverId: null,
      code: slugify(`pergunta_${draft.length + 1}`),
      label: '',
      fieldType: 'short_text',
      required: false,
      settingsJson: {},
      options: [],
    };
    setDraft((current) => [...current, newQuestion]);
  }

  function updateQuestion(id: string, next: DraftStandardQuestion) {
    setDraft((current) => current.map((q) => (q.id === id ? next : q)));
  }

  function removeQuestion(id: string) {
    setDraft((current) => current.filter((q) => q.id !== id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDraft((current) => {
      const oldIndex = current.findIndex((q) => q.id === active.id);
      const newIndex = current.findIndex((q) => q.id === over.id);
      return arrayMove(current, oldIndex, newIndex);
    });
  }

  async function handleSave() {
    try {
      const saved = await saveMutation.mutateAsync(toSavePayload(draft));
      setDraft(toDraft(saved));
      showToast({
        title: 'Perguntas salvas',
        description: 'A configuração de perguntas padrão foi atualizada.',
        variant: 'success',
      });
    } catch {
      showToast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar as perguntas. Tente novamente.',
        variant: 'error',
      });
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-tx-primary">Perguntas padrão</h3>
          <p className="text-sm text-tx-secondary">
            Perguntas fixas que ficam dentro de toda solicitação deste formulário, para o
            atendente responder — as respostas são salvas junto com a solicitação.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saveMutation.isPending}
          className="h-10 shrink-0 rounded-[8px] bg-primary px-4 text-sm font-bold text-white disabled:opacity-60"
        >
          {saveMutation.isPending ? 'Salvando...' : 'Salvar perguntas'}
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={draft.map((q) => q.id)} strategy={verticalListSortingStrategy}>
          <div className="grid gap-2.5">
            {draft.map((question) => (
              <QuestionRow
                key={question.id}
                question={question}
                onChange={(next) => updateQuestion(question.id, next)}
                onRemove={() => removeQuestion(question.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <button
        type="button"
        onClick={addQuestion}
        className="inline-flex w-fit items-center justify-center gap-1.5 rounded-[8px] border-2 border-dashed border-border-strong px-4 py-2 text-sm font-bold text-tx-secondary hover:border-primary hover:text-primary"
      >
        <Plus className="h-4 w-4" />
        Adicionar pergunta
      </button>
    </div>
  );
}
