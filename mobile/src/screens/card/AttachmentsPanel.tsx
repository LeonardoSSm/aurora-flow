import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { apiErrorMessage } from '../../api/client';
import { useAttachments, useDeleteAttachment, useUpdateAttachment, useUploadAttachment } from '../../api/queries';
import type { Attachment, Solicitation } from '../../api/types';
import { useAuth } from '../../context/auth-context';
import { splitFileName } from '../../domain/files';
import {
  AddFileButtons,
  AttachmentRow,
  attachmentMeta,
  FILE_LABEL_ERROR,
  isLabeled,
  LabelValidationPanel,
  PendingUploadList,
  toPending,
  uploadLabel,
  type PendingUpload,
} from '../../fields/FileFields';
import { FieldShell, Input } from '../../ui/inputs';
import { Button, Card, EmptyState, LoadingBlock, Notice, SectionHeader, Txt } from '../../ui/primitives';
import { Sheet } from '../../ui/sheet';
import { spacing, useTheme } from '../../ui/theme';
import { useToast } from '../../ui/toast';

/** Todos os arquivos do card: enviar novo (com nome/descrição), abrir, renomear e remover. */
export function AttachmentsPanel({ solicitation, phaseLabels }: { solicitation: Solicitation; phaseLabels: Record<string, string> }) {
  const { colors } = useTheme();
  const toast = useToast();
  const { user, can } = useAuth();
  const attachments = useAttachments(solicitation.id);
  const upload = useUploadAttachment(solicitation.id);
  const update = useUpdateAttachment(solicitation.id);
  const remove = useDeleteAttachment(solicitation.id);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState<Attachment | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const canUpload = can('attachments.upload', solicitation.formId) || can('solicitations.act', solicitation.formId);
  const canManageAll = can('attachments.manage_all', solicitation.formId);

  async function sendAll() {
    if (pending.some((item) => !isLabeled(item))) {
      setShowErrors(true);
      return;
    }
    setSending(true);
    const failed: PendingUpload[] = [];
    for (const item of pending) {
      try {
        await upload.mutateAsync({ file: item.file, label: uploadLabel(item) });
      } catch {
        failed.push(item);
      }
    }
    setSending(false);
    setPending(failed);
    setShowErrors(false);
    if (failed.length > 0) toast({ title: `${failed.length} arquivo(s) não foram enviados`, description: 'Tente de novo.', variant: 'error' });
    else toast({ title: 'Arquivos enviados' });
  }

  function confirmDelete(attachment: Attachment) {
    Alert.alert('Remover arquivo?', `"${attachment.originalName}" sai do card. Isso não pode ser desfeito.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: () =>
          remove.mutate(attachment.id, {
            onSuccess: () => toast({ title: 'Arquivo removido' }),
            onError: (error) => toast({ title: 'Não foi possível remover', description: apiErrorMessage(error, ''), variant: 'error' }),
          }),
      },
    ]);
  }

  async function saveEdit() {
    if (!editing) return;
    try {
      const base = splitFileName(editing.originalName).base;
      await update.mutateAsync({
        attachmentId: editing.id,
        patch: {
          ...(editName.trim() && editName.trim() !== base ? { name: editName.trim() } : {}),
          description: editDescription.trim(),
        },
      });
      setEditing(null);
      toast({ title: 'Arquivo atualizado' });
    } catch (error) {
      toast({ title: 'Não foi possível salvar', description: apiErrorMessage(error, ''), variant: 'error' });
    }
  }

  const list = [...(attachments.data ?? [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <View style={{ gap: spacing.md }}>
      {canUpload ? (
        <Card style={{ gap: spacing.md }}>
          <Txt variant="overline" color={colors.textMuted}>
            Enviar arquivo
          </Txt>
          {pending.length > 0 ? (
            <>
              <PendingUploadList
                uploads={pending}
                requireLabel
                showErrors={showErrors}
                disabled={sending}
                onChange={(id, patch) => setPending((items) => items.map((u) => (u.id === id ? { ...u, ...patch } : u)))}
                onRemove={(id) => setPending((items) => items.filter((u) => u.id !== id))}
              />
              {showErrors ? <Notice tone="danger" icon="edit-3" text={FILE_LABEL_ERROR} /> : null}
              <Button
                label={pending.length === 1 ? 'Enviar arquivo' : `Enviar ${pending.length} arquivos`}
                icon="upload-cloud"
                loading={sending}
                onPress={() => void sendAll()}
              />
            </>
          ) : null}
          <AddFileButtons disabled={sending} onPick={(files) => setPending((items) => [...items, ...files.map(toPending)])} />
        </Card>
      ) : null}

      <SectionHeader title={`Arquivos do card${list.length ? ` (${list.length})` : ''}`} style={{ marginTop: spacing.sm }} />
      {attachments.isLoading ? (
        <LoadingBlock />
      ) : list.length === 0 ? (
        <EmptyState icon="paperclip" title="Nenhum arquivo ainda" />
      ) : (
        list.map((attachment) => {
          const mine = attachment.uploadedByUserId && attachment.uploadedByUserId === user?.id;
          const editable = canManageAll || Boolean(mine);
          const where = attachment.phaseId ? phaseLabels[attachment.phaseId] : attachment.submissionId ? 'Formulário' : null;
          return (
            <View key={attachment.id} style={{ gap: spacing.sm }}>
              <AttachmentRow
                attachment={attachment}
                meta={[where, attachmentMeta(attachment)].filter(Boolean).join(' · ')}
                onEdit={
                  editable
                    ? () => {
                        setEditing(attachment);
                        setEditName(splitFileName(attachment.originalName).base);
                        setEditDescription(attachment.description ?? '');
                      }
                    : undefined
                }
                onRemove={editable ? () => confirmDelete(attachment) : undefined}
              />
              {attachment.validationResult ? <LabelValidationPanel result={attachment.validationResult} /> : null}
            </View>
          );
        })
      )}

      <Sheet
        visible={editing !== null}
        onClose={() => setEditing(null)}
        title="Renomear ou descrever"
        footer={<Button label="Salvar" loading={update.isPending} onPress={() => void saveEdit()} style={{ flex: 1 }} />}
      >
        <View style={{ gap: spacing.lg }}>
          <FieldShell label="Nome">
            <Input
              value={editName}
              onChangeText={setEditName}
              trailing={editing ? <Txt variant="small" color={colors.textMuted}>{splitFileName(editing.originalName).ext}</Txt> : null}
            />
          </FieldShell>
          <FieldShell label="Descrição">
            <Input value={editDescription} onChangeText={setEditDescription} multiline placeholder="O que é este arquivo?" />
          </FieldShell>
        </View>
      </Sheet>
    </View>
  );
}
