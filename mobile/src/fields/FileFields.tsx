import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, View } from 'react-native';
import { formDownloadPath } from '../api/endpoints';
import type { Attachment, LabelValidationResult, LocalFile, UploadLabel } from '../api/types';
import { formatBytes, formatDateTime } from '../domain/format';
import {
  downloadToCache,
  fileIcon,
  isImageMime,
  openLocalFile,
  PermissionDeniedError,
  pickFiles,
  shareLocalFile,
  splitFileName,
  type PickSource,
} from '../domain/files';
import { attachmentDownloadPath } from '../api/endpoints';
import { FieldShell, Input } from '../ui/inputs';
import { Badge, Button, Icon, IconButton, Txt } from '../ui/primitives';
import { Sheet, SheetOption } from '../ui/sheet';
import { makeStyles, radii, spacing, type Tone, useTheme } from '../ui/theme';
import { ImageViewer } from '../ui/image-viewer';
import { useToast } from '../ui/toast';

// ── Arquivo escolhido, ainda não enviado ────────────────────────────────────

export type PendingUpload = { id: string; file: LocalFile; name: string; description: string };

let seq = 0;
export function toPending(file: LocalFile): PendingUpload {
  seq += 1;
  return { id: `p${Date.now()}_${seq}`, file, name: splitFileName(file.name).base, description: '' };
}

/** Configuração do campo: ausente = exige nome novo ou descrição (só `requireFileLabel: false` desliga). */
export function fileLabelRequired(settings: Record<string, unknown> | null | undefined): boolean {
  return settings?.requireFileLabel !== false;
}

export function isRenamed(upload: PendingUpload): boolean {
  const name = upload.name.trim();
  return name !== '' && name !== splitFileName(upload.file.name).base.trim();
}

export function isLabeled(upload: PendingUpload): boolean {
  return isRenamed(upload) || upload.description.trim() !== '';
}

export function uploadLabel(upload: PendingUpload): UploadLabel {
  const label: UploadLabel = {};
  if (isRenamed(upload)) label.name = upload.name.trim();
  const description = upload.description.trim();
  if (description) label.description = description;
  return label;
}

export const FILE_LABEL_ERROR = 'Dê um nome novo ou uma descrição a cada arquivo.';

// ── Escolher arquivo ────────────────────────────────────────────────────────

export function useFilePicker() {
  const toast = useToast();
  return async (source: PickSource, multiple = true): Promise<LocalFile[] | null> => {
    try {
      return await pickFiles(source, multiple);
    } catch (error) {
      if (error instanceof PermissionDeniedError) Alert.alert('Permissão necessária', error.message);
      else toast({ title: 'Não foi possível abrir o arquivo', variant: 'error' });
      return null;
    }
  };
}

/** Três jeitos de anexar: câmera, galeria, documento. */
export function AddFileButtons({
  onPick,
  disabled,
  multiple = true,
  label = 'Adicionar arquivo',
}: {
  onPick: (files: LocalFile[]) => void;
  disabled?: boolean;
  multiple?: boolean;
  label?: string;
}) {
  const styles = useStyles();
  const pick = useFilePicker();
  const [open, setOpen] = useState(false);
  async function choose(source: PickSource) {
    setOpen(false);
    const files = await pick(source, multiple);
    if (files && files.length > 0) onPick(files);
  }
  return (
    <>
      <View style={styles.addRow}>
        <Button label="Câmera" icon="camera" variant="secondary" onPress={() => void choose('camera')} disabled={disabled} style={{ flex: 1 }} />
        <Button label={label === 'Adicionar arquivo' ? 'Anexar' : label} icon="paperclip" variant="outline" onPress={() => setOpen(true)} disabled={disabled} style={{ flex: 1 }} />
      </View>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Anexar">
        <SheetOption icon="image" label="Foto da galeria" onPress={() => void choose('gallery')} />
        <SheetOption icon="file" label="Documento (PDF, planilha…)" onPress={() => void choose('document')} />
        <SheetOption icon="camera" label="Tirar foto agora" onPress={() => void choose('camera')} />
      </Sheet>
    </>
  );
}

