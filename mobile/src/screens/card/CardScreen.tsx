import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { apiErrorMessage, isForbidden } from '../../api/client';
import { moveStage } from '../../api/endpoints';
import {
  invalidateSolicitation,
  useAssignableUsers,
  useAttachments,
  useComments,
  useMyPendingApprovals,
  usePhases,
  useSolicitation,
  useUpdateAssignee,
  useUpdatePriority,
} from '../../api/queries';
import type { KanbanDefaultStage, Solicitation, SolicitationPriority } from '../../api/types';
import { useAuth } from '../../context/auth-context';
import { formatDate, formatDateTime, priorityMeta, shortCode, slaMeta, statusMeta } from '../../domain/format';
import type { RootScreenProps } from '../../navigation/types';
import { Segmented } from '../../ui/inputs';
import { KeyboardScreen, ScreenHeader, ScreenScroll, StickyFooter, STICKY_FOOTER_HEIGHT } from '../../ui/layout';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, InfoRow, LoadingBlock, Txt } from '../../ui/primitives';
import { Sheet, SheetOption } from '../../ui/sheet';
import { makeStyles, spacing, useTheme } from '../../ui/theme';
import { useToast } from '../../ui/toast';
import { useQueryClient } from '@tanstack/react-query';
import { ActivityPanel } from './ActivityPanel';
import { AttachmentsPanel } from './AttachmentsPanel';
import { ApprovalOnlyView } from './ApprovalOnlyView';
import { PhasePanel } from './PhasePanel';
import { ResponsesPanel } from './ResponsesPanel';
import { DecisionButtons, ApprovalStepsList } from '../../components/ApprovalBlocks';

type Tab = 'phase' | 'responses' | 'activity' | 'files';

/**
 * O card: tudo de uma solicitação numa tela, como o modal do card no web — a fase (campos, travas,
 * mover, aprovar), as respostas do formulário, a conversa/histórico e os arquivos.
 */
