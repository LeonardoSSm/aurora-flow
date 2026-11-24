import { syncScoreFields } from '../lib/score-fields';
import { useEffect, useMemo, useState } from 'react';
import { brandCssVars } from '../../../brand/css-vars';
import { useBrand } from '../../../brand/hooks/useBrand';
import {
  decorativeFieldTypes,
  getVisibleSections,
  resolveAnswers,
  validatePublicAnswers,
} from '../../public-form/form-runtime';
import { PublicQuestionField } from '../../public-form/components/public-question-field';
import {
  IdentificationGate,
  OptionalIdentification,
  RespondingAs,
} from '../../public-form/components/responder-identification';
import {
  getResponderIdentificationMode,
  validateResponderIdentification,
  type ResponderIdentificationErrors,
} from '../../public-form/identification';
import { SectionProgressTrail } from '../../public-form/components/section-progress-trail';
import type { PublicAnswerValue, PublicForm } from '../../public-form/types';
import type { FormDraft } from '../types';
import { visibleOptions } from '../../item-lists/linked-options';

type BuilderWizardPreviewProps = {
  draft: FormDraft;
};

export function draftToPreviewForm(draft: FormDraft): PublicForm {
  return {
    id: 'preview_form',
    name: draft.name || 'Formulário sem título',
    description: draft.description || null,
    category: draft.category || null,
    area: draft.area || null,
    status: 'draft',
    activeVersion: {
      id: 'preview_version',
      versionNumber: 1,
      titleDisplay: draft.name || 'Formulário sem título',
      descriptionDisplay: draft.description || null,
      settingsJson: draft.settingsJson,
      // Campos de pontuação com a fórmula que o construtor gera (como ao salvar).
      sections: syncScoreFields(draft.sections).map((section, sectionIndex) => ({
        id: section.id,
        title: section.title || `Seção ${sectionIndex + 1}`,
        description: section.description || null,
        order: sectionIndex + 1,
        nextSectionId: section.nextSectionId,
        nextIsSubmit: section.nextIsSubmit,
        branches: section.branches.map((branch) => ({
          id: branch.id,
          fieldCode: branch.fieldCode,
          optionValue: branch.optionValue,
          checkboxValue: branch.checkboxValue,
          targetSectionId: branch.targetSectionId,
          targetIsSubmit: branch.targetIsSubmit,
        })),
        fields: section.fields.map((field, fieldIndex) => ({
          id: field.id,
          code: field.code,
          label: field.label || 'Campo sem rótulo',
          fieldType: field.fieldType,
          required: field.required,
          order: fieldIndex + 1,
          settingsJson: field.settingsJson,
          conditionsJson: field.conditionsJson,
          visibilityRules: field.visibilityRules,
          // Seleção ligada a uma lista: item desativado não aparece (como no formulário publicado).
          options: visibleOptions(field.options, field.settingsJson, (option) => option.internalValue)
            .filter((option) => option.displayLabel.trim())
            .map((option, optionIndex) => ({
              id: option.id,
              internalValue: option.internalValue,
              displayLabel: option.displayLabel,
              order: optionIndex + 1,
            })),
        })),
      })),
    },
  };
}

