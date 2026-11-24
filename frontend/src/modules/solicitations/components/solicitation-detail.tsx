import { Copy, Download, ExternalLink, Eye, Link2, MessageCircle, Pencil, RefreshCw, Trash2, Upload } from 'lucide-react';
import { PendingUploadList } from '../../../components/pending-upload-list';
import {
  isUploadLabeled,
  prepareUploads,
  splitFileName,
  uploadLabel,
  type PendingUpload,
} from '../../../lib/attachment-upload';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { queryKeys } from '../../../lib/query-keys';
import { computePercentUsed, getTimeRemaining } from '../lib/sla.utils';
import { Button, Card, useToast } from '../../../components/ui';
import { ExternalStepActions, stepAssigneeLabel } from '../../approvals/components/external-step-info';
import { useAuth } from '../../../app/auth-context';
import type { DecideApprovalTarget } from '../../approvals/components/decide-approval-modal';
import { useWhatsAppMessagesQuery } from '../../integrations/hooks/use-webhooks';
import type { WhatsAppMessage, WhatsAppMessageStatus } from '../../integrations/services/webhooks-api';
import { fetchFormById } from '../../forms/services/forms-api';
import { PublicQuestionField } from '../../public-form/components/public-question-field';
import type { PublicAnswerValue, PublicFormField } from '../../public-form/types';
import { useStandardQuestionsQuery } from '../../standard-questions/hooks/use-standard-questions-query';
import type { StandardQuestion } from '../../standard-questions/types';
import {
  attachmentIcon,
  AttachmentViewer,
  canViewInBrowser,
  formatBytes,
  isNotFound,
  MISSING_FILE_NOTICE,
} from './attachment-display';
import { SolicitationHandoffLinks } from './solicitation-handoff-links';
import {
  useDeleteAttachmentMutation,
  useSolicitationAttachmentsQuery,
  useUpdateAttachmentMutation,
  useUploadAttachmentMutation,
} from '../hooks/use-solicitation-attachments';
import {
  addSolicitationComment,
  downloadAttachment,
  fetchSolicitationComments,
  fetchStandardAnswers,
  regenerateTrackingToken,
  saveStandardAnswers,
  type AddCommentInput,
  type SaveStandardAnswerInput,
} from '../services/solicitations-api';
import type { Approval, Attachment, Solicitation, SolicitationHistoryEntry } from '../types';
import { getTrackingUrl } from '../../../services/public-tracking-api';
import {
  getHistoryEventLabel,
  getOriginLabel,
  getPriorityClass,
  getPriorityMeta,
  getStatusClass,
  getStatusMeta,
} from './solicitation-formatters';

type SolicitationDetailProps = {
  solicitation: Solicitation | null;
  history: SolicitationHistoryEntry[];
  approvals: Approval[];
  loading: boolean;
  loadingHistory: boolean;
  loadingApprovals: boolean;
  canManageApprovals: boolean;
  canUploadAttachments?: boolean;
  canManageTracking?: boolean;
  currentUserId: string | null;
  canManageAllAttachments?: boolean;
  canViewInternalComments?: boolean;
  onCancelApproval: (approvalId: string) => void;
  cancellingApprovalId: string | null;
  onNewApproval: () => void;
  onDecideApproval: (target: DecideApprovalTarget) => void;
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1 rounded-xl bg-surface-container-low px-3 py-2">
      <span className="text-xs font-bold uppercase text-tx-secondary">{label}</span>
      <span className="break-words text-sm text-tx-primary">{value}</span>
    </div>
  );
}

const APPROVAL_STATUS_CLASS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300',
  approved: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-slate-500/20 dark:text-slate-300',
};

const APPROVAL_STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
  cancelled: 'Cancelado',
};

const STEP_STATUS_CLASS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  approved: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
  skipped: 'bg-gray-100 text-gray-400 dark:bg-slate-500/20 dark:text-slate-300',
  waiting: 'bg-gray-100 text-gray-500 dark:bg-slate-500/20 dark:text-slate-300',
};

const STEP_STATUS_LABEL: Record<string, string> = {
  pending: 'Aguardando decisão',
  approved: 'Aprovado',
  rejected: 'Reprovado',
  skipped: 'Pulado',
  waiting: 'Na fila',
};

const WHATSAPP_STATUS_LABEL: Record<WhatsAppMessageStatus, string> = {
  sent: 'Enviada',
  failed: 'Falhou',
  queued: 'Na fila',
  pending: 'Pendente',
};

const WHATSAPP_STATUS_CLASS: Record<WhatsAppMessageStatus, string> = {
  sent: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
  queued: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  pending: 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-200',
};

