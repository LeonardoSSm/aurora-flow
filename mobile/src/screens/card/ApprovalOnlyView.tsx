import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { View } from 'react-native';
import { useApproval, useMyPendingApprovals } from '../../api/queries';
import { ApprovalStatusBadge, ApprovalStepsList, DecisionButtons } from '../../components/ApprovalBlocks';
import { formatDate, formatDateTime, priorityMeta, shortCode, statusMeta } from '../../domain/format';
import { ScreenScroll } from '../../ui/layout';
import { Badge, Card, ErrorState, Icon, InfoRow, LoadingBlock, Notice, SectionHeader, Txt } from '../../ui/primitives';
import { spacing, useTheme } from '../../ui/theme';

/**
 * Quem aprova por perfil nem sempre tem acesso ao processo (a API recusa o card). Para não travar
 * a decisão, mostra o que a aprovação traz — o resumo da solicitação, quem aprova e o histórico —
 * com Aprovar/Reprovar. É o que o app antigo fazia na tela de aprovação.
 */
export function ApprovalOnlyView({ approvalId, stepId }: { approvalId: string; stepId: string }) {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const approval = useApproval(approvalId);
  const pending = useMyPendingApprovals();
  const still = (pending.data ?? []).some((step) => step.id === stepId);

  if (approval.isLoading) return <LoadingBlock label="Carregando a aprovação…" />;
  if (approval.isError || !approval.data) return <ErrorState onRetry={() => void approval.refetch()} />;

  const data = approval.data;
  const sol = data.solicitation;
  const status = statusMeta(sol?.status);
  const priority = priorityMeta(sol?.priority);
  const history = [...(sol?.history ?? [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <ScreenScroll refreshing={approval.isRefetching} onRefresh={() => void approval.refetch()}>
      <View style={{ gap: spacing.lg }}>
        <Notice
          tone="info"
          icon="lock"
          text="Você aprova esta etapa, mas não tem acesso ao processo inteiro: aqui aparece o resumo que a aprovação traz."
        />
        <Card accent={still ? '#F59E0B' : undefined} style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
            <Txt variant="overline" color={colors.textMuted} style={{ flex: 1 }}>
              {data.phaseId ? 'Aprovação de fase' : 'Aprovação'}
            </Txt>
            <ApprovalStatusBadge approval={data} />
          </View>
          <Txt variant="heading">{data.title}</Txt>
          {data.description ? (
            <Txt variant="small" color={colors.textSecondary}>
              {data.description}
            </Txt>
          ) : null}
          {data.steps ? <ApprovalStepsList steps={data.steps} /> : null}
          {still ? (
            <DecisionButtons
              stepId={stepId}
              solicitationId={data.solicitationId}
              onDecided={() => navigation.goBack()}
            />
          ) : null}
        </Card>

        {sol ? (
          <>
            <SectionHeader title="Solicitação" style={{ marginTop: 0 }} />
            <Card style={{ paddingVertical: spacing.xs }}>
              <InfoRow label="Número" icon="hash" value={shortCode(sol.id)} />
              <InfoRow label="Status" icon="activity">
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Badge label={status.label} tone={status.tone} />
                </View>
              </InfoRow>
              <InfoRow label="Prioridade" icon="flag">
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Badge label={priority.label} tone={priority.tone} />
                </View>
              </InfoRow>
              <InfoRow label="Solicitante" icon="user" value={sol.createdByUser?.fullName} />
              <InfoRow label="Aberta em" icon="calendar" value={formatDateTime(sol.createdAt)} last={!sol.slaDueAt} />
              {sol.slaDueAt ? <InfoRow label="Prazo" icon="clock" value={formatDate(sol.slaDueAt)} last /> : null}
            </Card>
          </>
        ) : null}

        {history.length > 0 ? (
          <>
            <SectionHeader title="Histórico" style={{ marginTop: 0 }} />
            <Card style={{ gap: spacing.md }}>
              {history.map((event) => (
                <View key={event.id} style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <Icon name="activity" size={14} color={colors.brandText} />
                  <View style={{ flex: 1 }}>
                    <Txt variant="small">{event.message ?? event.eventType}</Txt>
                    <Txt variant="caption" color={colors.textMuted}>
                      {event.actor?.fullName ?? 'Sistema'} · {formatDateTime(event.createdAt)}
                    </Txt>
                  </View>
                </View>
              ))}
            </Card>
          </>
        ) : null}
      </View>
    </ScreenScroll>
  );
}
