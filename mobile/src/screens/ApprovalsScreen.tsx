import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useMyPendingApprovals } from '../api/queries';
import { formatDate, priorityMeta, shortCode, timeAgo } from '../domain/format';
import { Screen, ScreenHeader, ScreenScroll } from '../ui/layout';
import { Badge, Card, EmptyState, ErrorState, Icon, SkeletonList, Txt } from '../ui/primitives';
import { spacing, useTheme } from '../ui/theme';

/** O que espera a decisão da pessoa — por usuário ou por perfil (a lista vem do servidor). */
export default function ApprovalsScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const pending = useMyPendingApprovals();
  const steps = [...(pending.data ?? [])].sort(
    (a, b) => new Date(a.approval.createdAt).getTime() - new Date(b.approval.createdAt).getTime(),
  );

  return (
    <Screen>
      <ScreenHeader
        large
        title="Aprovações"
        subtitle={pending.data ? (steps.length === 0 ? 'Nada esperando você' : `${steps.length} esperando sua decisão`) : undefined}
      />
      <ScreenScroll refreshing={pending.isRefetching} onRefresh={() => void pending.refetch()}>
        {pending.isLoading ? (
          <SkeletonList count={3} height={110} />
        ) : pending.isError ? (
          <ErrorState onRetry={() => void pending.refetch()} />
        ) : steps.length === 0 ? (
          <EmptyState icon="check-circle" title="Tudo em dia" text="Quando alguém pedir sua aprovação, ela aparece aqui e no sino." />
        ) : (
          <View style={{ gap: spacing.md }}>
            {steps.map((step) => {
              const sol = step.approval.solicitation;
              const priority = priorityMeta(sol?.priority);
              const byRole = !step.assignedUserId && step.assignedRole;
              return (
                <Card
                  key={step.id}
                  accent="#F59E0B"
                  onPress={() =>
                    navigation.navigate('Card', {
                      solicitationId: step.approval.solicitationId,
                      title: sol?.title,
                      focusDecision: true,
                    })
                  }
                  accessibilityLabel={`${step.approval.title}. ${sol?.title ?? ''}`}
                  style={{ gap: spacing.sm }}
                >
                  <View style={styles.top}>
                    <Txt variant="caption" color={colors.textMuted} style={{ fontWeight: '700' }}>
                      {shortCode(step.approval.solicitationId)}
                    </Txt>
                    {sol && (sol.priority === 'urgent' || sol.priority === 'high') ? (
                      <Badge label={priority.label} tone={priority.tone} size="sm" />
                    ) : null}
                    <View style={{ flex: 1 }} />
                    <Txt variant="caption" color={colors.textMuted}>
                      {timeAgo(step.approval.createdAt)}
                    </Txt>
                  </View>
                  <Txt variant="bodyStrong" numberOfLines={2}>
                    {sol?.title ?? step.approval.title}
                  </Txt>
                  <View style={styles.row}>
                    <Icon name="check-circle" size={14} color={colors.warning} />
                    <Txt variant="small" color={colors.textSecondary} numberOfLines={2} style={{ flex: 1 }}>
                      {step.approval.title}
                    </Txt>
                  </View>
                  <View style={styles.row}>
                    {sol?.createdByUser ? (
                      <Txt variant="caption" color={colors.textMuted} numberOfLines={1} style={{ flex: 1 }}>
                        Pedido por {sol.createdByUser.fullName}
                      </Txt>
                    ) : (
                      <View style={{ flex: 1 }} />
                    )}
                    {byRole ? <Badge label={`Perfil ${step.assignedRole?.name}`} tone="purple" size="sm" /> : null}
                    {sol?.slaDueAt ? (
                      <Badge label={`Prazo ${formatDate(sol.slaDueAt)}`} tone={sol.slaStatus === 'breached' ? 'danger' : 'neutral'} size="sm" />
                    ) : null}
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </ScreenScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