export default function CardScreen({ route }: RootScreenProps<'Card'>) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { solicitationId, title } = route.params;
  const detail = useSolicitation(solicitationId);
  const solicitation = detail.data;
  const phases = usePhases(solicitation?.formId);
  const attachments = useAttachments(solicitationId);
  const comments = useComments(solicitationId);
  const myPending = useMyPendingApprovals();
  const [tab, setTab] = useState<Tab>('phase');
  const [footer, setFooter] = useState<React.ReactNode>(null);
  const onFooter = useCallback((node: React.ReactNode) => setFooter(node), []);

  const phaseLabels = useMemo(
    () => Object.fromEntries((phases.data ?? []).map((p) => [p.id, p.label])),
    [phases.data],
  );
  const currentPhase = (phases.data ?? []).find((p) => p.id === solicitation?.currentPhaseId) ?? [...(phases.data ?? [])].sort((a, b) => a.order - b.order)[0];
  const hasPhases = (phases.data?.length ?? 0) > 0;
  const showFooter = tab === 'phase' && hasPhases && footer;

  function refresh() {
    void detail.refetch();
    void phases.refetch();
    void attachments.refetch();
    void comments.refetch();
  }

  if (detail.isLoading) {
    return (
      <KeyboardScreen>
        <ScreenHeader back title={title ?? 'Card'} />
        <LoadingBlock label="Abrindo o card…" />
      </KeyboardScreen>
    );
  }
  if (!solicitation) {
    const step = (myPending.data ?? []).find((s) => s.approval.solicitationId === solicitationId);
    return (
      <KeyboardScreen>
        <ScreenHeader back title={title ?? 'Card'} />
        {isForbidden(detail.error) && step ? (
          <ApprovalOnlyView approvalId={step.approval.id} stepId={step.id} />
        ) : isForbidden(detail.error) ? (
          <EmptyState icon="lock" title="Sem acesso a este card" text="Ele pertence a um processo ao qual você não tem acesso." />
        ) : (
          <ErrorState onRetry={() => void detail.refetch()} />
        )}
      </KeyboardScreen>
    );
  }

  const status = statusMeta(solicitation.status);
  const attachmentCount = attachments.data?.length ?? 0;
  const commentCount = comments.data?.length ?? 0;
  const formName = solicitation.form?.name ?? solicitation.form?.title ?? null;

  return (
    <KeyboardScreen>
      <ScreenHeader back overline={formName ?? 'Sem processo'} title={solicitation.title} />
      <View style={styles.strip}>
        <View style={styles.badges}>
          {currentPhase ? (
            <Badge label={currentPhase.label} tone="brand" dot />
          ) : (
            <Badge label={status.label} tone={status.tone} />
          )}
          <Txt variant="caption" color={colors.textMuted} style={styles.code}>
            {shortCode(solicitation.id)}
          </Txt>
        </View>
        <Segmented
          items={[
            { value: 'phase', label: hasPhases ? 'Fase' : 'Resumo' },
            { value: 'responses', label: 'Respostas' },
            { value: 'activity', label: commentCount ? `Atividade ${commentCount}` : 'Atividade' },
            { value: 'files', label: attachmentCount ? `Arquivos ${attachmentCount}` : 'Arquivos' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      <ScreenScroll
        refreshing={detail.isRefetching}
        onRefresh={refresh}
        footerSpace={showFooter ? STICKY_FOOTER_HEIGHT : 0}
      >
        {tab === 'phase' ? (
          <View style={{ gap: spacing.lg }}>
            <PendingDecisionBanner solicitation={solicitation} hasPhases={hasPhases} />
            {phases.isLoading && solicitation.formId ? (
              <LoadingBlock />
            ) : hasPhases ? (
              <PhasePanel solicitation={solicitation} phases={phases.data!} onFooter={onFooter} />
            ) : (
              <StageCard solicitation={solicitation} />
            )}
            <DetailsCard solicitation={solicitation} />
          </View>
        ) : tab === 'responses' ? (
          <ResponsesPanel solicitation={solicitation} />
        ) : tab === 'activity' ? (
          <ActivityPanel solicitation={solicitation} />
        ) : (
          <AttachmentsPanel solicitation={solicitation} phaseLabels={phaseLabels} />
        )}
      </ScreenScroll>

      {showFooter ? <StickyFooter>{footer}</StickyFooter> : null}
    </KeyboardScreen>
  );
}

/**
 * Aprovação esperando a pessoa num card sem fases (pedida por um fluxo): sem o painel da fase, a
 * decisão fica aqui. Com fases, o painel da fase já mostra todas.
 */
function PendingDecisionBanner({ solicitation, hasPhases }: { solicitation: Solicitation; hasPhases: boolean }) {
  const { colors } = useTheme();
  const pending = useMyPendingApprovals();
  if (hasPhases) return null;
  const mine = (pending.data ?? []).filter((step) => step.approval.solicitationId === solicitation.id && step.approval.status === 'pending');
  if (mine.length === 0) return null;
  return (
    <>
      {mine.map((step) => (
        <Card key={step.id} accent="#F59E0B" style={{ gap: spacing.md }}>
          <Txt variant="overline" color={colors.warning}>
            Aguardando a sua aprovação
          </Txt>
          <Txt variant="bodyStrong">{step.approval.title}</Txt>
          {step.approval.description ? (
            <Txt variant="small" color={colors.textSecondary}>
              {step.approval.description}
            </Txt>
          ) : null}
          {step.approval.steps ? <ApprovalStepsList steps={step.approval.steps} /> : null}
          <DecisionButtons stepId={step.id} solicitationId={solicitation.id} />
        </Card>
      ))}
    </>
  );
}

const PRIORITIES: SolicitationPriority[] = ['urgent', 'high', 'medium', 'low'];

/** Responsável, prioridade, solicitante e prazos — com troca rápida para quem atua no processo. */
function DetailsCard({ solicitation }: { solicitation: Solicitation }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const toast = useToast();
  const { can, user } = useAuth();
  const canAct = solicitation.formId ? can('solicitations.act', solicitation.formId) : can('solicitations.manage');
  const [assignOpen, setAssignOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const users = useAssignableUsers(assignOpen);
  const assign = useUpdateAssignee(solicitation.id);
  const priority = useUpdatePriority(solicitation.id);
  const pMeta = priorityMeta(solicitation.priority);
  const sla = slaMeta(solicitation.slaStatus);
  const requester =
    solicitation.createdByUser?.fullName ??
    solicitation.requesterContact?.name ??
    solicitation.submission?.responderName ??
    null;

  function changeAssignee(id: string | null) {
    setAssignOpen(false);
    assign.mutate(id, {
      onSuccess: () => toast({ title: id ? 'Responsável atribuído' : 'Responsável removido' }),
      onError: (error) => toast({ title: 'Não foi possível atribuir', description: apiErrorMessage(error, ''), variant: 'error' }),
    });
  }

  return (
    <Card style={{ paddingVertical: spacing.xs }}>
      <InfoRow label="Responsável" icon="user">
        <View style={styles.inlineEnd}>
          {solicitation.assignee ? <Avatar name={solicitation.assignee.fullName} size={22} /> : null}
          <Txt variant="smallStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
            {solicitation.assignee?.fullName ?? 'Ninguém'}
          </Txt>
          {canAct ? (
            <Button label={solicitation.assignee ? 'Trocar' : 'Atribuir'} size="sm" variant="ghost" loading={assign.isPending} onPress={() => setAssignOpen(true)} />
          ) : null}
        </View>
      </InfoRow>
      <InfoRow label="Prioridade" icon="flag">
        <View style={styles.inlineEnd}>
          <Badge label={pMeta.label} tone={pMeta.tone} />
          {canAct ? <Button label="Mudar" size="sm" variant="ghost" loading={priority.isPending} onPress={() => setPriorityOpen(true)} /> : null}
        </View>
      </InfoRow>
      <InfoRow label="Solicitante" icon="edit-3" value={requester} />
      <InfoRow label="Aberta em" icon="calendar" value={formatDateTime(solicitation.createdAt)} last={!solicitation.slaDueAt} />
      {solicitation.slaDueAt ? (
        <InfoRow label="Prazo" icon="clock" last>
          <View style={styles.inlineEnd}>
            <Txt variant="smallStrong">{formatDate(solicitation.slaDueAt)}</Txt>
            {sla ? <Badge label={sla.label} tone={sla.tone} size="sm" /> : null}
          </View>
        </InfoRow>
      ) : null}

      <Sheet visible={assignOpen} onClose={() => setAssignOpen(false)} title="Responsável">
        {user ? (
          <SheetOption icon="user-check" label="Eu mesmo" description={user.fullName} onPress={() => changeAssignee(user.id)} selected={solicitation.assigneeId === user.id} />
        ) : null}
        {users.isLoading ? (
          <LoadingBlock />
        ) : (
          (users.data ?? [])
            .filter((u) => u.id !== user?.id)
            .map((u) => (
              <SheetOption key={u.id} label={u.fullName} description={u.email} selected={solicitation.assigneeId === u.id} onPress={() => changeAssignee(u.id)} />
            ))
        )}
        {solicitation.assigneeId ? <SheetOption icon="user-x" label="Tirar o responsável" onPress={() => changeAssignee(null)} /> : null}
      </Sheet>

      <Sheet visible={priorityOpen} onClose={() => setPriorityOpen(false)} title="Prioridade">
        {PRIORITIES.map((p) => (
          <SheetOption
            key={p}
            label={priorityMeta(p).label}
            selected={solicitation.priority === p}
            tone={p === 'urgent' ? colors.danger : p === 'high' ? '#F59E0B' : p === 'medium' ? colors.brand : '#94A3B8'}
            onPress={() => {
              setPriorityOpen(false);
              priority.mutate(p, {
                onSuccess: () => toast({ title: 'Prioridade alterada' }),
                onError: (error) => toast({ title: 'Não foi possível mudar', description: apiErrorMessage(error, ''), variant: 'error' }),
              });
            }}
          />
        ))}
      </Sheet>
    </Card>
  );
}

const STAGES: Array<{ value: KanbanDefaultStage; label: string }> = [
  { value: 'novo', label: 'Novo' },
  { value: 'pendente', label: 'Pendente' },
  { value: 'concluido', label: 'Concluído' },
];

/** Card "Sem processo": três colunas padrão (o backend grava o status equivalente). */
function StageCard({ solicitation }: { solicitation: Solicitation }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!can('solicitations.manage')) return null;
  async function go(stage: KanbanDefaultStage) {
    setBusy(true);
    try {
      await moveStage(solicitation.id, stage);
      invalidateSolicitation(queryClient, solicitation.id);
      toast({ title: 'Card movido' });
    } catch (error) {
      toast({ title: 'Não foi possível mover', description: apiErrorMessage(error, ''), variant: 'error' });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card style={{ gap: spacing.md }}>
      <Txt variant="overline" color={colors.textMuted}>
        Mover para
      </Txt>
      <View style={styles.inlineEnd}>
        {STAGES.map((stage) => (
          <Button key={stage.value} label={stage.label} size="sm" variant="outline" disabled={busy} onPress={() => void go(stage.value)} style={{ flex: 1 }} />
        ))}
      </View>
    </Card>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    strip: {
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
      gap: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    badges: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    code: { fontWeight: '700' },
    inlineEnd: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.sm },
  }),
);
