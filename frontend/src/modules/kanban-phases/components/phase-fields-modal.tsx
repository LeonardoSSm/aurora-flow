import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, FileText, ListChecks, Lock, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../app/auth-context';
import { CameraCaptureButton } from '../../../components/camera-capture-button';
import { PendingUploadList } from '../../../components/pending-upload-list';
import { useToast } from '../../../components/ui';
import {
  fileLabelRequired,
  isUploadLabeled,
  prepareUploads,
  uploadLabel,
  type PendingUpload,
} from '../../../lib/attachment-upload';
import { queryKeys } from '../../../lib/query-keys';
import { getApiErrorMessage } from '../../approvals/components/approval-modal-utils';
import { useMyPendingApprovalsQuery } from '../../approvals/hooks/use-my-pending-approvals-query';
import { useSolicitationApprovalsQuery } from '../../approvals/hooks/use-solicitation-approvals-query';
import { PublicQuestionField } from '../../public-form/components/public-question-field';
import { brandCssVars, themeAwareFieldVars } from '../../../brand/css-vars';
import { useBrand } from '../../../brand/hooks/useBrand';
import { useEscapeKey } from '../../../hooks/use-escape-key';
import type { ItemOrderAnswer, PublicAnswerValue, PublicFormField } from '../../public-form/types';
import { validateFieldValue } from '../../public-form/form-runtime';
import { isItemOrderAnswer, toItemOrderSubmitValue } from '../../public-form/item-order';
import { isPhaseLayoutType } from '../lib/phase-field-types';
import { previewPhaseCalculations } from '../lib/phase-formula';
import { reachablePhaseFieldIds } from '../lib/phase-section-flow';
import { phaseExitBlockers, phaseExitHint } from '../lib/phase-required-exit';
import { moveBackBarrier } from '../lib/phase-move-back';
import { ApprovalStepsList, PhaseApprovalDecision } from './phase-approval-decision';
import { PhaseTimeline } from './phase-timeline';
import { fetchResponseById } from '../../responses/services/responses-api';
import { fetchSolicitationById } from '../../solicitations/services/solicitations-api';
import { isPhasePerson, peopleCount, phaseActors, phaseApprovers } from '../lib/phase-people';
import { phaseApprovalBlockOf, type PhaseApprovalBlock } from '../lib/phase-approval-block';
import { PhaseApprovalBlockDialog } from './phase-approval-block-dialog';
import {
  attachmentIcon,
  AttachmentPreview,
  formatBytes,
  FormAttachmentsList,
  LabelValidationPanel,
} from '../../solicitations/components/attachment-display';
import { ResponseDetailModal } from '../../responses/components/response-detail-modal';
import { SolicitationDetailModal } from '../../solicitations/components/solicitation-detail-modal';
import {
  useRequestPhaseApprovalMutation,
  useSolicitationAttachmentsQuery,
  useUploadPhaseAttachmentMutation,
} from '../../solicitations/hooks/use-solicitation-attachments';
import { useMoveKanbanPhaseMutation } from '../../solicitations/hooks/use-move-kanban-phase-mutation';
import {
  fetchPhaseFieldValues,
  savePhaseFieldValues,
  type PhaseFieldValue,
  type SavePhaseFieldValueInput,
} from '../../solicitations/services/solicitations-api';
import type { Approval, Attachment, LabelValidationResult } from '../../solicitations/types';
import type { KanbanCard } from '../../solicitations/types';
import { useKanbanPhasesQuery } from '../hooks/use-kanban-phases-query';
import type { KanbanPhase, KanbanPhaseField } from '../types';
import {
  formatPhaseValue,
  getPhaseFieldEntries,
  PhaseFieldValuesSummary,
} from './phase-field-values-summary';
import { SolicitationErpDetails } from '../../solicitations/components/solicitation-erp-details';
import { SolicitationHandoffLinks } from '../../solicitations/components/solicitation-handoff-links';
import { visibleOptions } from '../../item-lists/linked-options';

type PhaseAttachmentValue = {
  attachmentId: string;
  description?: string | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  validationResult?: LabelValidationResult | null;
};

function isPhaseAttachmentValue(value: unknown): value is PhaseAttachmentValue {
  return Boolean(value) && typeof value === 'object' && 'attachmentId' in (value as object);
}

function toPublicField(field: KanbanPhaseField): PublicFormField {
  return {
    id: field.id,
    code: field.code,
    label: field.label,
    fieldType: field.fieldType,
    required: field.required,
    order: field.order,
    settingsJson: field.settingsJson ?? {},
    conditionsJson: {},
    visibilityRules: null,
    // Seleção ligada a uma lista: item desativado não aparece para escolher.
    options: visibleOptions(field.optionsJson ?? [], field.settingsJson, (option) => option.value).map((option, index) => ({
      id: `${field.id}_${index}`,
      internalValue: option.value,
      displayLabel: option.label,
      order: index,
    })),
  };
}

