import axios from 'axios';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../../../components/ui';
import {
  getErpTableChangedFields,
  getErpUnavailableMessage,
} from '../../erp-lookup/erp-lookup-api';
import { isErpTableAnswer } from '../erp-table';
import { focusFirstInvalidField } from '../field-a11y';
import {
  decorativeFieldTypes,
  fieldToSubmitItem,
  getVisibleSections,
  mapVisibleFields,
  resolveAnswers,
  validatePendingFileLabels,
  validatePublicAnswers,
} from '../form-runtime';
import { uploadLabel, type PendingUpload } from '../../../lib/attachment-upload';
import {
  type ResponderIdentificationErrors,
  getResponderIdentificationMode,
  pickIdentificationErrors,
  validateResponderIdentification,
} from '../identification';
import {
  fetchPublicForm,
  submitProgress,
  submitPublicForm,
  uploadSubmissionAttachment,
} from '../services/public-form-api';
import type {
  PublicAnswerValue,
  PublicFieldErrorMap,
  PublicForm,
  PublicSubmitItem,
} from '../types';

type AnswersState = Record<string, PublicAnswerValue>;

/** Erros de identificação de um 422 do envio (chaves `responderName`/`responderEmail`). */
function extractApiIdentificationErrors(error: unknown): ResponderIdentificationErrors {
  if (!axios.isAxiosError(error) || error.response?.status !== 422) return {};
  const payload = error.response.data as { errors?: Record<string, string> } | undefined;
  return pickIdentificationErrors(payload?.errors);
}

function extractApiMessage(error: unknown): string | null {
  if (!axios.isAxiosError(error) || !error.response?.data) {
    return null;
  }

  const payload = error.response.data as
    | { message?: string | string[]; error?: string }
    | undefined;
  if (!payload) {
    return null;
  }

  if (Array.isArray(payload.message) && payload.message.length > 0) {
    return payload.message.join('; ');
  }

  if (typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message;
  }

  if (typeof payload.error === 'string' && payload.error.trim()) {
    return payload.error;
  }

  return null;
}

function extractApiFieldErrors(
  error: unknown,
  form: PublicForm | null,
): PublicFieldErrorMap | null {
  if (
    !axios.isAxiosError(error) ||
    error.response?.status !== 422 ||
    !error.response.data ||
    !form
  ) {
    return null;
  }

  const payload = error.response.data as { errors?: Record<string, string> } | undefined;
  if (!payload?.errors) {
    return null;
  }

  const fieldByCode = new Map(
    form.activeVersion.sections.flatMap((section) =>
      section.fields.map((field) => [field.code, field.id]),
    ),
  );

  return Object.entries(payload.errors).reduce<PublicFieldErrorMap>(
    (accumulator, [fieldCode, message]) => {
      const fieldId = fieldByCode.get(fieldCode);
      if (fieldId) {
        accumulator[fieldId] = message;
      }
      return accumulator;
    },
    {},
  );
}

function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Conta logada no navegador, quando há: preenche a identificação obrigatória e pula a entrada. */
export type PublicFormAccount = { fullName: string; email: string } | null;

