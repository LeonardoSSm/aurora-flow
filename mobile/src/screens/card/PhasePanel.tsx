import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { apiErrorMessage } from '../../api/client';
import {
  useAttachments,
  useMovePhase,
  useMyPendingApprovals,
  usePhaseValues,
  useRequestPhaseApproval,
  useResponse,
  useSavePhaseValues,
  useSolicitationApprovals,
  useUploadAttachment,
} from '../../api/queries';
import type { KanbanPhase, KanbanPhaseField, Solicitation } from '../../api/types';
import { ApprovalStatusBadge, ApprovalStepsList, DecisionButtons } from '../../components/ApprovalBlocks';
import { ResponseValueView } from '../../components/ResponseValueView';
import { useAuth } from '../../context/auth-context';
import { FieldControl } from '../../fields/FieldControl';
import { AttachmentRow, isPhaseAttachmentValue, LabelValidationPanel, PhaseFileField, type PhaseAttachmentValue } from '../../fields/FileFields';
import {
  actorsMessage,
  currentPhaseApprovals,
  describeApprovers,
  isPhasePerson,
  moveBackBarrier,
  moveBackMessage,
  peopleCount,
  phaseActors,
  phaseApprovalBlockOf,
  phaseApprovers,
  phaseCalculatedSettings,
  phaseExitBlockers,
  phaseExitHint,
  PHASE_LAYOUT_TYPES,
  previewPhaseCalculations,
  reachablePhaseFieldIds,
  type PhaseApprovalBlock,
} from '../../domain/phase-rules';
import { phaseFieldModel, phaseValueRows, toInputValue, toSaveInput } from '../../domain/phase-values';
import { validateFieldValue } from '../../domain/form-runtime';
import { Badge, Button, Card, Notice, SectionHeader, Txt } from '../../ui/primitives';
import { Sheet, SheetOption } from '../../ui/sheet';
import { phaseColor, spacing, useTheme } from '../../ui/theme';
import { useToast } from '../../ui/toast';

type Props = {
  solicitation: Solicitation;
  phases: KanbanPhase[];
  /** Registra o "Salvar" e o "Mover" no rodapé fixo da tela do card. */
  onFooter: (footer: React.ReactNode) => void;
  focusDecision?: boolean;
};