function toInputValue(
  value: { valueText: string | null; valueNumber: number | null; valueBoolean: boolean | null; valueJson: unknown },
  field?: KanbanPhaseField,
): PublicAnswerValue {
  // "Pedido de itens" grava o retrato (itens + colunas da lista); o campo edita só chave e respostas.
  if (field?.fieldType === 'item_order') {
    const rows = (value.valueJson as { rows?: ItemOrderAnswer['rows'] } | null)?.rows;
    if (!Array.isArray(rows)) return null;
    return { kind: 'item_order', rows: rows.map((row) => ({ key: row.key, answers: { ...row.answers } })) };
  }
  if (value.valueJson !== null && value.valueJson !== undefined) return value.valueJson as PublicAnswerValue;
  if (value.valueBoolean !== null) return value.valueBoolean;
  // "Valor (R$)" grava o texto e o número: o campo edita o texto ("R$ 1.500,00").
  if (value.valueText !== null) return value.valueText;
  return value.valueNumber;
}

function toSaveInput(field: KanbanPhaseField, value: PublicAnswerValue): SavePhaseFieldValueInput {
  const base = { phaseFieldId: field.id, fieldCode: field.code };
  // Pedido vai como no envio do formulário (chave e respostas); o servidor monta o retrato. Sempre
  // um objeto — `{ rows: [] }` limpa —, porque o servidor ignora o que não for (app móvel).
  if (field.fieldType === 'item_order') {
    return {
      ...base,
      valueJson: isItemOrderAnswer(value) ? toItemOrderSubmitValue(toPublicField(field), value) : { rows: [] },
    };
  }
  if (Array.isArray(value)) return { ...base, valueJson: value };
  if (typeof value === 'boolean') return { ...base, valueBoolean: value };
  if (typeof value === 'number') return { ...base, valueNumber: value };
  if (typeof value === 'string') return { ...base, valueText: value };
  return base;
}