export function usePublicForm(formId: string | undefined, account: PublicFormAccount = null) {
  const { showToast } = useToast();
  const captchaSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() ?? '';
  const isCaptchaEnabled = captchaSiteKey.length > 0;
  const [form, setForm] = useState<PublicForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<AnswersState>({});
  const [fieldErrors, setFieldErrors] = useState<PublicFieldErrorMap>({});
  const [pendingFiles, setPendingFiles] = useState<Record<string, PendingUpload[]>>({});
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [responderName, setResponderName] = useState('');
  const [responderEmail, setResponderEmail] = useState('');
  const [identificationErrors, setIdentificationErrors] = useState<ResponderIdentificationErrors>({});
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [submissionCount, setSubmissionCount] = useState(0);
  const [currentSectionId, setCurrentSectionId] = useState<string | null>(null);
  // Mensagem do popup "banco do ERP fora do ar" (envio recusado com 503 ERP_INDISPONIVEL).
  const [erpUnavailableMessage, setErpUnavailableMessage] = useState<string | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);
  const progressIdRef = useRef<string | null>(null);

  // `answers` guarda só o que o respondente digitou; os campos calculados são
  // derivados aqui e é este mapa efetivo que valida, exibe e envia.
  const resolved = useMemo(() => {
    if (!form) {
      return {
        answersById: {} as Record<string, PublicAnswerValue>,
        answersByCode: {} as Record<string, PublicAnswerValue>,
      };
    }
    return resolveAnswers(form, answers);
  }, [answers, form]);
  const effectiveAnswers = resolved.answersById;
  const answersByCode = resolved.answersByCode;

  const visibleSections = useMemo(() => {
    if (!form) {
      return [];
    }
    return getVisibleSections(form, answersByCode);
  }, [answersByCode, form]);

  const answerableFields = useMemo(() => {
    if (!form) {
      return [];
    }
    return mapVisibleFields(form, answersByCode);
  }, [answersByCode, form]);

  const isStepper = form?.activeVersion.settingsJson.mode === 'stepper';
  const identificationRequired = form
    ? getResponderIdentificationMode(form.activeVersion.settingsJson).required
    : false;
  // Identificação obrigatória: nada do formulário aparece até a pessoa passar pela tela de
  // entrada (ou estar logada). "Trocar" volta para a entrada sem perder as respostas.
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const needsIdentification = identificationRequired && !identityConfirmed;
  const accountAppliedRef = useRef(false);

  useEffect(() => {
    if (!identificationRequired || !account || accountAppliedRef.current) return;
    accountAppliedRef.current = true;
    setResponderName((current) => current || account.fullName.trim());
    setResponderEmail((current) => current || account.email.trim());
    // Conta sem nome ou com e-mail estranho: só preenche, e a pessoa confirma na entrada.
    const accountErrors = validateResponderIdentification(account.fullName, account.email, true);
    if (Object.keys(accountErrors).length === 0) setIdentityConfirmed(true);
  }, [identificationRequired, account]);
  const totalSteps = visibleSections.length;
  const currentStep = useMemo(() => {
    const idx = visibleSections.findIndex((section) => section.id === currentSectionId);
    return idx >= 0 ? idx : 0;
  }, [visibleSections, currentSectionId]);
  const activeSections = visibleSections[currentStep] ? [visibleSections[currentStep]] : [];

  useEffect(() => {
    progressIdRef.current = null;
  }, [form?.id]);

  useEffect(() => {
    if (!isStepper || !form || !currentSectionId || needsIdentification) {
      return;
    }
    const items = answerableFields
      .map((field) => fieldToSubmitItem(field, effectiveAnswers[field.id] ?? null))
      .filter((item): item is PublicSubmitItem => item !== null);

    submitProgress({
      formVersionId: form.activeVersion.id,
      sectionId: currentSectionId,
      progressId: progressIdRef.current ?? undefined,
      items,
    })
      .then(({ progressId }) => {
        progressIdRef.current = progressId;
      })
      .catch(() => {
        // Fire-and-forget: a failed progress ping must never block navigation.
      });
    // Intentionally scoped to section transitions only, not every keystroke —
    // `answers`/`answerableFields` are read from the closure at fire time.
  }, [isStepper, form, currentSectionId, needsIdentification]);

  const loadPublicForm = useCallback(async () => {
    if (!formId) {
      setError('Formulário não informado.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchPublicForm(formId);
      setForm(data);
      setAnswers({});
      setFieldErrors({});
      setCurrentSectionId(null);
    } catch (loadError) {
      if (axios.isAxiosError(loadError) && loadError.response?.status === 404) {
        setError('Formulário público não encontrado ou ainda não foi publicado.');
      } else {
        setError(extractApiMessage(loadError) ?? 'Não foi possível carregar este formulário.');
      }
    } finally {
      setLoading(false);
    }
  }, [formId]);

  useEffect(() => {
    loadPublicForm();
  }, [loadPublicForm]);

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

  const setAnswer = useCallback((fieldId: string, value: PublicAnswerValue) => {
    setAnswers((current) => ({
      ...current,
      [fieldId]: value,
    }));
    setFieldErrors((current) => {
      if (!current[fieldId]) {
        return current;
      }
      const next = { ...current };
      delete next[fieldId];
      return next;
    });
  }, []);

  const toggleMultiOption = useCallback(
    (fieldId: string, optionValue: string, checked: boolean) => {
      setAnswers((current) => {
        const currentList = Array.isArray(current[fieldId])
          ? [...(current[fieldId] as string[])]
          : [];
        const nextSet = new Set(currentList);
        if (checked) {
          nextSet.add(optionValue);
        } else {
          nextSet.delete(optionValue);
        }
        return {
          ...current,
          [fieldId]: Array.from(nextSet),
        };
      });
      setFieldErrors((current) => {
        if (!current[fieldId]) {
          return current;
        }
        const next = { ...current };
        delete next[fieldId];
        return next;
      });
    },
    [],
  );

  // Sem limite de quantidade: cada escolha soma às anteriores do campo.
  const addFiles = useCallback((fieldId: string, uploads: PendingUpload[]) => {
    if (uploads.length === 0) return;
    setPendingFiles((prev) => ({ ...prev, [fieldId]: [...(prev[fieldId] ?? []), ...uploads] }));
  }, []);

  const updateFile = useCallback(
    (fieldId: string, uploadId: string, patch: Partial<Pick<PendingUpload, 'name' | 'description'>>) => {
      setPendingFiles((prev) => ({
        ...prev,
        [fieldId]: (prev[fieldId] ?? []).map((upload) =>
          upload.id === uploadId ? { ...upload, ...patch } : upload,
        ),
      }));
    },
    [],
  );

  const removeFile = useCallback((fieldId: string, index: number) => {
    setPendingFiles((prev) => {
      const current = prev[fieldId] ?? [];
      const next = current.filter((_, i) => i !== index);
      return { ...prev, [fieldId]: next };
    });
  }, []);

  const clearAnswers = useCallback(() => {
    setAnswers({});
    setFieldErrors({});
    setPendingFiles({});
    // Identificação obrigatória: quem entrou continua identificado para a próxima resposta.
    if (!identificationRequired) {
      setResponderName('');
      setResponderEmail('');
    }
    setIdentificationErrors({});
    setCaptchaToken(null);
    idempotencyKeyRef.current = null;
    progressIdRef.current = null;
    setCaptchaResetKey((current) => current + 1);
    setCurrentSectionId(null);
  }, [identificationRequired]);

  /** Botão "Continuar" da tela de entrada: só abre o formulário com nome e e-mail válidos. */
  const confirmIdentity = useCallback(() => {
    const errors = validateResponderIdentification(responderName, responderEmail, true);
    setIdentificationErrors(errors);
    if (Object.keys(errors).length > 0) return false;
    setResponderName((current) => current.trim());
    setResponderEmail((current) => current.trim());
    setIdentityConfirmed(true);
    return true;
  }, [responderName, responderEmail]);

  /** "Trocar": volta para a tela de entrada; as respostas já dadas continuam. */
  const editIdentity = useCallback(() => {
    setIdentificationErrors({});
    setIdentityConfirmed(false);
  }, []);

  const validateCurrentScope = useCallback(() => {
    if (!form) {
      return false;
    }

    const allErrors = {
      ...validatePublicAnswers(form, effectiveAnswers, answersByCode),
      ...validatePendingFileLabels(activeSections, pendingFiles),
    };
    const scopedFieldIds = new Set(
      activeSections
        .flatMap((section) => section.fields)
        .filter((field) => !decorativeFieldTypes.has(field.fieldType))
        .map((field) => field.id),
    );

    const nextErrors = Object.fromEntries(
      Object.entries(allErrors).filter(([fieldId]) => scopedFieldIds.has(fieldId)),
    );

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [activeSections, effectiveAnswers, answersByCode, form, pendingFiles]);

  const goToNextStep = useCallback(() => {
    const idx = visibleSections.findIndex((section) => section.id === currentSectionId);
    if (idx < 0 || idx >= visibleSections.length - 1) {
      return;
    }
    if (!validateCurrentScope()) {
      focusFirstInvalidField();
      return;
    }
    setCurrentSectionId(visibleSections[idx + 1].id);
  }, [visibleSections, currentSectionId, validateCurrentScope]);

  const goToPreviousStep = useCallback(() => {
    const idx = visibleSections.findIndex((section) => section.id === currentSectionId);
    if (idx <= 0) {
      return;
    }
    setCurrentSectionId(visibleSections[idx - 1].id);
  }, [visibleSections, currentSectionId]);

  const submit = useCallback(async () => {
    if (submitting) {
      return;
    }

    if (!form) {
      showToast({
        title: 'Formulário indisponível',
        description: 'Não foi possível enviar porque o formulário não está carregado.',
        variant: 'error',
      });
      return;
    }

    const errors = {
      ...validatePublicAnswers(form, effectiveAnswers, answersByCode),
      ...validatePendingFileLabels(visibleSections, pendingFiles),
    };
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      const failingSection = visibleSections.find((section) =>
        section.fields.some((field) => errors[field.id]),
      );
      if (failingSection) {
        setCurrentSectionId(failingSection.id);
      }
      focusFirstInvalidField();
      return;
    }

    const identErrors = validateResponderIdentification(
      responderName,
      responderEmail,
      identificationRequired,
    );
    setIdentificationErrors(identErrors);
    if (Object.keys(identErrors).length > 0) {
      // Obrigatória: volta para a tela de entrada, com o erro em cada campo.
      if (identificationRequired) setIdentityConfirmed(false);
      showToast(
        identErrors.responderEmail && responderEmail.trim()
          ? {
              title: 'E-mail inválido',
              description: 'Informe um e-mail válido para identificar o respondente.',
              variant: 'warning',
            }
          : {
              title: 'Identifique-se',
              description: 'Para responder este formulário, informe seu nome e e-mail.',
              variant: 'warning',
            },
      );
      return;
    }

    if (isCaptchaEnabled && !captchaToken) {
      showToast({
        title: 'Confirme o CAPTCHA',
        description: 'Valide o CAPTCHA antes de enviar sua resposta.',
        variant: 'warning',
      });
      return;
    }

    const items = answerableFields
      .map((field) => fieldToSubmitItem(field, effectiveAnswers[field.id] ?? null))
      .filter((item): item is PublicSubmitItem => item !== null);

    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = createIdempotencyKey();
    }

    setSubmitting(true);
    try {
      const { id: submissionId } = await submitPublicForm({
        formId: form.id,
        formVersionId: form.activeVersion.id,
        responderName: responderName.trim() || undefined,
        responderEmail: responderEmail.trim() || undefined,
        captchaToken: captchaToken ?? undefined,
        idempotencyKey: idempotencyKeyRef.current,
        items,
      });

      // Upload pending file attachments (upload failures don't revert the submission)
      const allFiles = Object.values(pendingFiles).flat();
      if (allFiles.length > 0) {
        setUploadProgress({ done: 0, total: allFiles.length });
        let done = 0;
        for (const upload of allFiles) {
          try {
            await uploadSubmissionAttachment(submissionId, upload.file, uploadLabel(upload));
          } catch {
            showToast({
              title: 'Falha ao enviar anexo',
              description: `Não foi possível enviar "${upload.file.name}". A resposta foi salva.`,
              variant: 'warning',
            });
          }
          done += 1;
          setUploadProgress({ done, total: allFiles.length });
        }
        setUploadProgress(null);
      }

      setSubmissionCount((count) => count + 1);
      clearAnswers();
      showToast({
        title: 'Resposta enviada',
        description: 'Formulário enviado com sucesso. Você pode enviar uma nova resposta.',
        variant: 'success',
      });
    } catch (submitError) {
      const erpUnavailable = getErpUnavailableMessage(submitError);
      const apiFieldErrors = extractApiFieldErrors(submitError, form);
      const changedTableCodes = getErpTableChangedFields(submitError);
      const apiIdentificationErrors = extractApiIdentificationErrors(submitError);
      if (Object.keys(apiIdentificationErrors).length > 0) {
        // Backend recusou a identificação (ex.: versão publicada passou a exigir no meio do caminho).
        setIdentificationErrors(apiIdentificationErrors);
        if (identificationRequired) setIdentityConfirmed(false);
        showToast({
          title: 'Identifique-se',
          description: 'Para responder este formulário, informe seu nome e e-mail.',
          variant: 'warning',
        });
      } else if (changedTableCodes) {
        // Itens mudaram no ERP desde que a tabela foi carregada: recarrega só essas tabelas,
        // mantendo o que foi digitado nas linhas que continuam, e pede nova conferência.
        const tableFields = form.activeVersion.sections
          .flatMap((section) => section.fields.map((field) => ({ field, sectionId: section.id })))
          .filter(
            ({ field }) =>
              field.fieldType === 'erp_table' &&
              (changedTableCodes.length === 0 || changedTableCodes.includes(field.code)),
          );
        setAnswers((current) => {
          const next = { ...current };
          for (const { field } of tableFields) {
            const answer = next[field.id];
            if (isErpTableAnswer(answer)) next[field.id] = { ...answer, stale: true };
          }
          return next;
        });
        setFieldErrors(
          Object.fromEntries(
            tableFields.map(({ field }) => [
              field.id,
              'Os itens foram alterados no ERP. Confira a tabela e envie novamente.',
            ]),
          ),
        );
        if (tableFields[0]) setCurrentSectionId(tableFields[0].sectionId);
        showToast({
          title: 'Itens alterados no ERP',
          description:
            'Os itens foram alterados no ERP. Atualize a tabela e confira os valores novamente.',
          variant: 'warning',
        });
      } else if (erpUnavailable) {
        // Nada foi gravado; as respostas continuam na tela para tentar de novo.
        setErpUnavailableMessage(erpUnavailable);
      } else if (apiFieldErrors) {
        setFieldErrors(apiFieldErrors);
      } else {
        const message = extractApiMessage(submitError);
        if (message?.toUpperCase().includes('CAPTCHA')) {
          setCaptchaToken(null);
          setCaptchaResetKey((current) => current + 1);
        }
        showToast({
          title: 'Falha ao enviar',
          description: message ?? 'Não foi possível enviar sua resposta agora.',
          variant: 'error',
        });
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    answerableFields,
    effectiveAnswers,
    answersByCode,
    clearAnswers,
    form,
    identificationRequired,
    isCaptchaEnabled,
    captchaToken,
    pendingFiles,
    responderEmail,
    responderName,
    showToast,
    submitting,
    visibleSections,
  ]);

  return {
    form,
    loading,
    submitting,
    error,
    answers: effectiveAnswers,
    answersByCode,
    fieldErrors,
    pendingFiles,
    uploadProgress,
    responderName,
    responderEmail,
    identificationErrors,
    identificationRequired,
    needsIdentification,
    confirmIdentity,
    editIdentity,
    captchaToken,
    captchaSiteKey,
    captchaResetKey,
    submissionCount,
    erpUnavailableMessage,
    dismissErpUnavailable: () => setErpUnavailableMessage(null),
    visibleSections,
    activeSections,
    currentStep,
    totalSteps,
    isStepper,
    isCaptchaEnabled,
    setResponderName: (value: string) => {
      setResponderName(value);
      setIdentificationErrors(({ responderName: _cleared, ...rest }) => rest);
    },
    setResponderEmail: (value: string) => {
      setResponderEmail(value);
      setIdentificationErrors(({ responderEmail: _cleared, ...rest }) => rest);
    },
    setCaptchaToken,
    setAnswer,
    toggleMultiOption,
    addFiles,
    updateFile,
    removeFile,
    submit,
    clearAnswers,
    reload: loadPublicForm,
    goToNextStep,
    goToPreviousStep,
  };
}