function AttachmentsPanel({
  solicitationId,
  currentUserId,
  canManageAllAttachments,
  canUpload,
}: {
  solicitationId: string;
  currentUserId: string | null;
  canManageAllAttachments?: boolean;
  canUpload: boolean;
}) {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState<boolean>(false);
  const [viewing, setViewing] = useState<Attachment | null>(null);

  const query = useSolicitationAttachmentsQuery(solicitationId);
  const uploadMutation = useUploadAttachmentMutation(solicitationId);
  const updateMutation = useUpdateAttachmentMutation(solicitationId);
  const deleteMutation = useDeleteAttachmentMutation(solicitationId);
  // Escolhidos e ainda não enviados: cada um precisa de um nome novo ou de uma descrição.
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [showLabelErrors, setShowLabelErrors] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string; description: string } | null>(null);

  const attachments = query.data ?? [];

  function canDeleteAttachment(a: Attachment): boolean {
    return Boolean(canManageAllAttachments) || a.uploadedByUserId === currentUserId;
  }

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setPreparing(true);
    try {
      const prepared = await prepareUploads(Array.from(files));
      setPending((current) => [...current, ...prepared]);
    } finally {
      setPreparing(false);
    }
  }

  async function sendPending() {
    if (pending.some((upload) => !isUploadLabeled(upload))) {
      setShowLabelErrors(true);
      return;
    }
    const failed: PendingUpload[] = [];
    for (const upload of pending) {
      try {
        await uploadMutation.mutateAsync({ file: upload.file, label: uploadLabel(upload) });
      } catch {
        failed.push(upload);
        showToast({
          title: 'Falha ao enviar anexo',
          description: `Não foi possível enviar "${upload.file.name}".`,
          variant: 'error',
        });
      }
    }
    // Os que falharam continuam na lista para tentar de novo.
    setPending(failed);
    setShowLabelErrors(false);
  }

  async function saveEditing() {
    if (!editing) return;
    try {
      await updateMutation.mutateAsync({
        id: editing.id,
        name: editing.name,
        description: editing.description,
      });
      setEditing(null);
      showToast({ title: 'Anexo atualizado', variant: 'success' });
    } catch {
      showToast({ title: 'Falha ao atualizar anexo', variant: 'error' });
    }
  }

  async function handleDelete(a: Attachment) {
    try {
      await deleteMutation.mutateAsync(a.id);
      showToast({ title: 'Anexo excluído', variant: 'success' });
    } catch {
      showToast({ title: 'Falha ao excluir anexo', variant: 'error' });
    }
  }

  async function handleDownload(a: Attachment) {
    try {
      await downloadAttachment(a.id, a.originalName);
    } catch (error) {
      showToast({
        title: 'Falha ao baixar anexo',
        description: isNotFound(error) ? MISSING_FILE_NOTICE : undefined,
        variant: 'error',
      });
    }
  }

  if (query.isLoading) {
    return (
      <div className="grid gap-2">
        {[1, 2].map((n) => (
          <div key={n} className="h-10 animate-pulse rounded-xl bg-surface-container-low" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {canUpload && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void addFiles(e.dataTransfer.files);
          }}
          className={[
            'flex cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed px-4 py-3 text-sm transition-colors',
            dragging
              ? 'border-primary bg-primary/5 text-primary'
              : 'border-border-default/50 text-tx-secondary hover:border-primary/60 hover:text-primary',
          ].join(' ')}
        >
          <Upload className="h-4 w-4 shrink-0" />
          {preparing ? 'Preparando arquivos...' : 'Adicionar anexos ou arraste aqui'}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {pending.length > 0 ? (
        <div className="grid gap-2">
          <PendingUploadList
            uploads={pending}
            requireLabel
            showErrors={showLabelErrors}
            disabled={uploadMutation.isPending}
            onChange={(id, patch) =>
              setPending((current) => current.map((u) => (u.id === id ? { ...u, ...patch } : u)))
            }
            onRemove={(index) => setPending((current) => current.filter((_, i) => i !== index))}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={uploadMutation.isPending}
              onClick={() => {
                setPending([]);
                setShowLabelErrors(false);
              }}
              className="rounded-xl border border-border-default/50 px-3 py-2 text-sm font-semibold text-tx-secondary hover:bg-surface-container-low disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={uploadMutation.isPending}
              onClick={() => void sendPending()}
              className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              {uploadMutation.isPending
                ? 'Enviando...'
                : pending.length === 1
                  ? 'Enviar 1 arquivo'
                  : `Enviar ${pending.length} arquivos`}
            </button>
          </div>
        </div>
      ) : null}

      {attachments.length === 0 ? (
        <p className="text-sm text-tx-secondary">Nenhum anexo nesta solicitação.</p>
      ) : (
        <ul className="grid gap-1.5">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 rounded-xl border border-border-default/40 bg-surface-container-low px-3 py-2"
            >
              {attachmentIcon(a.mimeType)}
              <div className="min-w-0 flex-1">
                {editing?.id === a.id ? (
                  <div className="grid gap-1.5 py-0.5">
                    <div className="grid gap-1 text-xs font-semibold text-tx-secondary">
                      <label htmlFor={`attachment-name-${a.id}`}>Nome do arquivo</label>
                      <span className="flex items-center gap-1.5">
                        <input
                          id={`attachment-name-${a.id}`}
                          type="text"
                          value={editing.name}
                          maxLength={190}
                          autoFocus
                          onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                          className="h-8 w-full rounded-[8px] border border-border-strong bg-bg-surface px-2 text-sm text-tx-primary outline-none focus:border-primary"
                        />
                        <span className="shrink-0 text-xs">{splitFileName(a.originalName).ext}</span>
                      </span>
                    </div>
                    <label className="grid gap-1 text-xs font-semibold text-tx-secondary">
                      Descrição
                      <input
                        type="text"
                        value={editing.description}
                        maxLength={1000}
                        placeholder="O que é este arquivo?"
                        onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                        className="h-8 w-full rounded-[8px] border border-border-strong bg-bg-surface px-2 text-sm text-tx-primary outline-none focus:border-primary"
                      />
                    </label>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-tx-secondary hover:bg-surface-container"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={updateMutation.isPending}
                        onClick={() => void saveEditing()}
                        className="rounded-lg bg-primary px-2 py-1 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
                      >
                        Salvar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="truncate text-sm font-medium text-tx-primary">{a.originalName}</p>
                    {a.description ? (
                      <p className="whitespace-pre-wrap break-words text-xs text-tx-primary">{a.description}</p>
                    ) : null}
                  </>
                )}
                <p className="text-xs text-tx-secondary">
                  {formatBytes(a.sizeBytes)} ·{' '}
                  {a.uploadedByUser?.fullName ?? 'Solicitante'} ·{' '}
                  {new Date(a.createdAt).toLocaleDateString('pt-BR')}
                </p>
              </div>
              {canViewInBrowser(a.mimeType) && (
                <button
                  type="button"
                  onClick={() => setViewing(a)}
                  title="Visualizar"
                  className="shrink-0 rounded p-1 text-tx-secondary hover:bg-primary/10 hover:text-primary"
                >
                  <Eye className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => { void handleDownload(a); }}
                title="Baixar"
                className="shrink-0 rounded p-1 text-tx-secondary hover:bg-primary/10 hover:text-primary"
              >
                <Download className="h-4 w-4" />
              </button>
              {canDeleteAttachment(a) && editing?.id !== a.id && (
                <button
                  type="button"
                  onClick={() =>
                    setEditing({
                      id: a.id,
                      name: splitFileName(a.originalName).base,
                      description: a.description ?? '',
                    })
                  }
                  title="Renomear ou descrever"
                  aria-label={`Renomear ou descrever ${a.originalName}`}
                  className="shrink-0 rounded p-1 text-tx-secondary hover:bg-primary/10 hover:text-primary"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
              {canDeleteAttachment(a) && (
                <button
                  type="button"
                  onClick={() => { void handleDelete(a); }}
                  disabled={deleteMutation.isPending}
                  title="Excluir"
                  className="shrink-0 rounded p-1 text-tx-secondary hover:bg-error/10 hover:text-error disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {viewing ? <AttachmentViewer attachment={viewing} onClose={() => setViewing(null)} /> : null}
    </div>
  );
}

function TrackingPanel({
  solicitation,
  canManage,
}: {
  solicitation: Solicitation;
  canManage: boolean;
}) {
  const { showToast } = useToast();
  const [token, setToken] = useState<string | null>(solicitation.trackingToken);
  const [regenerating, setRegenerating] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const trackingUrl = token ? getTrackingUrl(token) : null;

  function handleCopy() {
    if (!trackingUrl) return;
    navigator.clipboard.writeText(trackingUrl).catch(() => {});
    showToast({ title: 'Link copiado!', variant: 'success' });
  }

  async function handleRegenerate() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setRegenerating(true);
    try {
      const result = await regenerateTrackingToken(solicitation.id);
      setToken(result.trackingToken);
      showToast({ title: 'Link regenerado com sucesso', variant: 'success' });
    } catch {
      showToast({ title: 'Falha ao regenerar link', variant: 'error' });
    } finally {
      setRegenerating(false);
    }
  }

  if (!token) {
    return <p className="text-sm text-tx-secondary">Token de rastreamento não disponível.</p>;
  }

  return (
    // `min-w-0` em toda a cadeia: a URL não quebra linha (truncate), então sem
    // isso o min-content dela empurra a coluna inteira e a página ganha rolagem
    // horizontal em telas estreitas.
    <div className="grid min-w-0 gap-3">
      <div className="flex min-w-0 items-center gap-2 rounded-xl border border-border-default/40 bg-surface-container-low px-3 py-2">
        <Link2 className="h-4 w-4 shrink-0 text-tx-secondary" />
        <span className="min-w-0 flex-1 truncate text-sm text-tx-primary">{trackingUrl}</span>
        <button
          type="button"
          onClick={handleCopy}
          title="Copiar link"
          className="shrink-0 rounded p-1 text-tx-secondary hover:bg-primary/10 hover:text-primary"
        >
          <Copy className="h-4 w-4" />
        </button>
        <a
          href={trackingUrl ?? '#'}
          target="_blank"
          rel="noreferrer"
          title="Abrir link"
          className="shrink-0 rounded p-1 text-tx-secondary hover:bg-primary/10 hover:text-primary"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      {canManage ? (
        confirming ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="flex-1 text-xs text-amber-800">
              O link anterior deixará de funcionar. Confirmar?
            </p>
            <Button
              size="sm"
              variant="ghost"
              className="text-red-600 hover:bg-red-50"
              disabled={regenerating}
              onClick={() => { void handleRegenerate(); }}
            >
              Confirmar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            disabled={regenerating}
            onClick={() => { void handleRegenerate(); }}
            className="inline-flex items-center gap-2 self-start"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {regenerating ? 'Regenerando...' : 'Regenerar link'}
          </Button>
        )
      ) : null}
    </div>
  );
}

function toPublicField(question: StandardQuestion): PublicFormField {
  return {
    id: question.id,
    code: question.code,
    label: question.label,
    fieldType: question.fieldType,
    required: question.required,
    order: question.order,
    settingsJson: question.settingsJson ?? {},
    conditionsJson: {},
    visibilityRules: null,
    options: (question.optionsJson ?? []).map((option, index) => ({
      id: `${question.id}_${index}`,
      internalValue: option.value,
      displayLabel: option.label,
      order: index,
    })),
  };
}

function toAnswerInputValue(value: {
  valueText: string | null;
  valueNumber: number | null;
  valueBoolean: boolean | null;
  valueJson: unknown;
}): PublicAnswerValue {
  if (value.valueJson !== null && value.valueJson !== undefined) return value.valueJson as PublicAnswerValue;
  if (value.valueBoolean !== null) return value.valueBoolean;
  if (value.valueNumber !== null) return value.valueNumber;
  return value.valueText;
}

function toAnswerSaveInput(
  question: StandardQuestion,
  value: PublicAnswerValue,
): SaveStandardAnswerInput {
  const base = { questionId: question.id, fieldCode: question.code };
  if (Array.isArray(value)) return { ...base, valueJson: value };
  if (typeof value === 'boolean') return { ...base, valueBoolean: value };
  if (typeof value === 'number') return { ...base, valueNumber: value };
  if (typeof value === 'string') return { ...base, valueText: value };
  return base;
}

function StandardQuestionsPanel({ solicitationId, formId }: { solicitationId: string; formId: string | null }) {
  const { can } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  // Responder às perguntas padrão é atuar no card, no processo dele.
  const canManage = can('solicitations.act', formId);

  const questionsQuery = useStandardQuestionsQuery(formId);
  const answersQuery = useQuery({
    queryKey: queryKeys.solicitations.standardAnswers(solicitationId),
    queryFn: () => fetchStandardAnswers(solicitationId),
  });

  const [values, setValues] = useState<Record<string, PublicAnswerValue>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!answersQuery.data) return;
    const next: Record<string, PublicAnswerValue> = {};
    for (const item of answersQuery.data) {
      if (!item.questionId) continue;
      next[item.questionId] = toAnswerInputValue(item);
    }
    setValues(next);
  }, [answersQuery.data]);

  const questions = questionsQuery.data ?? [];
  if (questions.length === 0) return null;

  async function handleSave() {
    setSaving(true);
    try {
      const items = questions.map((question) => toAnswerSaveInput(question, values[question.id] ?? null));
      await saveStandardAnswers(solicitationId, items);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.solicitations.standardAnswers(solicitationId),
      });
      showToast({ title: 'Respostas salvas', variant: 'success' });
    } catch {
      showToast({ title: 'Erro ao salvar respostas', variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="grid min-w-0 gap-4">
      <h3 className="text-lg font-bold text-tx-primary">Perguntas padrão</h3>

      <div className="grid gap-5">
        {questions.map((question) => (
          <PublicQuestionField
            key={question.id}
            field={toPublicField(question)}
            value={values[question.id] ?? null}
            onChange={(value) => canManage && setValues((current) => ({ ...current, [question.id]: value }))}
            onToggleMulti={(optionValue, checked) => {
              if (!canManage) return;
              const current = Array.isArray(values[question.id]) ? (values[question.id] as string[]) : [];
              setValues((prev) => ({
                ...prev,
                [question.id]: checked
                  ? [...current, optionValue]
                  : current.filter((item) => item !== optionValue),
              }));
            }}
          />
        ))}
      </div>

      {canManage ? (
        <Button
          size="sm"
          variant="subtle"
          className="w-fit"
          disabled={saving || answersQuery.isLoading}
          onClick={() => void handleSave()}
        >
          {saving ? 'Salvando...' : 'Salvar respostas'}
        </Button>
      ) : null}
    </Card>
  );
}

function ProposalBadge({
  status,
  rejectionReason,
}: {
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string | null;
}) {
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
        ⏳ Aguardando aprovação
      </span>
    );
  }
  if (status === 'approved') {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
        ✅ Aprovada pelo solicitante
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700"
      title={rejectionReason ?? undefined}
    >
      ❌ Reprovada{rejectionReason ? `: ${rejectionReason}` : ''}
    </span>
  );
}

function CommentsPanel({
  solicitationId,
  formId,
  canViewInternalComments,
}: {
  solicitationId: string;
  formId: string | null;
  canViewInternalComments?: boolean;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [content, setContent] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [sendAsProposal, setSendAsProposal] = useState(false);

  const commentsQuery = useQuery({
    queryKey: queryKeys.solicitations.comments(solicitationId),
    queryFn: () => fetchSolicitationComments(solicitationId),
  });

  const formQuery = useQuery({
    queryKey: queryKeys.forms.byId(formId ?? ''),
    queryFn: () => fetchFormById(formId as string),
    enabled: !!formId,
    staleTime: 30_000,
  });

  const addMutation = useMutation({
    mutationFn: (dto: AddCommentInput) => addSolicitationComment(solicitationId, dto),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.solicitations.comments(solicitationId),
      });
      setContent('');
      setIsInternal(false);
      setSendAsProposal(false);
    },
    onError: () => {
      showToast({ title: 'Falha ao enviar comentário', variant: 'error' });
    },
  });

  const comments = commentsQuery.data ?? [];
  const requiresResponseApproval =
    formQuery.data?.versions?.[0]?.settingsJson?.requiresResponseApproval ?? false;
  const hasPendingProposal = comments.some(
    (c) => c.authorType === 'team' && c.proposalStatus === 'pending',
  );
  // Uma nova PROPOSTA fica bloqueada enquanto a atual não é decidida, mas a
  // conversa normal com o solicitante continua liberada — "enviar como
  // proposta" é uma escolha à parte, não algo automático por causa do form.
  const proposalBlocked = requiresResponseApproval && hasPendingProposal;
  const blockSubmit = sendAsProposal && proposalBlocked && !isInternal;

  useEffect(() => {
    if (proposalBlocked) setSendAsProposal(false);
  }, [proposalBlocked]);

  return (
    <div className="grid gap-4">
      {commentsQuery.isLoading ? (
        <div className="grid gap-2">
          {[1, 2].map((n) => (
            <div key={n} className="h-12 animate-pulse rounded-xl bg-surface-container-low" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {comments.length === 0 ? (
            <p className="text-sm text-tx-secondary">Nenhum comentário ainda.</p>
          ) : (
            comments.map((c) => (
              <div
                key={c.id}
                className={['flex', c.authorType === 'team' ? 'justify-end' : 'justify-start'].join(' ')}
              >
                <div
                  className={[
                    'max-w-[78%] rounded-2xl px-4 py-2 text-sm',
                    c.authorType === 'team'
                      ? 'rounded-tr-none bg-primary text-white'
                      : 'rounded-tl-none bg-surface-container text-tx-primary',
                  ].join(' ')}
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <p className={[
                      'text-xs font-semibold',
                      c.authorType === 'team' ? 'text-white opacity-80' : 'text-tx-secondary',
                    ].join(' ')}>
                      {c.authorType === 'team' ? (c.authorName ?? 'Equipe') : (c.authorName ?? 'Solicitante')}
                    </p>
                    {c.isInternal ? (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        🔒 Interno
                      </span>
                    ) : null}
                    {c.proposalStatus ? (
                      <ProposalBadge
                        status={c.proposalStatus}
                        rejectionReason={c.proposalRejectionReason}
                      />
                    ) : null}
                  </div>
                  <p
                    className={[
                      'whitespace-pre-wrap',
                      c.authorType === 'team' ? 'text-white' : 'text-tx-primary',
                    ].join(' ')}
                  >
                    {c.content}
                  </p>
                  <p className={[
                    'mt-1 text-right text-xs',
                    c.authorType === 'team' ? 'text-white opacity-60' : 'text-tx-secondary',
                  ].join(' ')}>
                    {new Date(c.createdAt).toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {proposalBlocked && !isInternal ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
          Já existe uma proposta aguardando decisão do solicitante — dá pra continuar comentando
          normalmente, mas uma nova proposta só pode ser enviada depois que ela for decidida.
        </p>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = content.trim();
          if (!trimmed || trimmed.length > 2000 || blockSubmit) return;
          addMutation.mutate({ content: trimmed, isInternal, asProposal: !isInternal && sendAsProposal });
        }}
        className="grid gap-2 border-t border-border-default/40 pt-3"
      >
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Escreva um comentário..."
          className="w-full resize-none rounded-xl border border-border-default/50 bg-surface-container-low px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className={[
              'text-xs',
              content.length > 1900 ? 'text-amber-600' : 'text-tx-secondary',
            ].join(' ')}>
              {content.length}/2000
            </p>
            {requiresResponseApproval && !isInternal ? (
              <button
                type="button"
                onClick={() => setSendAsProposal((v) => !v)}
                disabled={proposalBlocked}
                title={
                  proposalBlocked
                    ? 'Aguarde a decisão da proposta atual para enviar uma nova.'
                    : undefined
                }
                className={[
                  'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  sendAsProposal
                    ? 'bg-primary text-white'
                    : 'bg-surface-container text-tx-secondary hover:bg-surface-container-high',
                ].join(' ')}
              >
                📋 {sendAsProposal ? 'Como proposta' : 'Enviar como proposta'}
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {canViewInternalComments ? (
              <button
                type="button"
                onClick={() =>
                  setIsInternal((v) => {
                    const next = !v;
                    if (next) setSendAsProposal(false);
                    return next;
                  })
                }
                className={[
                  'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                  isInternal
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                    : 'bg-surface-container text-tx-secondary hover:bg-surface-container-high',
                ].join(' ')}
              >
                🔒 {isInternal ? 'Interno' : 'Público'}
              </button>
            ) : null}
            <Button
              size="sm"
              variant="subtle"
              type="submit"
              disabled={!content.trim() || addMutation.isPending || blockSubmit}
            >
              {addMutation.isPending
                ? 'Enviando...'
                : sendAsProposal && !isInternal
                  ? 'Enviar proposta'
                  : 'Comentar'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function maskPhone(value: string): string {
  const phone = value.trim();
  if (!phone) return '-';
  if (phone.length <= 4) return '****';
  if (phone.length <= 7) return `${phone.slice(0, 2)}****${phone.slice(-1)}`;
  return `${phone.slice(0, 5)}****${phone.slice(-2)}`;
}

function previewMessage(value: string): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length > 100 ? `${compact.slice(0, 100)}...` : compact;
}

function WhatsAppMessageItem({ message }: { message: WhatsAppMessage }) {
  return (
    <li className="grid gap-2 rounded-xl border border-border-default/50 bg-surface-container-low px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-bold text-tx-primary">
            <MessageCircle className="h-4 w-4 text-green-700" />
            {maskPhone(message.to)}
          </p>
          <p className="mt-1 text-sm text-tx-secondary">{previewMessage(message.message)}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={[
              'rounded-full px-2 py-1 text-xs font-bold',
              WHATSAPP_STATUS_CLASS[message.status],
            ].join(' ')}
          >
            {WHATSAPP_STATUS_LABEL[message.status]}
          </span>
          <span className="text-xs text-tx-secondary">
            {new Date(message.createdAt).toLocaleString('pt-BR')}
          </span>
        </div>
      </div>
      {message.errorMessage ? (
        <p className="rounded-lg bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
          {message.errorMessage}
        </p>
      ) : null}
    </li>
  );
}

export function SolicitationDetail({
  solicitation,
  history,
  approvals,
  loading,
  loadingHistory,
  loadingApprovals,
  canManageApprovals,
  canUploadAttachments,
  canManageTracking,
  currentUserId,
  canManageAllAttachments,
  canViewInternalComments,
  onCancelApproval,
  cancellingApprovalId,
  onNewApproval,
  onDecideApproval,
}: SolicitationDetailProps) {
  const whatsappMessagesQuery = useWhatsAppMessagesQuery(
    {
      page: 1,
      limit: 100,
      solicitationId: solicitation?.id,
    },
    { enabled: Boolean(solicitation?.id) },
  );
  const whatsappMessages = [...(whatsappMessagesQuery.data?.data ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  if (loading && !solicitation) {
    return (
      <Card>
        <p className="text-sm text-tx-secondary">Carregando detalhe...</p>
      </Card>
    );
  }

  if (!solicitation) {
    return (
      <Card>
        <p className="text-sm text-tx-secondary">
          Selecione uma solicitacao para ver os detalhes.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid min-w-0 gap-3">
      <Card className="grid min-w-0 gap-4">
        <header className="grid min-w-0 gap-2">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-xl font-bold text-tx-primary">{solicitation.title}</h2>
              <p className="text-sm text-tx-secondary">
                {solicitation.description ?? 'Sem descricao informada.'}
              </p>
            </div>
            <span className="text-xs font-semibold text-tx-secondary">
              {getOriginLabel(solicitation.originType)}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <span
              className={[
                'inline-flex rounded-full px-2 py-1 text-xs font-bold',
                getStatusClass(solicitation.status),
              ].join(' ')}
            >
              {getStatusMeta(solicitation.status).label}
            </span>
            <span
              className={[
                'inline-flex rounded-full px-2 py-1 text-xs font-bold',
                getPriorityClass(solicitation.priority),
              ].join(' ')}
            >
              {getPriorityMeta(solicitation.priority).label}
            </span>
          </div>
        </header>

        <SolicitationHandoffLinks solicitationId={solicitation.id} />

        <div className="grid min-w-0 gap-2 md:grid-cols-2">
          <DetailRow label="Formulario" value={solicitation.form?.name ?? '-'} />
          <DetailRow label="Submissao" value={solicitation.submissionId ?? '-'} />
          <DetailRow
            label="Respondente"
            value={
              solicitation.submission?.responderName ??
              solicitation.submission?.responderEmail ??
              '-'
            }
          />
          <DetailRow label="Responsavel" value={solicitation.assignee?.fullName ?? '-'} />
          {solicitation.requesterContact?.name ? (
            <DetailRow label="Nome do solicitante" value={solicitation.requesterContact.name} />
          ) : null}
          {solicitation.requesterContact?.email ? (
            <DetailRow label="E-mail do solicitante" value={solicitation.requesterContact.email} />
          ) : null}
          {solicitation.requesterContact?.phone ? (
            <DetailRow label="Telefone do solicitante" value={solicitation.requesterContact.phone} />
          ) : null}
          <DetailRow
            label="Criada em"
            value={new Date(solicitation.createdAt).toLocaleString('pt-BR')}
          />
          <DetailRow
            label="Atualizada em"
            value={new Date(solicitation.updatedAt).toLocaleString('pt-BR')}
          />
        </div>
      </Card>

      <StandardQuestionsPanel solicitationId={solicitation.id} formId={solicitation.formId} />

      {solicitation.slaStatus ? (
        <Card className="grid min-w-0 gap-3">
          <h3 className="text-lg font-bold text-tx-primary">SLA</h3>

          {solicitation.slaDueAt ? (
            <>
              {(() => {
                const pct = computePercentUsed(
                  solicitation.slaStartedAt ?? solicitation.createdAt,
                  solicitation.slaDueAt,
                );
                const isBreached = solicitation.slaStatus === 'breached';
                const isWarning = solicitation.slaStatus === 'warning';
                const barColor = isBreached
                  ? 'bg-red-500'
                  : isWarning
                    ? 'bg-amber-400'
                    : 'bg-green-500';

                return (
                  <>
                    <div className="grid gap-1.5">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-tx-secondary">Progresso do prazo</span>
                        <span
                          className={
                            isBreached
                              ? 'text-red-600'
                              : isWarning
                                ? 'text-amber-600'
                                : 'text-green-700'
                          }
                        >
                          {pct}%
                        </span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-container-low">
                        <div
                          className={['h-full rounded-full transition-all', barColor].join(' ')}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="grid gap-1 rounded-xl bg-surface-container-low px-3 py-2">
                        <span className="text-xs font-bold uppercase text-tx-secondary">
                          {isBreached ? 'Venceu em' : 'Vence em'}
                        </span>
                        <span className="text-sm text-tx-primary">
                          {new Date(solicitation.slaDueAt).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div className="grid gap-1 rounded-xl bg-surface-container-low px-3 py-2">
                        <span className="text-xs font-bold uppercase text-tx-secondary">
                          {isBreached ? 'Tempo vencido' : 'Tempo restante'}
                        </span>
                        <span
                          className={[
                            'text-sm font-semibold',
                            isBreached
                              ? 'text-red-600'
                              : isWarning
                                ? 'text-amber-700'
                                : 'text-green-700',
                          ].join(' ')}
                        >
                          {getTimeRemaining(solicitation.slaDueAt)}
                        </span>
                      </div>
                    </div>
                  </>
                );
              })()}
            </>
          ) : (
            <p className="text-sm text-tx-secondary">Sem prazo definido.</p>
          )}
        </Card>
      ) : null}

      {(canManageTracking ?? false) ? (
        <Card className="grid min-w-0 gap-3">
          <h3 className="text-lg font-bold text-tx-primary">Link de acompanhamento</h3>
          <TrackingPanel
            solicitation={solicitation}
            canManage={canManageTracking ?? false}
          />
        </Card>
      ) : null}

      {whatsappMessages.length > 0 ? (
        <Card className="grid min-w-0 gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-tx-primary">Mensagens WhatsApp</h3>
              <p className="text-sm text-tx-secondary">
                {whatsappMessages.length} mensagem(ns) vinculada(s) a esta solicitação.
              </p>
            </div>
            {whatsappMessagesQuery.isFetching ? (
              <span className="text-xs font-semibold text-tx-secondary">Atualizando...</span>
            ) : null}
          </div>
          <ol className="grid gap-2">
            {whatsappMessages.map((message) => (
              <WhatsAppMessageItem key={message.id} message={message} />
            ))}
          </ol>
        </Card>
      ) : null}

      <Card className="grid min-w-0 gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-tx-primary">Aprovações</h3>
          <div className="flex items-center gap-2">
            {loadingApprovals ? (
              <span className="text-xs font-semibold text-tx-secondary">Carregando...</span>
            ) : null}
            {canManageApprovals ? (
              <Button size="sm" variant="subtle" onClick={onNewApproval}>
                Nova aprovação
              </Button>
            ) : null}
          </div>
        </div>

        {!loadingApprovals && approvals.length === 0 ? (
          <p className="text-sm text-tx-secondary">Nenhuma aprovação registrada.</p>
        ) : null}

        {approvals.map((approval) => {
          const pendingStep = currentUserId
            ? approval.steps.find(
                (step) => step.status === 'pending' && step.assignedUserId === currentUserId,
              )
            : undefined;

          return (
              <div
                key={approval.id}
                className="grid gap-2 rounded-xl border border-border-default bg-surface-container-low p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-tx-primary">{approval.title}</p>
                    {approval.description ? (
                      <p className="mt-0.5 text-xs text-tx-secondary">
                        {approval.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700"
                      title={`${approval.steps.filter((step) => step.status === 'approved').length} de ${approval.requiredDecisions} aprovação(ões) necessária(s)`}
                    >
                      {approval.mode === 'sequential'
                        ? 'Em ordem'
                        : approval.requiredDecisions > 1
                          ? `Todos · ${approval.steps.filter((step) => step.status === 'approved').length}/${approval.requiredDecisions}`
                          : 'Qualquer um'}
                    </span>
                    <span
                      className={[
                        'inline-flex rounded-full px-2 py-0.5 text-xs font-bold',
                        APPROVAL_STATUS_CLASS[approval.status] ?? 'bg-gray-100 text-gray-600 dark:bg-slate-500/20 dark:text-slate-300',
                      ].join(' ')}
                    >
                      {APPROVAL_STATUS_LABEL[approval.status] ?? approval.status}
                    </span>
                    {pendingStep ? (
                      <Button
                        size="sm"
                        variant="subtle"
                        onClick={() =>
                          onDecideApproval({
                            stepId: pendingStep.id,
                            approvalId: approval.id,
                            solicitationId: solicitation.id,
                            approvalTitle: approval.title,
                            approvalDescription: approval.description,
                            solicitation,
                          })
                        }
                      >
                        Decidir
                      </Button>
                    ) : null}
                    {canManageApprovals && approval.status === 'pending' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:bg-red-50"
                        disabled={cancellingApprovalId === approval.id}
                        onClick={() => onCancelApproval(approval.id)}
                      >
                        {cancellingApprovalId === approval.id ? 'Cancelando...' : 'Cancelar'}
                      </Button>
                    ) : null}
                  </div>
                </div>

                {approval.steps.length > 0 ? (
                  <div className="border-t border-border-default/50 pt-2">
                    {approval.mode === 'sequential' ? (
                      <ol className="relative ml-3 grid gap-0 border-l-2 border-border-default/40 pl-5">
                        {approval.steps.map((step) => (
                          <li key={step.id} className="relative pb-3 last:pb-0">
                            <span className="absolute -left-[25px] flex h-4 w-4 items-center justify-center rounded-full bg-surface-container text-[10px] font-bold ring-2 ring-outline-variant/40">
                              {step.order}
                            </span>
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                              <span className="text-tx-secondary">{stepAssigneeLabel(step)}</span>
                              <div className="flex items-center gap-2">
                                {step.decision?.comment ? (
                                  <span
                                    className="max-w-[180px] truncate italic text-tx-secondary"
                                    title={step.decision.comment}
                                  >
                                    "{step.decision.comment}"
                                  </span>
                                ) : null}
                                <span
                                  className={[
                                    'inline-flex rounded-full px-2 py-0.5 font-bold',
                                    step.status === 'pending' ? 'animate-pulse' : '',
                                    STEP_STATUS_CLASS[step.status] ?? 'bg-gray-100 text-gray-500 dark:bg-slate-500/20 dark:text-slate-300',
                                  ].join(' ')}
                                >
                                  {STEP_STATUS_LABEL[step.status] ?? step.status}
                                </span>
                              </div>
                            </div>
                            <ExternalStepActions
                              step={step}
                              solicitationId={solicitation.id}
                              canManage={canManageApprovals}
                            />
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <ol className="grid gap-1.5">
                        {approval.steps.map((step) => (
                          <li
                            key={step.id}
                            className="flex flex-wrap items-center justify-between gap-2 text-xs"
                          >
                            <span className="text-tx-secondary">
                              {step.order}. {stepAssigneeLabel(step)}
                            </span>
                            <div className="flex items-center gap-2">
                              {step.decision?.comment ? (
                                <span
                                  className="max-w-[180px] truncate italic text-tx-secondary"
                                  title={step.decision.comment}
                                >
                                  "{step.decision.comment}"
                                </span>
                              ) : null}
                              <span
                                className={[
                                  'inline-flex rounded-full px-2 py-0.5 font-bold',
                                  step.status === 'pending' ? 'animate-pulse' : '',
                                  STEP_STATUS_CLASS[step.status] ?? 'bg-gray-100 text-gray-500 dark:bg-slate-500/20 dark:text-slate-300',
                                ].join(' ')}
                              >
                                {STEP_STATUS_LABEL[step.status] ?? step.status}
                              </span>
                            </div>
                            <div className="w-full">
                              <ExternalStepActions
                                step={step}
                                solicitationId={solicitation.id}
                                canManage={canManageApprovals}
                              />
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                ) : null}
              </div>
          );
        })}
      </Card>

      <Card className="grid min-w-0 gap-3">
        <h3 className="text-lg font-bold text-tx-primary">Anexos</h3>
        <AttachmentsPanel
          solicitationId={solicitation.id}
          currentUserId={currentUserId}
          canManageAllAttachments={canManageAllAttachments}
          canUpload={canUploadAttachments ?? false}
        />
      </Card>

      <Card className="grid min-w-0 gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-tx-primary">Historico</h3>
          {loadingHistory ? (
            <span className="text-xs font-semibold text-tx-secondary">Atualizando...</span>
          ) : null}
        </div>

        {history.length === 0 ? (
          <p className="text-sm text-tx-secondary">Sem eventos de historico.</p>
        ) : (
          <ol className="grid gap-2">
            {history.map((entry) => (
              <li key={entry.id} className="grid gap-1 rounded-xl bg-surface-container-low px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm text-tx-primary">
                    {getHistoryEventLabel(entry.eventType)}
                  </strong>
                  <span className="text-xs text-tx-secondary">
                    {new Date(entry.createdAt).toLocaleString('pt-BR')}
                  </span>
                </div>
                <p className="text-xs text-tx-secondary">
                  {entry.actor?.fullName ?? 'Sistema'}
                  {entry.fromValue || entry.toValue
                    ? `: ${entry.fromValue ?? '-'} -> ${entry.toValue ?? '-'}`
                    : ''}
                </p>
                {entry.message ? (
                  <p className="text-sm text-tx-primary">{entry.message}</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card className="grid min-w-0 gap-3">
        <h3 className="text-lg font-bold text-tx-primary">Comentários</h3>
        <CommentsPanel
          solicitationId={solicitation.id}
          formId={solicitation.formId}
          canViewInternalComments={canViewInternalComments}
        />
      </Card>
    </div>
  );
}