function PhaseFileField({
  field,
  value,
  solicitationId,
  phaseId,
  onChange,
  disabled,
  error,
}: {
  field: KanbanPhaseField;
  value: PhaseAttachmentValue | null;
  solicitationId: string;
  phaseId: string;
  onChange: (next: PhaseAttachmentValue | null) => void;
  disabled?: boolean;
  error?: string;
}) {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = useUploadPhaseAttachmentMutation(solicitationId, phaseId);
  const requireLabel = fileLabelRequired(field.settingsJson);
  // Arquivo escolhido (já otimizado, se for foto) esperando nome/descrição antes de subir.
  const [pending, setPending] = useState<PendingUpload | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [showLabelError, setShowLabelError] = useState(false);

  async function pickFile(file: File) {
    setPreparing(true);
    try {
      const [prepared] = await prepareUploads([file]);
      setPending(prepared);
      setShowLabelError(false);
    } finally {
      setPreparing(false);
    }
  }

  async function sendPending() {
    if (!pending) return;
    if (requireLabel && !isUploadLabeled(pending)) {
      setShowLabelError(true);
      return;
    }
    try {
      const attachment = await uploadMutation.mutateAsync({ file: pending.file, label: uploadLabel(pending) });
      setPending(null);
      setShowLabelError(false);
      onChange({
        attachmentId: attachment.id,
        originalName: attachment.originalName,
        description: attachment.description ?? null,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        validationResult: attachment.validationResult,
      });
    } catch {
      showToast({ title: 'Falha ao enviar arquivo', variant: 'error' });
    }
  }

  return (
    <div className="grid gap-1.5">
      <label className="text-sm font-semibold text-tx-primary">
        {field.label}
        {field.required ? <span className="text-error"> *</span> : null}
      </label>
      {value ? (
        <div className="flex items-center gap-3 rounded-xl border border-border-default/40 bg-surface-container-low px-3 py-2">
          {attachmentIcon(value.mimeType)}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-tx-primary">{value.originalName}</p>
            {value.description ? (
              <p className="whitespace-pre-wrap break-words text-xs text-tx-primary">{value.description}</p>
            ) : null}
            <p className="text-xs text-tx-secondary">{formatBytes(value.sizeBytes)}</p>
          </div>
          {!disabled ? (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="shrink-0 rounded p-1 text-tx-secondary hover:bg-error/10 hover:text-error"
              aria-label="Remover arquivo"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      ) : null}
      {value?.validationResult ? <LabelValidationPanel result={value.validationResult} /> : null}
      {!value && pending ? (
        <div className="grid gap-2">
          <PendingUploadList
            uploads={[pending]}
            requireLabel={requireLabel}
            showErrors={showLabelError}
            disabled={disabled || uploadMutation.isPending}
            onChange={(_id, patch) => setPending((current) => (current ? { ...current, ...patch } : current))}
            onRemove={() => {
              setPending(null);
              setShowLabelError(false);
            }}
          />
          <button
            type="button"
            disabled={disabled || uploadMutation.isPending}
            onClick={() => void sendPending()}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {uploadMutation.isPending ? 'Enviando...' : 'Enviar arquivo'}
          </button>
        </div>
      ) : null}
      {!value && !pending ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled || uploadMutation.isPending || preparing}
            onClick={() => inputRef.current?.click()}
            className="flex min-h-11 min-w-[10rem] flex-1 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-strong px-4 py-3 text-sm font-semibold text-tx-secondary hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {preparing ? 'Preparando...' : 'Enviar foto/arquivo'}
          </button>
          <CameraCaptureButton
            disabled={disabled || uploadMutation.isPending || preparing}
            onCapture={(file) => {
              void pickFile(file);
            }}
            className="flex min-h-11 min-w-[10rem] flex-1 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-strong px-4 py-3 text-sm font-semibold text-tx-secondary hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void pickFile(file);
          e.target.value = '';
        }}
      />
      {error ? (
        <p role="alert" className="text-xs font-semibold text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function PhaseApprovalBadge({ approval }: { approval: Approval | null }) {
  if (!approval) {
    return (
      <span className="inline-flex items-center rounded-full bg-surface-container px-2 py-0.5 text-xs font-bold text-tx-secondary">
        Aprovação não solicitada
      </span>
    );
  }
  if (approval.status === 'pending') {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
        Aguardando aprovação
      </span>
    );
  }
  if (approval.status === 'approved') {
    return (
      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
        Aprovado ✓
      </span>
    );
  }
  if (approval.status === 'rejected') {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
        Reprovado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-600">
      Cancelado
    </span>
  );
}

/**
 * Resumo somente-leitura do que já foi preenchido em OUTRAS fases (fotos, respostas,
 * quantidades) — sem isso, ao abrir uma fase sem campos próprios (ex.: "Produção"), tudo
 * que já foi enviado nas fases anteriores desaparecia de vista, mesmo continuando
 * acessível em "Ver solicitação".
 */
export function PhaseHistorySection({
  phases,
  values,
  attachments,
  currentPhaseId,
}: {
  phases: KanbanPhase[];
  values: PhaseFieldValue[];
  attachments: Attachment[];
  currentPhaseId: string | undefined;
}) {
  const attachmentsByPhaseId = new Map<string, Attachment[]>();
  for (const attachment of attachments) {
    if (!attachment.phaseId) continue;
    const list = attachmentsByPhaseId.get(attachment.phaseId) ?? [];
    list.push(attachment);
    attachmentsByPhaseId.set(attachment.phaseId, list);
  }

  const sections = phases
    .filter((p) => p.id !== currentPhaseId)
    .sort((a, b) => a.order - b.order)
    .map((p) => ({
      phase: p,
      fieldEntries: getPhaseFieldEntries(p, values),
      phaseAttachments: attachmentsByPhaseId.get(p.id) ?? [],
    }))
    .filter((section) => section.fieldEntries.length > 0 || section.phaseAttachments.length > 0);

  if (sections.length === 0) return null;

  return (
    <div className="mb-5 grid gap-3">
      <p className="text-xs font-bold uppercase tracking-wide text-tx-secondary">Histórico do processo</p>
      {sections.map(({ phase, fieldEntries, phaseAttachments }) => (
        <div key={phase.id} className="grid gap-2.5 rounded-xl border border-border-default/40 bg-surface-container-low p-3">
          <p className="text-xs font-bold uppercase text-tx-secondary">{phase.label}</p>
          {fieldEntries.map(({ field, value }) => (
            <p key={field.id} className="text-sm">
              <span className="text-tx-secondary">{field.label}: </span>
              <span className="font-medium text-tx-primary">{formatPhaseValue(value, field)}</span>
            </p>
          ))}
          {phaseAttachments.map((attachment) => (
            <AttachmentPreview key={attachment.id} attachment={attachment} />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Anexos vinculados à fase atual (ex.: a foto enviada no formulário que deu origem à
 * solicitação, já marcada com o phaseId desta fase por FlowsAttachmentListener). Sem
 * isso, uma fase sem campos próprios (ex.: "Preenchimento inicial", cuja foto é campo
 * do formulário, não campo de fase) nunca mostrava a foto nem a validação por IA —
 * justo o que o aprovador precisa ver para decidir.
 */
export function CurrentPhaseAttachments({
  attachments,
  currentPhaseId,
}: {
  attachments: Attachment[];
  currentPhaseId: string | undefined;
}) {
  const phaseAttachments = attachments.filter((a) => a.phaseId === currentPhaseId);
  if (!currentPhaseId || phaseAttachments.length === 0) return null;

  return (
    <div className="mb-5 grid gap-2.5">
      <p className="text-xs font-bold uppercase tracking-wide text-tx-secondary">Anexos desta fase</p>
      {phaseAttachments.map((attachment) => (
        <AttachmentPreview key={attachment.id} attachment={attachment} />
      ))}
    </div>
  );
}

export function PhaseFieldsModal({ card, onClose }: { card: KanbanCard; onClose: () => void }) {
  const brand = useBrand();
  const navigate = useNavigate();
  const { user, processesFullAccess, can } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const phasesQuery = useKanbanPhasesQuery(card.formId);
  const valuesQuery = useQuery({
    queryKey: queryKeys.solicitations.phaseFieldValues(card.id),
    queryFn: () => fetchPhaseFieldValues(card.id),
  });
  const approvalsQuery = useSolicitationApprovalsQuery(card.id);
  const myPendingQuery = useMyPendingApprovalsQuery();
  const decisionRef = useRef<HTMLDivElement>(null);
  const attachmentsQuery = useSolicitationAttachmentsQuery(card.id);
  const formAttachments = (attachmentsQuery.data ?? []).filter((a) => a.submissionId && !a.phaseId);
  const moveMutation = useMoveKanbanPhaseMutation(card.formId ?? undefined);
  const requestApprovalMutation = useRequestPhaseApprovalMutation(card.id);

  const [values, setValues] = useState<Record<string, PublicAnswerValue>>({});
  const [fileValues, setFileValues] = useState<Record<string, PhaseAttachmentValue | null>>({});
  const [saving, setSaving] = useState(false);
  const [showResponses, setShowResponses] = useState(false);
  // A tela de Solicitações saiu do menu: a solicitação abre aqui, por cima do card.
  const [showSolicitation, setShowSolicitation] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Uma solicitação sem `phaseId` ainda (antes do primeiro "mover para fase")
  // é tratada pelo board como estando na primeira fase do formulário — o
  // mesmo fallback usado pelo Kanban para agrupar o card na coluna inicial.
  const phase = phasesQuery.data?.find((p) => p.id === card.phaseId) ?? phasesQuery.data?.[0];

  // "Cálculo" da fase: prévia ao vivo com as respostas do formulário (mesma busca em duas etapas
  // do ResponseDetailModal, e mesmo cache). O valor gravado sai do backend ao salvar.
  const hasCalculated = Boolean(phase?.fields.some((field) => field.fieldType === 'calculated'));
  const solicitationQuery = useQuery({
    queryKey: queryKeys.solicitations.byId(card.id),
    queryFn: () => fetchSolicitationById(card.id),
    enabled: hasCalculated,
  });
  const submissionId = solicitationQuery.data?.submissionId ?? null;
  const responseQuery = useQuery({
    queryKey: queryKeys.responses.byId(submissionId ?? ''),
    queryFn: () => fetchResponseById(submissionId as string),
    enabled: hasCalculated && Boolean(submissionId),
  });
  const calculatedPreview = useMemo(
    () =>
      hasCalculated
        ? previewPhaseCalculations({
            phases: phasesQuery.data ?? [],
            savedValues: valuesQuery.data ?? [],
            editingValues: values,
            formAnswers: responseQuery.data?.items ?? [],
          })
        : {},
    [hasCalculated, phasesQuery.data, valuesQuery.data, values, responseQuery.data],
  );

  useEffect(() => {
    if (!valuesQuery.data || !phase) return;
    const nextValues: Record<string, PublicAnswerValue> = {};
    const nextFileValues: Record<string, PhaseAttachmentValue | null> = {};
    const fieldById = new Map(phase.fields.map((f) => [f.id, f]));
    for (const item of valuesQuery.data) {
      if (!item.phaseFieldId) continue;
      const field = fieldById.get(item.phaseFieldId);
      const input = toInputValue(item, field);
      if (field?.fieldType === 'file_upload') {
        nextFileValues[item.phaseFieldId] = isPhaseAttachmentValue(input) ? input : null;
      } else {
        nextValues[item.phaseFieldId] = input;
      }
    }
    setValues(nextValues);
    setFileValues(nextFileValues);
  }, [valuesQuery.data, phase]);

  // Ramificação no formulário da fase: só as seções do caminho, pelas respostas de agora. O que
  // fica fora não é mostrado, cobrado nem enviado (o backend apaga o valor antigo).
  const visibleFields = useMemo(() => {
    if (!phase) return [];
    const reachable = reachablePhaseFieldIds(phase, (field) =>
      field.fieldType === 'file_upload' ? fileValues[field.id] : values[field.id],
    );
    return phase.fields.filter((field) => reachable.has(field.id));
  }, [phase, values, fileValues]);

  // Só as aprovações desta passagem pela fase: card devolvido que volta precisa de aprovação nova
  // (mesma regra do backend ao mover).
  const enteredAt = card.phaseEnteredAt ? new Date(card.phaseEnteredAt).getTime() : 0;
  const phaseApprovals = (approvalsQuery.data ?? [])
    .filter((a) => a.phaseId === phase?.id && new Date(a.createdAt).getTime() >= enteredAt)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const latestPhaseApproval = phaseApprovals[0] ?? null;
  const isBlockedByApproval = Boolean(phase?.requiresApproval) && latestPhaseApproval?.status !== 'approved';
  // Travas de saída da fase (responsável e obrigatórios salvos): avisam antes; o backend confere.
  const exitHint = phase
    ? phaseExitHint(phaseExitBlockers(phase, valuesQuery.data ?? [], card.responsibleUserId))
    : null;
  // Ponto sem volta: quem configura as fases do processo ainda devolve o card; o backend confere.
  const canMoveBack = can('kanban_phases.manage', card.formId);
  const orderedPhases = [...(phasesQuery.data ?? [])].sort((a, b) => a.order - b.order);
  const currentPhaseIdForMove = phase?.id ?? null;
  const canRequestApproval =
    Boolean(phase?.requiresApproval) &&
    (!latestPhaseApproval || latestPhaseApproval.status === 'rejected' || latestPhaseApproval.status === 'cancelled');

  // Etapas que esperam a decisão de quem está vendo (por usuário ou perfil: a lista vem do
  // servidor). A da aprovação desta fase fica no bloco da fase; as demais (ex.: pedida por um
  // fluxo) aparecem logo acima dele.
  const myDecisions = (myPendingQuery.data ?? [])
    .filter((step) => step.approval.solicitationId === card.id && step.approval.status === 'pending')
    .map((step) => ({
      stepId: step.id,
      context: step.approval,
      approval: (approvalsQuery.data ?? []).find((a) => a.id === step.approval.id) ?? null,
    }));
  const phaseDecision =
    phase?.requiresApproval && latestPhaseApproval
      ? myDecisions.find((item) => item.context.id === latestPhaseApproval.id)
      : undefined;
  const otherDecisions = myDecisions.filter((item) => item !== phaseDecision);

  // Quem aprova a fase aprova ao mover o card para frente (o backend decide; aqui só o aviso).
  const approversOfPhase = phase ? phaseApprovers(phase) : null;
  const isPhaseApprover =
    !!approversOfPhase &&
    peopleCount(approversOfPhase) > 0 &&
    isPhasePerson(approversOfPhase, user ? { id: user.id, role: user.role } : null);
  // Trava de aprovação da fase vinda do servidor ao mover: pop-up para pedir a aprovação.
  const [approvalBlock, setApprovalBlock] = useState<PhaseApprovalBlock | null>(null);
  const titleId = useId();
  // Esc fecha o card, mas não enquanto salva nem com outro modal aberto por cima
  // (esses se registram na mesma pilha e fecham primeiro).
  useEscapeKey(onClose, !saving && !showResponses && !showSolicitation && !approvalBlock);

  // Perfis e/ou usuários escolhidos para atuar (fase antiga: o perfil único) — mesma regra do backend.
  const actors = phase ? phaseActors(phase) : null;
  const canActInPhase =
    !actors ||
    isPhasePerson(actors, user ? { id: user.id, role: user.role } : null) ||
    // Só o acesso total aos processos passa por cima de quem atua na fase (a mesma regra do backend).
    processesFullAccess;
  const actorsMessage =
    actors && actors.userIds.length === 0 && actors.roleCodes.length === 1
      ? `Apenas o perfil "${actors.roleCodes[0]}" pode preencher os campos desta fase.`
      : 'Apenas os perfis e usuários escolhidos para esta fase podem preencher os campos.';

  // Quem não pode preencher a fase (ex.: o supervisor aprovador) via os campos do operador
  // esmaecidos e desabilitados; o que importa pra ele é ler o que foi enviado (ex.: a
  // quantidade produzida), então mostramos o valor em destaque no lugar do formulário.
  const showReadOnlyValues =
    !canActInPhase && Boolean(phase) && getPhaseFieldEntries(phase as KanbanPhase, valuesQuery.data ?? []).length > 0;

  async function handleRequestApproval() {
    try {
      await requestApprovalMutation.mutateAsync();
      showToast({ title: 'Aprovação solicitada', variant: 'success' });
    } catch (error) {
      showToast({
        title: 'Não foi possível solicitar aprovação',
        description: getApiErrorMessage(error, 'Tente novamente em instantes.'),
        variant: 'error',
      });
    }
  }

  /**
   * Mesmas regras do formulário público (obrigatório, e-mail, CPF/CNPJ, limites) antes de enviar —
   * o backend confere os obrigatórios de novo. Título/descrição/divisor não têm resposta.
   */
  function validate(fields: KanbanPhaseField[]): Record<string, string> {
    const found: Record<string, string> = {};
    for (const field of fields) {
      if (field.fieldType === 'calculated') continue;
      const message =
        field.fieldType === 'file_upload'
          ? field.required && !fileValues[field.id]
            ? 'Este campo é obrigatório.'
            : null
          : validateFieldValue(toPublicField(field), values[field.id] ?? null);
      if (message) found[field.id] = message;
    }
    return found;
  }

  function clearError(fieldId: string) {
    setErrors((current) => {
      if (!(fieldId in current)) return current;
      const next = { ...current };
      delete next[fieldId];
      return next;
    });
  }

  async function handleSave() {
    if (!phase) return;
    const answerFields = visibleFields.filter((field) => !isPhaseLayoutType(field.fieldType));
    const found = validate(answerFields);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      showToast({ title: 'Revise os campos destacados', variant: 'error' });
      return;
    }
    setSaving(true);
    try {
      // Cálculo não vai: o backend refaz com o que está salvo.
      const items = answerFields.filter((field) => field.fieldType !== 'calculated').map((field) => {
        if (field.fieldType === 'file_upload') {
          return {
            phaseFieldId: field.id,
            fieldCode: field.code,
            valueJson: fileValues[field.id] ?? null,
          } satisfies SavePhaseFieldValueInput;
        }
        return toSaveInput(field, values[field.id] ?? null);
      });
      await savePhaseFieldValues(card.id, items);
      void queryClient.invalidateQueries({ queryKey: queryKeys.solicitations.phaseFieldValues(card.id) });
      showToast({ title: 'Campos salvos', variant: 'success' });
      onClose();
    } catch (error) {
      showToast({
        title: 'Erro ao salvar campos',
        description: getApiErrorMessage(error, 'Tente novamente em instantes.'),
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-[#071a38]/50 px-4 py-6"
      style={brandCssVars(brand)}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[88dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-[14px] bg-bg-surface shadow-2xl"
      >
        <header className="flex items-center justify-between gap-4 border-b border-border-default px-5 py-4">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-bold uppercase tracking-widest text-tx-secondary">
              {phase?.label ?? 'Fase'}
            </p>
            <h3 id={titleId} className="break-words text-lg font-bold leading-snug text-tx-primary">
              {card.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-bg-hover sm:h-9 sm:w-9"
          >
            <X className="h-5 w-5 text-tx-secondary" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {/* Atalhos dentro da área rolável: fixos no topo, no celular eles ocupavam um terço
              da altura útil e empurravam a foto/validação da IA para fora da tela. */}
          <div className="mb-5 flex flex-wrap items-center gap-2">
            {card.formId && (
              <button
                type="button"
                onClick={() => navigate(`/builder?formId=${card.formId}`)}
                className="inline-flex items-center gap-1.5 rounded-[8px] border border-border-default px-3 py-1.5 text-xs font-bold text-tx-secondary hover:border-primary hover:text-primary"
              >
                <FileText className="h-3.5 w-3.5" />
                Ver processo
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowSolicitation(true)}
              className="inline-flex items-center gap-1.5 rounded-[8px] border border-border-default px-3 py-1.5 text-xs font-bold text-tx-secondary hover:border-primary hover:text-primary"
            >
              <ClipboardList className="h-3.5 w-3.5" />
              Ver solicitação
            </button>
            {/* Quem vê o card abre as respostas que o originaram (o backend confere pelo card). */}
            {(
              <button
                type="button"
                onClick={() => setShowResponses(true)}
                className="inline-flex items-center gap-1.5 rounded-[8px] border border-border-default px-3 py-1.5 text-xs font-bold text-tx-secondary hover:border-primary hover:text-primary"
              >
                <ListChecks className="h-3.5 w-3.5" />
                Ver respostas
              </button>
            )}
          </div>

          {/* Quem aprova lê o card de cima a baixo; o aviso leva direto à decisão, mais abaixo. */}
          {myDecisions.length > 0 ? (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
              <span className="text-sm font-bold text-amber-800">Aguardando a sua aprovação</span>
              <button
                type="button"
                onClick={() => decisionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="rounded-[8px] bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:opacity-90"
              >
                Ir para a decisão
              </button>
            </div>
          ) : null}

          {/* De onde o card veio e para onde foi encaminhado (outro processo). */}
          <div className="mb-5 empty:hidden">
            <SolicitationHandoffLinks solicitationId={card.id} />
          </div>

          {/* Ficha de cada "Lista do ERP" respondida no formulário (ex.: o pedido). */}
          <div className="mb-5">
            <SolicitationErpDetails solicitationId={card.id} />
          </div>

          {/* Tempo em cada fase e prazo (com prorrogação para quem gerencia as fases). */}
          <div className="mb-5">
            <PhaseTimeline solicitationId={card.id} formId={card.formId} defaultOpen={Boolean(card.phaseSla)} />
          </div>

          {/* Arquivos do formulário de abertura sem fase; os que já têm fase aparecem nela, abaixo. */}
          {formAttachments.length > 0 ? (
            <div className="mb-5">
              <FormAttachmentsList attachments={formAttachments} />
            </div>
          ) : null}

          <PhaseHistorySection
            phases={phasesQuery.data ?? []}
            values={valuesQuery.data ?? []}
            attachments={attachmentsQuery.data ?? []}
            currentPhaseId={phase?.id}
          />

          <CurrentPhaseAttachments attachments={attachmentsQuery.data ?? []} currentPhaseId={phase?.id} />

          {showReadOnlyValues ? (
            <div className="mb-5">
              <PhaseFieldValuesSummary phase={phase} values={valuesQuery.data ?? []} />
            </div>
          ) : null}

          <div ref={decisionRef} className="scroll-mt-4">
            {otherDecisions.map((item) => (
              <div
                key={item.stepId}
                className="mb-4 grid gap-2.5 rounded-xl border border-amber-200 bg-surface-container-low px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase text-tx-secondary">Aprovação pendente</p>
                  <p className="break-words text-sm font-bold text-tx-primary">{item.context.title}</p>
                  {item.context.description ? (
                    <p className="mt-0.5 break-words text-xs text-tx-secondary">{item.context.description}</p>
                  ) : null}
                </div>
                {item.approval ? <ApprovalStepsList steps={item.approval.steps} /> : null}
                <PhaseApprovalDecision stepId={item.stepId} solicitationId={card.id} onDecided={onClose} />
              </div>
            ))}

            {phase?.requiresApproval ? (
              <div
                className={[
                  'mb-4 grid gap-2.5 rounded-xl border bg-surface-container-low px-3 py-2.5',
                  phaseDecision ? 'border-amber-200' : 'border-border-default/50',
                ].join(' ')}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold uppercase text-tx-secondary">Aprovação da fase</span>
                    <PhaseApprovalBadge approval={latestPhaseApproval} />
                  </div>
                  {canRequestApproval && canActInPhase ? (
                    <button
                      type="button"
                      onClick={() => void handleRequestApproval()}
                      disabled={requestApprovalMutation.isPending}
                      className="rounded-[8px] bg-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                    >
                      {requestApprovalMutation.isPending ? 'Solicitando...' : 'Solicitar aprovação'}
                    </button>
                  ) : null}
                </div>
                {latestPhaseApproval ? <ApprovalStepsList steps={latestPhaseApproval.steps} /> : null}
                {phaseDecision ? (
                  <PhaseApprovalDecision stepId={phaseDecision.stepId} solicitationId={card.id} onDecided={onClose} />
                ) : null}
              </div>
            ) : null}
          </div>

          {!canActInPhase ? (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-800">
              <Lock className="h-3.5 w-3.5 shrink-0" />
              {actorsMessage}
            </div>
          ) : null}

          {phasesQuery.data && phasesQuery.data.length > 1 ? (
            <div className="mb-5 grid gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wide text-tx-secondary">
                Mover para fase
              </label>
              <select
                value={card.phaseId ?? phase?.id ?? ''}
                onChange={(e) => {
                  const phaseId = e.target.value;
                  if (!phaseId || phaseId === card.phaseId) return;
                  moveMutation.mutate(
                    { id: card.id, phaseId },
                    {
                      onSuccess: () => onClose(),
                      onError: (error) => {
                        // Sem aprovação (e quem moveu não aprova a fase): pop-up para pedir a aprovação.
                        const block = phaseApprovalBlockOf(error);
                        if (block && block.code !== 'phase_approval_rejected') {
                          setApprovalBlock(block);
                          return;
                        }
                        showToast({
                          title: 'Não foi possível mover o card',
                          description: getApiErrorMessage(error, 'Tente novamente em instantes.'),
                          variant: 'error',
                        });
                      },
                    },
                  );
                }}
                className="h-11 rounded-[8px] border border-border-default bg-bg-s2 px-2 text-base text-tx-primary disabled:cursor-not-allowed disabled:opacity-60 sm:h-9 sm:text-sm"
              >
                {phasesQuery.data.map((p) => {
                  // Ponto sem volta: fase anterior a ele não é oferecida a quem não configura as fases.
                  const noReturn =
                    !canMoveBack && !!currentPhaseIdForMove && !!moveBackBarrier(orderedPhases, currentPhaseIdForMove, p.id);
                  return (
                    <option
                      key={p.id}
                      value={p.id}
                      disabled={(!!exitHint && !!phase && p.order > phase.order) || noReturn}
                    >
                      {p.label}
                      {noReturn ? ' (sem volta)' : ''}
                    </option>
                  );
                })}
              </select>
              {isBlockedByApproval ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {isPhaseApprover
                    ? 'Esta fase exige aprovação: como você aprova esta fase, mover o card para frente já o aprova.'
                    : 'Esta fase exige aprovação antes de avançar para a próxima.'}
                </p>
              ) : null}
              {exitHint ? (
                <p role="status" className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                  {exitHint}
                </p>
              ) : null}
            </div>
          ) : null}

          {showReadOnlyValues ? null : !phase || phase.fields.length === 0 ? (
            <p className="text-sm text-tx-secondary">Esta fase não tem campos configurados.</p>
          ) : (
            <div
              style={{
                ...themeAwareFieldVars,
                // Destaques (link "Adicionar item", seleção) legíveis no escuro, como na ficha do ERP.
                ['--tf-primary' as string]: `var(--tf-primary-on-dark, ${brand.colors.primary})`,
                // Fundo do destaque translúcido, para o texto em --tf-primary contrastar nos dois temas.
                ['--tf-primary-light' as string]: 'color-mix(in srgb, var(--tf-primary) 14%, transparent)',
              }}
              className={['grid grid-cols-1 gap-5', !canActInPhase ? 'pointer-events-none opacity-60' : ''].join(' ')}
            >
              {visibleFields.map((field) =>
                field.fieldType === 'file_upload' ? (
                  <PhaseFileField
                    key={field.id}
                    field={field}
                    value={fileValues[field.id] ?? null}
                    solicitationId={card.id}
                    phaseId={phase.id}
                    disabled={!canActInPhase}
                    error={errors[field.id]}
                    onChange={(next) => {
                      clearError(field.id);
                      setFileValues((current) => ({ ...current, [field.id]: next }));
                    }}
                  />
                ) : (
                  <PublicQuestionField
                    key={field.id}
                    field={toPublicField(field)}
                    value={
                      field.fieldType === 'calculated'
                        ? (calculatedPreview[field.id] ?? null)
                        : (values[field.id] ?? null)
                    }
                    error={errors[field.id]}
                    onChange={(value) => {
                      clearError(field.id);
                      setValues((current) => ({ ...current, [field.id]: value }));
                    }}
                    onToggleMulti={(optionValue, checked) => {
                      clearError(field.id);
                      const current = Array.isArray(values[field.id]) ? (values[field.id] as string[]) : [];
                      setValues((prev) => ({
                        ...prev,
                        [field.id]: checked
                          ? [...current, optionValue]
                          : current.filter((item) => item !== optionValue),
                      }));
                    }}
                  />
                ),
              )}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-border-default px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-[8px] px-4 text-sm font-bold text-tx-secondary hover:bg-bg-hover sm:h-10"
          >
            Fechar
          </button>
          {phase && phase.fields.length > 0 && canActInPhase ? (
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="h-11 rounded-[8px] bg-primary px-4 text-sm font-bold text-white disabled:opacity-60 sm:h-10"
            >
              {saving ? 'Salvando...' : 'Salvar campos'}
            </button>
          ) : null}
        </footer>
      </section>

      {showResponses ? (
        <ResponseDetailModal
          solicitationId={card.id}
          formId={card.formId}
          onClose={() => setShowResponses(false)}
        />
      ) : null}

      {showSolicitation ? (
        <SolicitationDetailModal solicitationId={card.id} onClose={() => setShowSolicitation(false)} />
      ) : null}

      {approvalBlock ? (
        <PhaseApprovalBlockDialog
          block={approvalBlock}
          solicitationId={card.id}
          cardTitle={card.title}
          onClose={() => setApprovalBlock(null)}
        />
      ) : null}
    </div>
  );
}