/** Arquivos escolhidos com nome e descrição editáveis (o nome vai sem a extensão). */
export function PendingUploadList({
  uploads,
  onChange,
  onRemove,
  requireLabel,
  showErrors,
  disabled,
}: {
  uploads: PendingUpload[];
  onChange: (id: string, patch: Partial<Pick<PendingUpload, 'name' | 'description'>>) => void;
  onRemove: (id: string) => void;
  requireLabel: boolean;
  showErrors?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={{ gap: spacing.sm }}>
      {uploads.map((upload) => {
        const missing = requireLabel && showErrors && !isLabeled(upload);
        const ext = splitFileName(upload.file.name).ext;
        return (
          <View key={upload.id} style={[styles.pending, missing && { borderColor: colors.danger }]}>
            <View style={styles.pendingHead}>
              {isImageMime(upload.file.mimeType) ? (
                <Image source={{ uri: upload.file.uri }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbIcon]}>
                  <Icon name={fileIcon(upload.file.mimeType)} size={22} color={colors.brandText} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
                  {upload.file.name}
                  {upload.file.size ? ` · ${formatBytes(upload.file.size)}` : ''}
                </Txt>
                <Input
                  value={upload.name}
                  onChangeText={(name) => onChange(upload.id, { name })}
                  placeholder="Nome do arquivo"
                  editable={!disabled}
                  trailing={ext ? <Txt variant="small" color={colors.textMuted}>{ext}</Txt> : null}
                  containerStyle={{ marginTop: 4, minHeight: 42 }}
                  accessibilityLabel="Nome do arquivo"
                />
              </View>
              {!disabled ? <IconButton name="x" label="Tirar arquivo" onPress={() => onRemove(upload.id)} /> : null}
            </View>
            <Input
              value={upload.description}
              onChangeText={(description) => onChange(upload.id, { description })}
              placeholder={requireLabel ? 'O que é este arquivo? (ou renomeie acima)' : 'Descrição (opcional)'}
              editable={!disabled}
              multiline
              containerStyle={{ minHeight: 44 }}
              style={{ minHeight: 40 }}
              accessibilityLabel="Descrição do arquivo"
            />
            {missing ? (
              <Txt variant="caption" color={colors.danger}>
                Renomeie o arquivo ou escreva uma descrição.
              </Txt>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** Campo de arquivo do formulário: vários arquivos, sobem depois do envio, ligados à resposta. */
export function FormFileField({
  label,
  required,
  help,
  error,
  settings,
  uploads,
  onChange,
  showLabelErrors,
  disabled,
}: {
  label: string;
  required: boolean;
  help?: string | null;
  error?: string | null;
  settings: Record<string, unknown>;
  uploads: PendingUpload[];
  onChange: (next: PendingUpload[]) => void;
  showLabelErrors: boolean;
  disabled?: boolean;
}) {
  return (
    <FieldShell label={label} required={required} help={help} error={error}>
      <PendingUploadList
        uploads={uploads}
        requireLabel={fileLabelRequired(settings)}
        showErrors={showLabelErrors}
        disabled={disabled}
        onChange={(id, patch) => onChange(uploads.map((u) => (u.id === id ? { ...u, ...patch } : u)))}
        onRemove={(id) => onChange(uploads.filter((u) => u.id !== id))}
      />
      <AddFileButtons disabled={disabled} onPick={(files) => onChange([...uploads, ...files.map(toPending)])} />
    </FieldShell>
  );
}

// ── Campo de arquivo da fase ────────────────────────────────────────────────

export type PhaseAttachmentValue = {
  attachmentId: string;
  originalName: string;
  description?: string | null;
  mimeType: string;
  sizeBytes: number;
  validationResult?: LabelValidationResult | null;
};

export function isPhaseAttachmentValue(value: unknown): value is PhaseAttachmentValue {
  return Boolean(value) && typeof value === 'object' && 'attachmentId' in (value as object);
}

/** Um arquivo por campo, enviado na hora (com nome/descrição) e ligado à fase. */
export function PhaseFileField({
  label,
  required,
  settings,
  value,
  onChange,
  upload,
  disabled,
  error,
}: {
  label: string;
  required: boolean;
  settings: Record<string, unknown>;
  value: PhaseAttachmentValue | null;
  onChange: (next: PhaseAttachmentValue | null) => void;
  upload: (file: LocalFile, label: UploadLabel) => Promise<Attachment>;
  disabled?: boolean;
  error?: string | null;
}) {
  const toast = useToast();
  const [pending, setPending] = useState<PendingUpload | null>(null);
  const [sending, setSending] = useState(false);
  const [showError, setShowError] = useState(false);
  const requireLabel = fileLabelRequired(settings);

  async function send() {
    if (!pending) return;
    if (requireLabel && !isLabeled(pending)) {
      setShowError(true);
      return;
    }
    setSending(true);
    try {
      const attachment = await upload(pending.file, uploadLabel(pending));
      setPending(null);
      setShowError(false);
      onChange({
        attachmentId: attachment.id,
        originalName: attachment.originalName,
        description: attachment.description ?? null,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        validationResult: attachment.validationResult,
      });
    } catch {
      toast({ title: 'Falha ao enviar o arquivo', description: 'Tente de novo.', variant: 'error' });
    } finally {
      setSending(false);
    }
  }

  return (
    <FieldShell label={label} required={required} error={error}>
      {value ? (
        <View style={{ gap: spacing.sm }}>
          <AttachmentRow
            attachment={{
              id: value.attachmentId,
              originalName: value.originalName,
              description: value.description,
              mimeType: value.mimeType,
              sizeBytes: value.sizeBytes,
            }}
            onRemove={disabled ? undefined : () => onChange(null)}
          />
          {value.validationResult ? <LabelValidationPanel result={value.validationResult} /> : null}
        </View>
      ) : pending ? (
        <View style={{ gap: spacing.sm }}>
          <PendingUploadList
            uploads={[pending]}
            requireLabel={requireLabel}
            showErrors={showError}
            disabled={disabled || sending}
            onChange={(_id, patch) => setPending((current) => (current ? { ...current, ...patch } : current))}
            onRemove={() => {
              setPending(null);
              setShowError(false);
            }}
          />
          <Button label="Enviar arquivo" icon="upload-cloud" onPress={() => void send()} loading={sending} disabled={disabled} />
        </View>
      ) : (
        <AddFileButtons multiple={false} disabled={disabled} onPick={(files) => setPending(toPending(files[0]))} />
      )}
    </FieldShell>
  );
}

// ── Anexo já enviado ────────────────────────────────────────────────────────

/** Abre/baixa um anexo com o login (antes abria a URL sem token no navegador e dava erro). */
export function useOpenAttachment() {
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  // Foto abre aqui mesmo, em tela cheia; o resto vai para o app do aparelho que sabe abrir.
  const [viewer, setViewer] = useState<{ uri: string; title: string; mimeType: string; file: { uri: string } } | null>(null);
  async function open(attachment: { id: string; originalName: string; mimeType: string }, share = false) {
    setBusyId(attachment.id);
    try {
      const file = await downloadToCache(attachmentDownloadPath(attachment.id), attachment.originalName);
      if (share) await shareLocalFile(file, attachment.mimeType);
      else if (isImageMime(attachment.mimeType)) setViewer({ uri: file.uri, title: attachment.originalName, mimeType: attachment.mimeType, file });
      else await openLocalFile(file, attachment.mimeType);
    } catch {
      toast({ title: 'Não foi possível abrir o arquivo', description: 'Verifique a conexão e tente de novo.', variant: 'error' });
    } finally {
      setBusyId(null);
    }
  }
  const viewerElement = (
    <ImageViewer
      uri={viewer?.uri ?? null}
      title={viewer?.title}
      onClose={() => setViewer(null)}
      onShare={viewer ? () => void shareLocalFile(viewer.file, viewer.mimeType) : undefined}
    />
  );
  return { open, busyId, viewerElement };
}

export function AttachmentRow({
  attachment,
  onRemove,
  onEdit,
  meta,
}: {
  attachment: Pick<Attachment, 'id' | 'originalName' | 'mimeType' | 'sizeBytes'> & { description?: string | null };
  onRemove?: () => void;
  onEdit?: () => void;
  meta?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { open, busyId, viewerElement } = useOpenAttachment();
  const [menu, setMenu] = useState(false);
  const busy = busyId === attachment.id;
  return (
    <View style={styles.attachment}>
      {viewerElement}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Abrir ${attachment.originalName}`}
        onPress={() => void open(attachment)}
        style={styles.attachmentMain}
      >
        <View style={[styles.thumb, styles.thumbIcon]}>
          {busy ? <ActivityIndicator color={colors.brandText} /> : <Icon name={fileIcon(attachment.mimeType)} size={20} color={colors.brandText} />}
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="smallStrong" numberOfLines={2}>
            {attachment.originalName}
          </Txt>
          {attachment.description ? (
            <Txt variant="caption" color={colors.textSecondary}>
              {attachment.description}
            </Txt>
          ) : null}
          <Txt variant="caption" color={colors.textMuted}>
            {[formatBytes(attachment.sizeBytes), meta].filter(Boolean).join(' · ')}
          </Txt>
        </View>
      </Pressable>
      {onEdit || onRemove ? (
        <IconButton name="more-vertical" label={`Opções de ${attachment.originalName}`} size={20} onPress={() => setMenu(true)} />
      ) : (
        <IconButton name="share-2" label="Compartilhar" size={18} onPress={() => void open(attachment, true)} />
      )}
      <Sheet visible={menu} onClose={() => setMenu(false)} title={attachment.originalName}>
        <SheetOption icon="external-link" label="Abrir" onPress={() => { setMenu(false); void open(attachment); }} />
        <SheetOption icon="share-2" label="Compartilhar" onPress={() => { setMenu(false); void open(attachment, true); }} />
        {onEdit ? <SheetOption icon="edit-2" label="Renomear ou descrever" onPress={() => { setMenu(false); onEdit(); }} /> : null}
        {onRemove ? <SheetOption icon="trash-2" label="Remover do card" onPress={() => { setMenu(false); onRemove(); }} /> : null}
      </Sheet>
    </View>
  );
}

export function attachmentMeta(attachment: Attachment): string {
  const who = attachment.uploadedByUser?.fullName;
  return [who, formatDateTime(attachment.createdAt)].filter(Boolean).join(' · ');
}

// ── Validação por IA da etiqueta ────────────────────────────────────────────

const LABEL_STATUS: Record<string, { tone: Tone; label: string }> = {
  OK: { tone: 'success', label: 'OK' },
  DIVERGENTE: { tone: 'danger', label: 'Divergente' },
  AUSENTE: { tone: 'neutral', label: 'Ausente' },
  ATENCAO: { tone: 'warning', label: 'Atenção' },
};

export function LabelValidationPanel({ result }: { result: LabelValidationResult }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const rows: Array<[string, { valor: string; status: string }]> = [
    ['Lote', result.lote],
    ['Fabricação', result.fabricacao],
    ['Validade', result.validade],
  ];
  return (
    <View style={styles.validation}>
      <View style={styles.validationHead}>
        <Icon name="cpu" size={16} color={colors.brandText} />
        <Txt variant="overline" color={colors.textMuted} style={{ flex: 1 }}>
          Validação IA{result.tipo ? ` · ${result.tipo}` : ''}
        </Txt>
        <Badge label={result.aprovada ? 'Aprovada' : 'Reprovada'} tone={result.aprovada ? 'success' : 'danger'} />
      </View>
      {rows.map(([label, field]) => {
        const status = LABEL_STATUS[field?.status] ?? LABEL_STATUS.AUSENTE;
        return (
          <View key={label} style={styles.validationRow}>
            <Txt variant="small" color={colors.textSecondary} style={{ flex: 1 }}>
              {label}: <Txt variant="smallStrong">{field?.valor || '—'}</Txt>
            </Txt>
            <Badge label={status.label} tone={status.tone} size="sm" />
          </View>
        );
      })}
      {result.mensagem ? (
        <Txt variant="caption" color={colors.textSecondary}>
          {result.mensagem}
        </Txt>
      ) : null}
    </View>
  );
}

// ── Arquivo para baixar (campo do formulário) ───────────────────────────────

export function DownloadFileCard({ label, settings }: { label: string; settings: Record<string, unknown> }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const file = settings.downloadFile as { path?: unknown; name?: unknown; mimeType?: unknown } | undefined;
  const path = typeof file?.path === 'string' ? file.path : null;
  const name = typeof file?.name === 'string' ? file.name : 'arquivo';
  const mime = typeof file?.mimeType === 'string' ? file.mimeType : 'application/octet-stream';
  if (!path) return null;
  async function download() {
    setBusy(true);
    try {
      const local = await downloadToCache(formDownloadPath(path as string), name, false);
      await openLocalFile(local, mime);
    } catch {
      toast({ title: 'Não foi possível baixar o arquivo', variant: 'error' });
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={styles.download}>
      <View style={[styles.thumb, styles.thumbIcon]}>
        <Icon name="download" size={20} color={colors.brandText} />
      </View>
      <View style={{ flex: 1 }}>
        {label ? <Txt variant="smallStrong">{label}</Txt> : null}
        <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
          {name}
        </Txt>
      </View>
      <Button label="Baixar" size="sm" variant="secondary" icon="download" loading={busy} onPress={() => void download()} />
    </View>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    addRow: { flexDirection: 'row', gap: spacing.sm },
    pending: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      padding: spacing.md,
      gap: spacing.sm,
      backgroundColor: colors.surfaceAlt,
    },
    pendingHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
    thumb: { width: 48, height: 48, borderRadius: radii.sm, backgroundColor: colors.border },
    thumbIcon: { backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
    attachment: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingLeft: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: colors.surface,
    },
    attachmentMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48 },
    validation: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      padding: spacing.md,
      gap: spacing.sm,
      backgroundColor: colors.surface,
    },
    validationHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    validationRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    download: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      borderWidth: 1,
      borderColor: colors.brandSoft,
      backgroundColor: colors.brandTint,
      borderRadius: radii.md,
      padding: spacing.md,
    },
  }),
);