export function PhasePanel({ solicitation, phases, onFooter }: Props) {
  const { colors, isDark } = useTheme();
  const toast = useToast();
  const { user, can, processesFullAccess } = useAuth();
  const id = solicitation.id;
  const valuesQuery = usePhaseValues(id);
  const approvalsQuery = useSolicitationApprovals(id);
  const myPending = useMyPendingApprovals();
  const attachments = useAttachments(id);
  const save = useSavePhaseValues(id);
  const move = useMovePhase(id);
  const requestApproval = useRequestPhaseApproval(id);
  const upload = useUploadAttachment(id);

  const ordered = useMemo(() => [...phases].sort((a, b) => a.order - b.order), [phases]);
  // O pai só monta o painel com fases carregadas. Sem fase ainda (antes do primeiro mover), vale a primeira.
  const phase = (ordered.find((p) => p.id === solicitation.currentPhaseId) ?? ordered[0]) as KanbanPhase;
  const formId = solicitation.formId;

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [block, setBlock] = useState<PhaseApprovalBlock | null>(null);

  // Valores salvos → estado de edição (ao abrir e depois de salvar).
  useEffect(() => {
    if (!valuesQuery.data || !phase) return;
    const byId = new Map(phase.fields.map((f) => [f.id, f]));
    const next: Record<string, unknown> = {};
    for (const item of valuesQuery.data) {
      if (!item.phaseFieldId) continue;
      const field = byId.get(item.phaseFieldId);
      if (!field) continue;
      const input = toInputValue(item, field);
      next[item.phaseFieldId] = field.fieldType === 'file_upload' ? (isPhaseAttachmentValue(input) ? input : null) : input;
    }
    setValues(next);
    setDirty(false);
    setErrors({});
  }, [valuesQuery.data, phase]);

  // "Cálculo" da fase: prévia com as respostas do formulário (o gravado sai do backend ao salvar).
  const hasCalculated = Boolean(phase?.fields.some((f) => f.fieldType === 'calculated'));
  const response = useResponse(solicitation.submissionId, hasCalculated);
  const calculated = useMemo(
    () =>
      hasCalculated
        ? previewPhaseCalculations({
            phases: ordered,
            savedValues: valuesQuery.data ?? [],
            editingValues: values,
            formAnswers: response.data?.items ?? [],
          })
        : {},
    [hasCalculated, ordered, valuesQuery.data, values, response.data],
  );

  const visibleFields = useMemo(() => {
    if (!phase) return [];
    const reachable = reachablePhaseFieldIds(phase, (field) => values[field.id]);
    return [...phase.fields].sort((a, b) => a.order - b.order).filter((field) => reachable.has(field.id));
  }, [phase, values]);

  // ── Quem pode o quê ─────────────────────────────────────────────────────
  const actors = phaseActors(phase);
  const canActInPhase = isPhasePerson(actors, user) || processesFullAccess;
  const canMove = can('solicitations.act', formId);
  const canMoveBack = can('kanban_phases.manage', formId);
  const approvers = phaseApprovers(phase);
  const isPhaseApprover = peopleCount(approvers) > 0 && isPhasePerson(approvers, user);

  // ── Aprovações ──────────────────────────────────────────────────────────
  const phaseApprovals = currentPhaseApprovals(approvalsQuery.data ?? [], phase.id, solicitation.phaseEnteredAt);
  const latest = phaseApprovals[0] ?? null;
  const isBlockedByApproval = phase.requiresApproval && latest?.status !== 'approved';
  const canRequest = phase.requiresApproval && (!latest || latest.status === 'rejected' || latest.status === 'cancelled');
  const myDecisions = (myPending.data ?? [])
    .filter((step) => step.approval.solicitationId === id && step.approval.status === 'pending')
    .map((step) => ({ stepId: step.id, context: step.approval, approval: (approvalsQuery.data ?? []).find((a) => a.id === step.approval.id) ?? null }));
  const phaseDecision = phase.requiresApproval && latest ? myDecisions.find((d) => d.context.id === latest.id) : undefined;
  const otherDecisions = myDecisions.filter((d) => d !== phaseDecision);

  // ── Travas de saída ─────────────────────────────────────────────────────
  const exitHint = phaseExitHint(phaseExitBlockers(phase, valuesQuery.data ?? [], solicitation.assigneeId));
  const readOnlyRows = !canActInPhase ? phaseValueRows(phase, valuesQuery.data ?? []) : [];
  const phaseAttachments = (attachments.data ?? []).filter((a) => a.phaseId === phase.id);
  const fileFieldAttachmentIds = new Set(
    Object.values(values).filter(isPhaseAttachmentValue).map((v) => (v as PhaseAttachmentValue).attachmentId),
  );
  const looseAttachments = phaseAttachments.filter((a) => !fileFieldAttachmentIds.has(a.id));
  const hasEditableFields = phase.fields.some((f) => !PHASE_LAYOUT_TYPES.has(f.fieldType) && f.fieldType !== 'calculated');

  function setValue(field: KanbanPhaseField, next: unknown) {
    setValues((current) => ({ ...current, [field.id]: next }));
    setDirty(true);
    setErrors((current) => {
      if (!(field.id in current)) return current;
      const copy = { ...current };
      delete copy[field.id];
      return copy;
    });
  }

  async function handleSave(): Promise<boolean> {
    if (!phase) return false;
    const answerFields = visibleFields.filter((f) => !PHASE_LAYOUT_TYPES.has(f.fieldType));
    const found: Record<string, string> = {};
    for (const field of answerFields) {
      if (field.fieldType === 'calculated') continue;
      const message =
        field.fieldType === 'file_upload'
          ? field.required && !isPhaseAttachmentValue(values[field.id])
            ? 'Este campo é obrigatório.'
            : null
          : validateFieldValue(
              {
                id: field.id,
                code: field.code,
                label: field.label,
                fieldType: field.fieldType,
                required: field.required,
                order: field.order,
                settingsJson: field.settingsJson,
                conditionsJson: null,
                options: (field.optionsJson ?? []).map((o, i) => ({ id: `${i}`, internalValue: o.value, displayLabel: o.label, order: i })),
              },
              (values[field.id] ?? null) as never,
            );
      if (message) found[field.id] = message;
    }
    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast({ title: 'Revise os campos destacados', variant: 'error' });
      return false;
    }
    try {
      await save.mutateAsync(
        answerFields.filter((f) => f.fieldType !== 'calculated').map((field) => toSaveInput(field, values[field.id] ?? null)),
      );
      toast({ title: 'Campos salvos' });
      setDirty(false);
      return true;
    } catch (error) {
      toast({ title: 'Não foi possível salvar', description: apiErrorMessage(error, 'Tente de novo.'), variant: 'error' });
      return false;
    }
  }

  async function handleMove(targetId: string) {
    setMoveOpen(false);
    if (dirty) {
      const saved = await handleSave();
      if (!saved) return;
    }
    try {
      await move.mutateAsync(targetId);
      const target = ordered.find((p) => p.id === targetId);
      toast({ title: `Movido para "${target?.label ?? 'fase'}"` });
    } catch (error) {
      const approvalBlock = phaseApprovalBlockOf(error);
      if (approvalBlock && approvalBlock.code !== 'phase_approval_rejected') {
        setBlock(approvalBlock);
        return;
      }
      toast({ title: 'Não foi possível mover o card', description: apiErrorMessage(error, 'Tente de novo.'), variant: 'error' });
    }
  }

  async function handleRequestApproval() {
    try {
      await requestApproval.mutateAsync();
      setBlock(null);
      toast({ title: 'Aprovação solicitada', description: 'Quem aprova a fase foi avisado.' });
    } catch (error) {
      toast({ title: 'Não foi possível pedir a aprovação', description: apiErrorMessage(error, 'Tente de novo.'), variant: 'error' });
    }
  }

  const index = ordered.findIndex((p) => p.id === phase.id);
  const nextPhase = ordered[index + 1];

  // Rodapé fixo: salvar (se tem campo) e mover/avançar. Os botões chamam a versão atual das funções
  // (o rodapé só é trocado quando muda o que ele mostra).
  const handlers = useRef({ save: handleSave });
  handlers.current = { save: handleSave };
  const footer = (
    <>
      {canActInPhase && hasEditableFields ? (
        <Button
          label={dirty ? 'Salvar' : 'Salvo'}
          icon="save"
          variant={dirty ? 'primary' : 'outline'}
          disabled={!dirty}
          loading={save.isPending}
          onPress={() => void handlers.current.save()}
          style={{ flex: 1 }}
        />
      ) : null}
      {canMove && ordered.length > 1 ? (
        nextPhase && !phase.isTerminal ? (
          <Button
            label="Avançar"
            iconRight="arrow-right"
            variant={canActInPhase && hasEditableFields ? 'success' : 'primary'}
            loading={move.isPending}
            onPress={() => setMoveOpen(true)}
            style={{ flex: 1 }}
          />
        ) : (
          <Button label="Mover" icon="shuffle" variant="outline" loading={move.isPending} onPress={() => setMoveOpen(true)} style={{ flex: 1 }} />
        )
      ) : null}
    </>
  );
  useFooter(onFooter, footer, [dirty, save.isPending, move.isPending, canActInPhase, canMove, phase.id, hasEditableFields]);

  return (
    <View style={{ gap: spacing.lg }}>
      {/* Fase atual e progresso no processo */}
      <PhaseProgress phases={ordered} currentId={phase.id} />

      {otherDecisions.map((item) => (
        <Card key={item.stepId} accent="#F59E0B" style={{ gap: spacing.md }}>
          <Txt variant="overline" color={colors.warning}>
            Aguardando a sua aprovação
          </Txt>
          <Txt variant="bodyStrong">{item.context.title}</Txt>
          {item.context.description ? (
            <Txt variant="small" color={colors.textSecondary}>
              {item.context.description}
            </Txt>
          ) : null}
          {item.approval?.steps ? <ApprovalStepsList steps={item.approval.steps} /> : null}
          <DecisionButtons stepId={item.stepId} solicitationId={id} />
        </Card>
      ))}

      {phase.requiresApproval ? (
        <Card accent={phaseDecision ? '#F59E0B' : undefined} style={{ gap: spacing.md }}>
          <View style={styles.rowBetween}>
            <Txt variant="overline" color={colors.textMuted}>
              Aprovação da fase
            </Txt>
            <ApprovalStatusBadge approval={latest} />
          </View>
          {latest?.steps ? <ApprovalStepsList steps={latest.steps} /> : null}
          {phaseDecision ? (
            <>
              <Txt variant="smallStrong" color={colors.warning}>
                Você aprova esta fase.
              </Txt>
              <DecisionButtons stepId={phaseDecision.stepId} solicitationId={id} />
            </>
          ) : null}
          {canRequest && canActInPhase ? (
            <Button
              label="Pedir aprovação"
              icon="send"
              variant="secondary"
              loading={requestApproval.isPending}
              onPress={() => void handleRequestApproval()}
            />
          ) : null}
          {isBlockedByApproval && !phaseDecision ? (
            <Txt variant="caption" color={colors.textMuted}>
              {latest?.status === 'rejected'
                ? 'A aprovação foi reprovada: o card só pode voltar para uma fase anterior.'
                : isPhaseApprover
                  ? 'Como você aprova esta fase, avançar o card já o aprova.'
                  : 'Esta fase precisa de aprovação antes de avançar.'}
            </Txt>
          ) : null}
        </Card>
      ) : null}

      {exitHint ? <Notice tone="warning" icon="lock" title="O que falta para avançar" text={exitHint} /> : null}
      {!canActInPhase ? <Notice tone="neutral" icon="eye" text={actorsMessage(actors)} /> : null}

      {looseAttachments.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <SectionHeader title="Anexos desta fase" style={{ marginTop: 0 }} />
          {looseAttachments.map((attachment) => (
            <View key={attachment.id} style={{ gap: spacing.sm }}>
              <AttachmentRow attachment={attachment} />
              {attachment.validationResult ? <LabelValidationPanel result={attachment.validationResult} /> : null}
            </View>
          ))}
        </View>
      ) : null}

      {readOnlyRows.length > 0 ? (
        <Card style={{ gap: spacing.md }}>
          <Txt variant="overline" color={colors.textMuted}>
            Preenchido nesta fase
          </Txt>
          {readOnlyRows.map((row) => (
            <View key={row.id} style={{ gap: 4 }}>
              <Txt variant="caption" color={colors.textMuted}>
                {row.label}
              </Txt>
              <ResponseValueView ui={row.ui} />
            </View>
          ))}
        </Card>
      ) : null}

      {canActInPhase ? (
        visibleFields.length === 0 ? (
          <Card>
            <Txt variant="small" color={colors.textMuted}>
              Esta fase não tem campos para preencher.
            </Txt>
          </Card>
        ) : (
          <Card style={{ gap: spacing.xl }}>
            {visibleFields.map((field) =>
              field.fieldType === 'file_upload' ? (
                <PhaseFileField
                  key={field.id}
                  label={field.label}
                  required={field.required}
                  settings={field.settingsJson ?? {}}
                  value={isPhaseAttachmentValue(values[field.id]) ? (values[field.id] as PhaseAttachmentValue) : null}
                  onChange={(next) => setValue(field, next)}
                  upload={(file, label) => upload.mutateAsync({ file, label, phaseId: phase.id })}
                  error={errors[field.id]}
                />
              ) : (
                <FieldControl
                  key={field.id}
                  field={phaseFieldModel(field)}
                  value={values[field.id] ?? null}
                  onChange={(next) => setValue(field, next)}
                  error={errors[field.id]}
                  calculated={calculated[field.id] ?? null}
                  calculatedSettings={field.fieldType === 'calculated' ? phaseCalculatedSettings(field.settingsJson) : undefined}
                />
              ),
            )}
          </Card>
        )
      ) : null}

      <PreviousPhases phases={ordered} currentIndex={index} values={valuesQuery.data ?? []} />

      {/* Mover para outra fase */}
      <Sheet visible={moveOpen} onClose={() => setMoveOpen(false)} title="Mover card" subtitle={`Está em "${phase.label}"`}>
        {exitHint ? (
          <View style={{ marginBottom: spacing.sm }}>
            <Notice tone="warning" icon="lock" text={exitHint} />
          </View>
        ) : null}
        {dirty ? (
          <View style={{ marginBottom: spacing.sm }}>
            <Notice tone="info" icon="save" text="Os campos alterados serão salvos antes de mover." />
          </View>
        ) : null}
        {ordered.map((target) => {
          const isCurrent = target.id === phase.id;
          const forward = target.order > phase.order;
          const barrier = !canMoveBack ? moveBackBarrier(ordered, phase.id, target.id) : null;
          // Reprovada: o servidor só deixa voltar. Travas de saída: resolve antes.
          const rejected = forward && phase.requiresApproval && latest?.status === 'rejected';
          const blockedForward = forward && (Boolean(exitHint) || rejected);
          return (
            <SheetOption
              key={target.id}
              label={target.label}
              tone={phaseColor(target.color, isDark)}
              selected={isCurrent}
              disabled={isCurrent || Boolean(barrier) || blockedForward}
              description={
                barrier
                  ? 'Sem volta: o card já passou por um ponto sem volta.'
                  : rejected
                    ? 'A aprovação desta fase foi reprovada: o card só pode voltar.'
                    : blockedForward
                      ? 'Resolva o que falta antes de avançar.'
                    : forward && target.id === nextPhase?.id && isBlockedByApproval
                      ? isPhaseApprover
                        ? 'Avançar aprova a fase.'
                        : 'Precisa de aprovação.'
                      : target.isTerminal
                        ? 'Encerra o card'
                        : undefined
              }
              onPress={() => void handleMove(target.id)}
            />
          );
        })}
        {!canMoveBack && ordered.some((p) => p.blockMoveBack) ? (
          <Txt variant="caption" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
            {moveBackMessage({ label: ordered.find((p) => p.blockMoveBack && p.order <= phase.order)?.label ?? 'ponto sem volta' })}
          </Txt>
        ) : null}
      </Sheet>

      {/* Trava de aprovação vinda do servidor ao mover */}
      <Sheet visible={block !== null} onClose={() => setBlock(null)} title="Esta fase precisa de aprovação">
        {block ? (
          <View style={{ gap: spacing.md }}>
            <Txt variant="body">{block.message}</Txt>
            {block.approvers.length > 0 ? (
              <Txt variant="small" color={colors.textMuted}>
                Quem aprova: {describeApprovers(block.approvers)}.
              </Txt>
            ) : null}
            {block.canRequest ? (
              <Button
                label="Pedir aprovação agora"
                icon="send"
                loading={requestApproval.isPending}
                onPress={() => void handleRequestApproval()}
              />
            ) : (
              <Button label="Entendi" variant="outline" onPress={() => setBlock(null)} />
            )}
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

/** O rodapé mora na tela do card (fica fixo por cima da rolagem); o painel só diz o que vai nele. */
function useFooter(onFooter: (node: React.ReactNode) => void, node: React.ReactNode, deps: unknown[]) {
  useEffect(() => {
    onFooter(node);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => () => onFooter(null), [onFooter]);
}

/** Trilha das fases: onde o card está e quantas faltam. */
function PhaseProgress({ phases, currentId }: { phases: KanbanPhase[]; currentId: string }) {
  const { colors, isDark } = useTheme();
  const index = phases.findIndex((p) => p.id === currentId);
  const current = phases[index];
  return (
    <Card style={{ gap: spacing.md }}>
      <View style={styles.rowBetween}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="overline" color={colors.textMuted}>
            Fase {index + 1} de {phases.length}
          </Txt>
          <Txt variant="heading">{current?.label}</Txt>
        </View>
        {current?.isTerminal ? <Badge label="Final" tone="success" icon="flag" /> : null}
        {current?.blockMoveBack ? <Badge label="Sem volta" tone="purple" icon="lock" size="sm" /> : null}
      </View>
      <View style={styles.track}>
        {phases.map((p, i) => (
          <View
            key={p.id}
            accessibilityElementsHidden
            style={[
              styles.trackStep,
              { backgroundColor: i <= index ? phaseColor(current?.color, isDark) : colors.divider },
            ]}
          />
        ))}
      </View>
      {current?.description ? (
        <Txt variant="small" color={colors.textSecondary}>
          {current.description}
        </Txt>
      ) : null}
    </Card>
  );
}

/** O que foi preenchido nas fases anteriores (fechado; abre ao tocar). */
function PreviousPhases({
  phases,
  currentIndex,
  values,
}: {
  phases: KanbanPhase[];
  currentIndex: number;
  values: Parameters<typeof phaseValueRows>[1];
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState<string | null>(null);
  const previous = phases
    .map((phase, i) => ({ phase, i, rows: phaseValueRows(phase, values) }))
    .filter((entry) => entry.i !== currentIndex && entry.rows.length > 0);
  if (previous.length === 0) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      <SectionHeader title="Preenchido em outras fases" style={{ marginTop: spacing.sm }} />
      {previous.map(({ phase, rows }) => {
        const isOpen = open === phase.id;
        return (
          <Card key={phase.id} padded={false}>
            <Button
              label={`${phase.label} · ${rows.length} ${rows.length === 1 ? 'campo' : 'campos'}`}
              variant="ghost"
              iconRight={isOpen ? 'chevron-up' : 'chevron-down'}
              onPress={() => setOpen(isOpen ? null : phase.id)}
              style={styles.accordion}
            />
            {isOpen ? (
              <View style={styles.accordionBody}>
                {rows.map((row) => (
                  <View key={row.id} style={{ gap: 4 }}>
                    <Txt variant="caption" color={colors.textMuted}>
                      {row.label}
                    </Txt>
                    <ResponseValueView ui={row.ui} />
                  </View>
                ))}
              </View>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  track: { flexDirection: 'row', gap: 4 },
  trackStep: { flex: 1, height: 6, borderRadius: 3 },
  accordion: { justifyContent: 'space-between', borderWidth: 0, paddingHorizontal: spacing.lg, minHeight: 52 },
  accordionBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
});