export function BuilderWizardPreview({ draft }: BuilderWizardPreviewProps) {
  const brand = useBrand();
  const previewForm = useMemo(() => draftToPreviewForm(draft), [draft]);
  const [values, setValues] = useState<Record<string, PublicAnswerValue>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [currentSectionId, setCurrentSectionId] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  // Identificação de quem responde, como no formulário público (obrigatória = tela de entrada antes
  // das perguntas; opcional = bloco acima delas). Na prévia nada é enviado.
  const identification = getResponderIdentificationMode(draft.settingsJson);
  const [responderName, setResponderName] = useState('');
  const [responderEmail, setResponderEmail] = useState('');
  const [identificationErrors, setIdentificationErrors] = useState<ResponderIdentificationErrors>({});
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const needsIdentification = identification.required && !identityConfirmed;

  function confirmIdentity() {
    const nextErrors = validateResponderIdentification(responderName, responderEmail, true);
    setIdentificationErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) setIdentityConfirmed(true);
  }

  const resolved = useMemo(() => resolveAnswers(previewForm, values), [previewForm, values]);
  const effectiveValues = resolved.answersById;
  const answersByCode = resolved.answersByCode;

  const visibleSections = useMemo(
    () => getVisibleSections(previewForm, answersByCode),
    [answersByCode, previewForm],
  );

  useEffect(() => {
    if (visibleSections.length === 0) {
      if (currentSectionId !== null) setCurrentSectionId(null);
      return;
    }
    const stillOnPath = visibleSections.some((section) => section.id === currentSectionId);
    if (!stillOnPath) {
      setCurrentSectionId(visibleSections[0].id);
    }
  }, [visibleSections, currentSectionId]);

  const currentIndex = Math.max(
    0,
    visibleSections.findIndex((section) => section.id === currentSectionId),
  );
  const totalSteps = visibleSections.length;
  const currentSection = visibleSections[currentIndex] ?? null;

  function updateFieldValue(fieldId: string, value: PublicAnswerValue) {
    setValues((current) => ({ ...current, [fieldId]: value }));
    setErrors((current) => {
      if (!current[fieldId]) {
        return current;
      }
      const next = { ...current };
      delete next[fieldId];
      return next;
    });
  }

  function validateCurrentSection(): boolean {
    if (!currentSection) return true;
    const allErrors = validatePublicAnswers(previewForm, effectiveValues, answersByCode);
    const scopedFieldIds = new Set(
      currentSection.fields
        .filter((field) => !decorativeFieldTypes.has(field.fieldType))
        .map((field) => field.id),
    );
    const nextErrors = Object.fromEntries(
      Object.entries(allErrors).filter(([fieldId]) => scopedFieldIds.has(fieldId)),
    );
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function handleNext() {
    if (!validateCurrentSection()) return;
    if (currentIndex >= totalSteps - 1) {
      setCompleted(true);
      return;
    }
    setCurrentSectionId(visibleSections[currentIndex + 1].id);
  }

  function handlePrev() {
    if (currentIndex <= 0) return;
    setCurrentSectionId(visibleSections[currentIndex - 1].id);
  }

  function handleRestart() {
    setValues({});
    setErrors({});
    setCompleted(false);
    setCurrentSectionId(visibleSections[0]?.id ?? null);
    setResponderName('');
    setResponderEmail('');
    setIdentificationErrors({});
    setIdentityConfirmed(false);
  }

  return (
    <div
      className="overflow-hidden rounded-[20px] border border-border-strong"
      style={{ ...brandCssVars(brand), background: 'var(--tf-background)' }}
    >
      <div className="relative overflow-hidden" style={{ background: 'var(--tf-primary-light)', padding: '36px 24px 56px' }}>
        {brand.backgrounds.patternLight ? (
          <img
            src={brand.backgrounds.patternLight}
            alt=""
            className="pointer-events-none absolute rounded-full object-cover"
            style={{ top: -40, right: -60, width: 280, height: 280, opacity: 0.14 }}
          />
        ) : null}
        <div className="relative mx-auto" style={{ maxWidth: 672 }}>
          <div
            className="inline-flex items-center gap-2 rounded-full font-extrabold uppercase"
            style={{
              background: 'var(--tf-secondary)',
              color: 'var(--tf-text)',
              fontSize: 11,
              letterSpacing: '0.06em',
              padding: '6px 14px',
              marginBottom: 18,
            }}
          >
            Pré-visualização · assim seu formulário será exibido
          </div>
          <h1
            className="font-extrabold"
            style={{ fontSize: 28, color: 'var(--tf-primary)', margin: '0 0 8px', letterSpacing: '-0.01em' }}
          >
            {draft.name || 'Formulário sem título'}
          </h1>
          {draft.description ? (
            <p style={{ fontSize: 15, color: 'var(--tf-text-muted)', margin: '0 0 30px', maxWidth: 520, lineHeight: 1.5 }}>
              {draft.description}
            </p>
          ) : (
            <div style={{ marginBottom: 22 }} />
          )}
          <SectionProgressTrail current={currentIndex} total={totalSteps} />
        </div>
      </div>

      <div style={{ padding: '0 24px 40px' }}>
        <div
          className="relative mx-auto box-border"
          style={{
            maxWidth: 672,
            marginTop: -32,
            background: 'var(--tf-surface)',
            borderRadius: 20,
            boxShadow: '0 20px 40px -12px rgba(26,60,143,0.18)',
            padding: 40,
          }}
        >
          {completed ? (
            <div className="text-center" style={{ padding: '16px 0 8px' }}>
              <div
                className="mx-auto flex items-center justify-center rounded-full font-extrabold text-white"
                style={{ width: 64, height: 64, background: 'var(--tf-accent)', fontSize: 28, marginBottom: 20 }}
              >
                ✓
              </div>
              <h2 className="font-extrabold" style={{ fontSize: 22, color: 'var(--tf-text)', margin: '0 0 10px' }}>
                Teste concluído
              </h2>
              <p
                className="mx-auto text-sm"
                style={{ color: 'var(--tf-text-muted)', maxWidth: 420, margin: '0 auto 24px', lineHeight: 1.6 }}
              >
                Assim é a experiência de quem for responder. Ajuste as seções e teste de novo quantas vezes quiser.
              </p>
              <button
                type="button"
                onClick={handleRestart}
                className="font-bold text-white"
                style={{ background: 'var(--tf-primary)', border: 'none', padding: '12px 24px', borderRadius: 12, fontSize: 14 }}
              >
                Reiniciar teste
              </button>
            </div>
          ) : needsIdentification ? (
            <IdentificationGate
              name={responderName}
              email={responderEmail}
              errors={identificationErrors}
              onNameChange={setResponderName}
              onEmailChange={setResponderEmail}
              onConfirm={confirmIdentity}
            />
          ) : currentSection ? (
            <div>
              {identification.required ? (
                <div style={{ marginBottom: 20 }}>
                  <RespondingAs
                    name={responderName}
                    email={responderEmail}
                    onChange={() => setIdentityConfirmed(false)}
                  />
                </div>
              ) : identification.show ? (
                <div style={{ marginBottom: 24 }}>
                  <OptionalIdentification
                    name={responderName}
                    email={responderEmail}
                    errors={identificationErrors}
                    onNameChange={setResponderName}
                    onEmailChange={setResponderEmail}
                  />
                </div>
              ) : null}
              <div className="flex items-start gap-3.5">
                <div
                  className="flex shrink-0 items-center justify-center font-extrabold text-white"
                  style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--tf-primary)', fontSize: 16 }}
                >
                  {currentIndex + 1}
                </div>
                <div className="flex-1">
                  <div
                    className="text-[11px] font-extrabold uppercase"
                    style={{ color: 'var(--tf-secondary)', letterSpacing: '0.06em' }}
                  >
                    Etapa {currentIndex + 1} de {totalSteps}
                  </div>
                  <h2 className="font-extrabold" style={{ fontSize: 20, color: 'var(--tf-text)', margin: '2px 0 0' }}>
                    {currentSection.title}
                  </h2>
                  {currentSection.description ? (
                    <p className="text-sm" style={{ color: 'var(--tf-text-muted)', margin: '8px 0 0', lineHeight: 1.5 }}>
                      {currentSection.description}
                    </p>
                  ) : null}
                </div>
              </div>

              <div
                style={{
                  height: 1,
                  margin: '24px 0 28px',
                  background: 'linear-gradient(90deg, var(--tf-secondary), var(--tf-border) 60%, transparent)',
                }}
              />

              <div className="grid gap-6">
                {currentSection.fields.map((field) => (
                  <PublicQuestionField
                    key={field.id}
                    field={field}
                    value={effectiveValues[field.id] ?? null}
                    error={errors[field.id]}
                    onChange={(nextValue) => updateFieldValue(field.id, nextValue)}
                    onToggleMulti={(optionValue, checked) => {
                      const current = Array.isArray(values[field.id])
                        ? (values[field.id] as string[])
                        : [];
                      updateFieldValue(
                        field.id,
                        checked
                          ? [...current, optionValue]
                          : current.filter((item) => item !== optionValue),
                      );
                    }}
                  />
                ))}
              </div>

              <div style={{ height: 1, margin: '24px 0 24px', background: 'var(--tf-border)' }} />

              <div className="flex flex-wrap items-center justify-end gap-2.5">
                {currentIndex > 0 ? (
                  <button
                    type="button"
                    onClick={handlePrev}
                    className="font-bold"
                    style={{
                      background: 'var(--tf-surface)',
                      color: 'var(--tf-primary)',
                      border: '1.5px solid var(--tf-primary)',
                      padding: '12px 22px',
                      borderRadius: 12,
                      fontSize: 14,
                    }}
                  >
                    Voltar
                  </button>
                ) : null}
                {currentIndex < totalSteps - 1 ? (
                  <button
                    type="button"
                    onClick={handleNext}
                    className="font-bold"
                    style={{
                      background: 'var(--tf-primary)',
                      color: '#fff',
                      border: 'none',
                      padding: '12px 26px',
                      borderRadius: 12,
                      fontSize: 14,
                    }}
                  >
                    Continuar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleNext}
                    className="font-extrabold"
                    style={{
                      background: 'var(--tf-secondary)',
                      color: 'var(--tf-text)',
                      border: 'none',
                      padding: '12px 26px',
                      borderRadius: 12,
                      fontSize: 14,
                    }}
                  >
                    Concluir teste
                  </button>
                )}
              </div>
            </div>
          ) : (
            <p style={{ color: 'var(--tf-text-muted)' }}>Nenhuma seção configurada ainda.</p>
          )}
        </div>
      </div>
    </div>
  );
}
