import React, { useMemo } from 'react';
import { View } from 'react-native';
import { isForbidden } from '../../api/client';
import { useAttachments, useFormDetail, useResponse } from '../../api/queries';
import type { Solicitation } from '../../api/types';
import { ResponseValueView } from '../../components/ResponseValueView';
import { formatDateTime } from '../../domain/format';
import { buildFieldMetaByCode, humanizeFieldCode, responseItemToUi, sortResponseItems } from '../../domain/responses';
import { AttachmentRow, attachmentMeta, LabelValidationPanel } from '../../fields/FileFields';
import { Card, EmptyState, LoadingBlock, SectionHeader, Txt } from '../../ui/primitives';
import { spacing, useTheme } from '../../ui/theme';

/** O que foi respondido no formulário que abriu o card (antes o app não mostrava). */
export function ResponsesPanel({ solicitation }: { solicitation: Solicitation }) {
  const { colors } = useTheme();
  const submissionId = solicitation.submissionId;
  const response = useResponse(submissionId);
  const form = useFormDetail(solicitation.formId);
  const attachments = useAttachments(solicitation.id);
  const meta = useMemo(() => buildFieldMetaByCode(form.data, response.data?.formVersionId), [form.data, response.data?.formVersionId]);
  const formFiles = (attachments.data ?? []).filter((a) => a.submissionId && !a.phaseId);

  if (!submissionId) {
    return (
      <EmptyState
        icon="file-text"
        title="Sem formulário de abertura"
        text="Este card não nasceu de um formulário (foi criado à mão, por integração ou encaminhado)."
      />
    );
  }
  // Espera o formulário também (rótulos e opções); sem acesso a ele, mostra com os códigos.
  if (response.isLoading || form.isLoading) return <LoadingBlock label="Carregando as respostas…" />;
  if (isForbidden(response.error)) {
    return <EmptyState icon="lock" title="Sem acesso às respostas" text="Seu perfil não pode ver o detalhe desta resposta." />;
  }
  if (response.isError || !response.data) {
    return <EmptyState icon="alert-circle" title="Não deu para carregar as respostas" />;
  }

  const items = sortResponseItems(response.data.items, meta);
  const sectionCount = new Set(items.map((item) => meta[item.fieldCode]?.sectionId)).size;

  return (
    <View style={{ gap: spacing.md }}>
      <Card style={{ gap: 4 }}>
        <Txt variant="overline" color={colors.textMuted}>
          Respondido por
        </Txt>
        <Txt variant="bodyStrong">{response.data.responderName ?? 'Sem identificação'}</Txt>
        {response.data.responderEmail ? (
          <Txt variant="small" color={colors.textSecondary} selectable>
            {response.data.responderEmail}
          </Txt>
        ) : null}
        <Txt variant="caption" color={colors.textMuted}>
          {formatDateTime(response.data.submittedAt)}
        </Txt>
      </Card>

      {items.length === 0 ? (
        <Card>
          <Txt variant="small" color={colors.textMuted}>
            Esta resposta não tem campos preenchidos.
          </Txt>
        </Card>
      ) : (
        <Card style={{ gap: spacing.lg }}>
          {items.map((item, index) => {
            const fieldMeta = meta[item.fieldCode];
            const previous = index > 0 ? meta[items[index - 1].fieldCode] : undefined;
            const startsSection = sectionCount > 1 && fieldMeta && fieldMeta.sectionId !== previous?.sectionId;
            return (
              <View key={item.id} style={{ gap: 6 }}>
                {startsSection ? (
                  <Txt variant="overline" color={colors.brandText} style={{ marginTop: index > 0 ? spacing.sm : 0 }}>
                    {fieldMeta.sectionTitle}
                  </Txt>
                ) : null}
                <Txt variant="caption" color={colors.textMuted}>
                  {fieldMeta?.label ?? humanizeFieldCode(item.fieldCode)}
                </Txt>
                <ResponseValueView ui={responseItemToUi(item, fieldMeta)} />
              </View>
            );
          })}
        </Card>
      )}

      {formFiles.length > 0 ? (
        <>
          <SectionHeader title="Arquivos enviados no formulário" />
          {formFiles.map((attachment) => (
            <View key={attachment.id} style={{ gap: spacing.sm }}>
              <AttachmentRow attachment={attachment} meta={attachmentMeta(attachment)} />
              {attachment.validationResult ? <LabelValidationPanel result={attachment.validationResult} /> : null}
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}
