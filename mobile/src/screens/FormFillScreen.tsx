import React, { useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { apiErrorMessage } from '../api/client';
import { submitForm, uploadSubmissionAttachment } from '../api/endpoints';
import { usePublicForm } from '../api/queries';
import type { FormField } from '../api/types';
import { useAuth } from '../context/auth-context';
import {
  DECORATIVE_TYPES,
  fieldToSubmitItem,
  resolveAnswers,
  validateFieldValue,
  visibleSections,
  type AnswerValue,
} from '../domain/form-runtime';
import { FieldControl, type FieldModel } from '../fields/FieldControl';
import { DownloadFileCard, fileLabelRequired, FormFileField, isLabeled, uploadLabel, type PendingUpload } from '../fields/FileFields';
import type { RootScreenProps } from '../navigation/types';
import { KeyboardScreen, ScreenHeader, StickyFooter, STICKY_FOOTER_HEIGHT } from '../ui/layout';
import { Button, Card, ErrorState, LoadingBlock, Notice, ProgressBar, Txt } from '../ui/primitives';
import { spacing, useTheme } from '../ui/theme';
import { useToast } from '../ui/toast';

function formFieldModel(field: FormField): FieldModel {
  return {
    id: field.id,
    code: field.code,
    label: field.label,
    fieldType: field.fieldType,
    required: field.required,
    settings: field.settingsJson ?? {},
    options: [...field.options].sort((a, b) => a.order - b.order).map((o) => ({ value: o.internalValue, label: o.displayLabel })),
    rawOptions: field.options,
    help: field.helpText ?? null,
  };
}

/** "Identificação obrigatória": vai o nome e o e-mail de quem está logado. */
function responderIdentity(settings: Record<string, unknown>, user: { fullName: string; email: string } | null) {
  if (settings.requireResponderIdentification !== true || !user) return {};
  return { responderName: user.fullName.trim() || undefined, responderEmail: user.email.trim() || undefined };
}

/**
 * Preencher um formulário: uma seção por vez (com o caminho das ramificações), validação igual à
 * do web antes de avançar, e os arquivos sobem depois do envio, ligados à resposta.
 */
export default function FormFillScreen({ route, navigation }: RootScreenProps<'FormFill'>) {
  const { colors } = useTheme();
  const { formId, title } = route.params;
  const toast = useToast();
  const { user } = useAuth();
  const form = usePublicForm(formId);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [files, setFiles] = useState<Record<string, PendingUpload[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showFileErrors, setShowFileErrors] = useState(false);
  const [step, setStep] = useState(0);
  const [sending, setSending] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const idempotencyKey = useRef(`m-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

  const resolved = useMemo(
    () => (form.data ? resolveAnswers(form.data, answers) : { answersById: answers, answersByCode: {} }),
    [form.data, answers],
  );
  const sections = useMemo(
    () => (form.data ? visibleSections(form.data, resolved.answersByCode) : []),
    [form.data, resolved.answersByCode],
  );

  if (form.isLoading) {
    return (
      <KeyboardScreen>
        <ScreenHeader back title={title ?? 'Formulário'} />
        <LoadingBlock label="Abrindo o formulário…" />
      </KeyboardScreen>
    );
  }
  if (form.isError || !form.data) {
    return (
      <KeyboardScreen>
        <ScreenHeader back title={title ?? 'Formulário'} />
        <ErrorState
          message={apiErrorMessage(form.error, 'Formulário não encontrado ou fora do ar.')}
          onRetry={() => void form.refetch()}
        />
      </KeyboardScreen>
    );
  }

  const version = form.data.activeVersion;
  const current = sections[Math.min(step, sections.length - 1)];
  const isLast = step >= sections.length - 1;

  function setValue(field: FormField, value: unknown) {
    setAnswers((prev) => ({ ...prev, [field.id]: value as AnswerValue }));
    setErrors((prev) => {
      if (!(field.id in prev)) return prev;
      const next = { ...prev };
      delete next[field.id];
      return next;
    });
  }

  /** Confere uma lista de seções; devolve se passou. */
  function check(toCheck: typeof sections): boolean {
    const found: Record<string, string> = {};
    let fileProblem = false;
    for (const section of toCheck) {
      for (const field of section.fields) {
        if (DECORATIVE_TYPES.has(field.fieldType)) continue;
        if (field.fieldType === 'file_upload') {
          const pending = files[field.id] ?? [];
          if (fileLabelRequired(field.settingsJson) && pending.some((u) => !isLabeled(u))) {
            found[field.id] = 'Dê um nome novo ou uma descrição a cada arquivo.';
            fileProblem = true;
          }
          continue;
        }
        const message = validateFieldValue(field, resolved.answersById[field.id]);
        if (message) found[field.id] = message;
      }
    }
    setErrors(found);
    if (fileProblem) setShowFileErrors(true);
    if (Object.keys(found).length > 0) {
      toast({ title: 'Revise os campos destacados', variant: 'error' });
      return false;
    }
    return true;
  }

  function next() {
    if (!current || !check([current])) return;
    setStep((s) => Math.min(s + 1, sections.length - 1));
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  function back() {
    if (step === 0) return navigation.goBack();
    setStep((s) => s - 1);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  async function submit() {
    if (!check(sections)) return;
    const items = sections
      .flatMap((section) => section.fields)
      .filter((field) => !DECORATIVE_TYPES.has(field.fieldType))
      .map((field) => fieldToSubmitItem(field, resolved.answersById[field.id]))
      .filter((item): item is NonNullable<typeof item> => item !== null);
    const visibleFileFields = new Set(sections.flatMap((s) => s.fields).filter((f) => f.fieldType === 'file_upload').map((f) => f.id));
    const uploads = Object.entries(files)
      .filter(([fieldId]) => visibleFileFields.has(fieldId))
      .flatMap(([, list]) => list);

    setSending('Enviando…');
    try {
      const result = await submitForm({
        formId,
        formVersionId: version.id,
        idempotencyKey: idempotencyKey.current,
        ...responderIdentity(version.settingsJson ?? {}, user),
        items,
      });
      let failed = 0;
      for (let i = 0; i < uploads.length; i += 1) {
        setSending(`Enviando arquivo ${i + 1} de ${uploads.length}…`);
        try {
          await uploadSubmissionAttachment(result.id, uploads[i].file, uploadLabel(uploads[i]));
        } catch {
          failed += 1;
        }
      }
      if (failed > 0) {
        Alert.alert(
          'Resposta enviada',
          failed === 1 ? '1 arquivo não subiu. Você pode anexá-lo depois, no card.' : `${failed} arquivos não subiram. Você pode anexá-los depois, no card.`,
        );
      }
      navigation.replace('FormDone', { submissionId: result.id, formTitle: version.titleDisplay || form.data!.name, formId });
    } catch (error) {
      toast({ title: 'Não foi possível enviar', description: apiErrorMessage(error, 'Verifique a conexão e tente de novo.'), variant: 'error' });
    } finally {
      setSending(null);
    }
  }

  const progress = sections.length > 1 ? ((step + 1) / sections.length) * 100 : 100;

  return (
    <KeyboardScreen>
      <ScreenHeader
        back
        onBack={back}
        overline={sections.length > 1 ? `Etapa ${step + 1} de ${sections.length}` : 'Novo pedido'}
        title={version.titleDisplay || form.data.name}
      />
      {sections.length > 1 ? <ProgressBar percent={progress} height={3} /> : null}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: STICKY_FOOTER_HEIGHT + spacing.xxxl }]}
        keyboardShouldPersistTaps="handled"
      >
        {step === 0 && version.descriptionDisplay ? (
          <Txt variant="body" color={colors.textSecondary}>
            {version.descriptionDisplay}
          </Txt>
        ) : null}
        {step === 0 && version.settingsJson?.requireResponderIdentification === true && user ? (
          <Notice tone="info" icon="user" text={`Este formulário identifica quem responde: vai em nome de ${user.fullName}.`} />
        ) : null}

        {current ? (
          <Card style={{ gap: spacing.xl }}>
            {current.title || current.description ? (
              <View style={{ gap: 4 }}>
                {current.title ? <Txt variant="title">{current.title}</Txt> : null}
                {current.description ? (
                  <Txt variant="small" color={colors.textMuted}>
                    {current.description}
                  </Txt>
                ) : null}
              </View>
            ) : null}
            {current.fields.map((field) => {
              if (field.fieldType === 'file_download') {
                return <DownloadFileCard key={field.id} label={field.label} settings={field.settingsJson ?? {}} />;
              }
              if (field.fieldType === 'file_upload') {
                return (
                  <FormFileField
                    key={field.id}
                    label={field.label}
                    required={false}
                    help={field.helpText}
                    error={errors[field.id]}
                    settings={field.settingsJson ?? {}}
                    uploads={files[field.id] ?? []}
                    showLabelErrors={showFileErrors}
                    onChange={(list) => {
                      setFiles((prev) => ({ ...prev, [field.id]: list }));
                      setErrors((prev) => {
                        const copy = { ...prev };
                        delete copy[field.id];
                        return copy;
                      });
                    }}
                  />
                );
              }
              return (
                <FieldControl
                  key={field.id}
                  field={formFieldModel(field)}
                  value={answers[field.id] ?? null}
                  onChange={(value) => setValue(field, value)}
                  error={errors[field.id]}
                  calculated={field.fieldType === 'calculated' ? ((resolved.answersById[field.id] as number | null) ?? null) : undefined}
                />
              );
            })}
          </Card>
        ) : (
          <Card>
            <Txt variant="small" color={colors.textMuted}>
              Este formulário não tem perguntas.
            </Txt>
          </Card>
        )}
      </ScrollView>

      <StickyFooter>
        {step > 0 ? <Button label="Voltar" icon="arrow-left" variant="outline" onPress={back} disabled={!!sending} style={{ flex: 1 }} /> : null}
        {isLast ? (
          <Button label={sending ?? 'Enviar'} icon="send" onPress={() => void submit()} loading={!!sending} style={{ flex: 2 }} />
        ) : (
          <Button label="Continuar" iconRight="arrow-right" onPress={next} style={{ flex: 2 }} />
        )}
      </StickyFooter>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg },
});
