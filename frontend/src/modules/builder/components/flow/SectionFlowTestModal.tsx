import { CheckCircle2, RotateCcw, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  decorativeFieldTypes,
  getAnswerComparableValue,
  isFieldVisible,
  resolveNextSectionId,
  validateFieldValue,
} from '../../../public-form/form-runtime';
import { PublicQuestionField } from '../../../public-form/components/public-question-field';
import type { PublicAnswerValue, PublicFieldErrorMap } from '../../../public-form/types';
import { draftToPreviewForm } from '../builder-wizard-preview';
import type { FormDraft } from '../../types';

type SectionFlowTestModalProps = {
  draft: FormDraft;
  onClose: () => void;
};

export function SectionFlowTestModal({ draft, onClose }: SectionFlowTestModalProps) {
  const previewForm = useMemo(() => draftToPreviewForm(draft), [draft]);
  const firstSectionId = previewForm.activeVersion.sections[0]?.id ?? null;

  const [answers, setAnswers] = useState<Record<string, PublicAnswerValue>>({});
  const [errors, setErrors] = useState<PublicFieldErrorMap>({});
  const [currentSectionId, setCurrentSectionId] = useState<string | null>(firstSectionId);
  const [visitedIds, setVisitedIds] = useState<string[]>(firstSectionId ? [firstSectionId] : []);
  const [completed, setCompleted] = useState(false);

  const answersByCode = useMemo(() => {
    return previewForm.activeVersion.sections
      .flatMap((section) => section.fields)
      .reduce<Record<string, PublicAnswerValue>>((accumulator, field) => {
        accumulator[field.code] = getAnswerComparableValue(answers[field.id] ?? null) as
          | PublicAnswerValue
          | null;
        return accumulator;
      }, {});
  }, [answers, previewForm]);

  const currentSection = previewForm.activeVersion.sections.find(
    (section) => section.id === currentSectionId,
  );
  const visibleFields = (currentSection?.fields ?? []).filter(
    (field) => !decorativeFieldTypes.has(field.fieldType) && isFieldVisible(field, answersByCode),
  );
  const isLastStep = currentSection
    ? resolveNextSectionId(currentSection, answersByCode) === null
    : true;

  function updateAnswer(fieldId: string, value: PublicAnswerValue) {
    setAnswers((current) => ({ ...current, [fieldId]: value }));
    setErrors((current) => {
      if (!current[fieldId]) return current;
      const next = { ...current };
      delete next[fieldId];
      return next;
    });
  }

  function handleReset() {
    setAnswers({});
    setErrors({});
    setCurrentSectionId(firstSectionId);
    setVisitedIds(firstSectionId ? [firstSectionId] : []);
    setCompleted(false);
  }

  function handleAdvance() {
    if (!currentSection) return;

    const nextErrors: PublicFieldErrorMap = {};
    for (const field of visibleFields) {
      const error = validateFieldValue(field, answers[field.id] ?? null);
      if (error) nextErrors[field.id] = error;
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const nextId = resolveNextSectionId(currentSection, answersByCode);
    if (!nextId) {
      setCompleted(true);
      return;
    }
    setCurrentSectionId(nextId);
    setVisitedIds((current) => [...current, nextId]);
  }

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-[#071a38]/50 px-4 py-6">
      <section className="flex max-h-[85vh] w-full max-w-[640px] flex-col overflow-hidden rounded-[14px] bg-bg-surface shadow-2xl">
        <header className="flex items-center justify-between gap-4 border-b border-border-default px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-tx-secondary">
              Testar fluxo
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-tx-secondary">
              {visitedIds.map((id, i) => {
                const title =
                  previewForm.activeVersion.sections.find((s) => s.id === id)?.title ??
                  'Seção sem título';
                return (
                  <span key={id} className="flex items-center gap-1">
                    {i > 0 ? <span className="opacity-50">→</span> : null}
                    <span
                      className={id === currentSectionId ? 'font-bold text-primary' : undefined}
                    >
                      {title}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-bg-hover"
          >
            <X className="h-5 w-5 text-tx-secondary" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {completed ? (
            <div className="grid place-items-center gap-3 py-10 text-center">
              <CheckCircle2 className="h-12 w-12 text-[#16A34A]" />
              <p className="text-lg font-bold text-tx-primary">Fluxo concluído</p>
              <p className="max-w-sm text-sm text-tx-secondary">
                Caminho percorrido: {visitedIds.length} seção(ões) até o envio.
              </p>
            </div>
          ) : currentSection ? (
            <div className="grid gap-4">
              <div>
                <h3 className="text-lg font-bold text-tx-primary">{currentSection.title}</h3>
                {currentSection.description ? (
                  <p className="mt-1 text-sm text-tx-secondary">{currentSection.description}</p>
                ) : null}
              </div>
              {visibleFields.map((field) => (
                <PublicQuestionField
                  key={field.id}
                  field={field}
                  value={answers[field.id] ?? null}
                  error={errors[field.id]}
                  onChange={(value) => updateAnswer(field.id, value)}
                  onToggleMulti={(optionValue, checked) => {
                    const current = Array.isArray(answers[field.id])
                      ? (answers[field.id] as string[])
                      : [];
                    updateAnswer(
                      field.id,
                      checked
                        ? [...current, optionValue]
                        : current.filter((item) => item !== optionValue),
                    );
                  }}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-tx-secondary">Nenhuma seção para testar.</p>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-border-default px-5 py-4">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 text-sm font-bold text-tx-secondary hover:text-tx-primary"
          >
            <RotateCcw className="h-4 w-4" />
            Reiniciar
          </button>
          {!completed ? (
            <button
              type="button"
              onClick={handleAdvance}
              className="h-10 rounded-[8px] bg-primary px-5 text-sm font-bold text-white"
            >
              {isLastStep ? 'Enviar' : 'Avançar'}
            </button>
          ) : null}
        </footer>
      </section>
    </div>
  );
}
