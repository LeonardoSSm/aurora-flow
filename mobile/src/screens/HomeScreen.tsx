import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { setStatusBarStyle } from 'expo-status-bar';
import React, { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKanbanSummary, useMyPendingApprovals, useSolicitations, useUnreadCount } from '../api/queries';
import { useAuth } from '../context/auth-context';
import { firstName, statusMeta, timeAgo } from '../domain/format';
import { ScreenScroll } from '../ui/layout';
import { Avatar, Badge, Card, Icon, IconButton, SectionHeader, SkeletonList, Txt, type IconName } from '../ui/primitives';
import { makeStyles, radii, shadow, spacing, useTheme } from '../ui/theme';
import { baseStatusBarStyle } from '../ui/theme-provider';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Boa noite';
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

export default function HomeScreen() {
  const { colors, isDark } = useTheme();
  const styles = useStyles();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const pending = useMyPendingApprovals();
  const summary = useKanbanSummary();
  const recent = useSolicitations({ limit: 6, page: 1 });
  const unread = useUnreadCount();
  // Topo azul: ícones da barra de status em branco só enquanto a Início está na frente.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle(baseStatusBarStyle(isDark));
    }, [isDark]),
  );

  const pendingCount = pending.data?.length ?? 0;
  const processes = (summary.data ?? []).filter((item) => item.formId !== null);
  const urgent = (summary.data ?? []).reduce((sum, item) => sum + item.urgentCount, 0);
  const openCards = (summary.data ?? []).reduce((sum, item) => sum + item.totalCards, 0);
  const refreshing = pending.isRefetching || summary.isRefetching || recent.isRefetching;

  function refresh() {
    void pending.refetch();
    void summary.refetch();
    void recent.refetch();
    void unread.refetch();
  }

  return (
    <View style={styles.root}>
      <View style={[styles.hero, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.heroRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Meu perfil"
            onPress={() => navigation.navigate('Profile')}
            style={styles.heroUser}
          >
            <Avatar name={user?.fullName} size={44} color="rgba(255,255,255,0.2)" />
            <View style={{ flex: 1 }}>
              <Txt variant="small" color="rgba(255,255,255,0.75)">
                {greeting()},
              </Txt>
              <Txt variant="title" color={colors.onBrand} numberOfLines={1}>
                {firstName(user?.fullName)}
              </Txt>
            </View>
          </Pressable>
          <IconButton
            name="bell"
            label={unread.data ? `Avisos, ${unread.data} não lidos` : 'Avisos'}
            color={colors.onBrand}
            badge={unread.data ?? 0}
            onPress={() => navigation.navigate('Tabs', { screen: 'Inbox' })}
          />
        </View>

        <View style={styles.stats}>
          <Stat label="Para você" value={pending.isLoading ? '–' : String(pendingCount)} highlight={pendingCount > 0} />
          <Stat label="Cards abertos" value={summary.isLoading ? '–' : String(openCards)} />
          <Stat label="Urgentes" value={summary.isLoading ? '–' : String(urgent)} danger={urgent > 0} />
        </View>
      </View>

      <ScreenScroll refreshing={refreshing} onRefresh={refresh} contentStyle={{ paddingTop: spacing.lg }}>
        {pendingCount > 0 ? (
          <Card
            onPress={() => navigation.navigate('Tabs', { screen: 'Approvals' })}
            accent="#F59E0B"
            accessibilityLabel={`${pendingCount} aprovações esperando sua decisão`}
            style={styles.attention}
          >
            <View style={styles.attentionIcon}>
              <Icon name="check-circle" size={22} color={colors.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong">
                {pendingCount === 1 ? '1 aprovação espera sua decisão' : `${pendingCount} aprovações esperam sua decisão`}
              </Txt>
              <Txt variant="small" color={colors.textMuted}>
                Toque para decidir
              </Txt>
            </View>
            <Icon name="chevron-right" size={20} color={colors.textMuted} />
          </Card>
        ) : null}

        <View style={styles.actions}>
          <QuickAction icon="plus-circle" label="Novo pedido" onPress={() => navigation.navigate('Tabs', { screen: 'NewRequest' })} />
          <QuickAction icon="trello" label="Processos" onPress={() => navigation.navigate('Tabs', { screen: 'Processes' })} />
          <QuickAction icon="list" label="Solicitações" onPress={() => navigation.navigate('Solicitations')} />
        </View>

        <SectionHeader
          title="Seus processos"
          action={
            processes.length > 4 ? (
              <Pressable onPress={() => navigation.navigate('Tabs', { screen: 'Processes' })} hitSlop={8}>
                <Txt variant="smallStrong" color={colors.brandText}>
                  Ver todos
                </Txt>
              </Pressable>
            ) : undefined
          }
        />
        {summary.isLoading ? (
          <SkeletonList count={2} height={64} />
        ) : processes.length === 0 ? (
          <Card>
            <Txt variant="small" color={colors.textMuted}>
              Você ainda não está em nenhum processo. Peça acesso a quem administra o sistema.
            </Txt>
          </Card>
        ) : (
          <Card padded={false}>
            {processes.slice(0, 4).map((process, index) => (
              <Pressable
                key={process.formId}
                accessibilityRole="button"
                onPress={() => navigation.navigate('Board', { formId: process.formId as string, formName: process.formName })}
                android_ripple={{ color: colors.ripple }}
                style={[styles.processRow, index > 0 && styles.rowBorder]}
              >
                <View style={styles.processIcon}>
                  <Icon name="trello" size={18} color={colors.brandText} />
                </View>
                <Txt variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                  {process.formName}
                </Txt>
                {process.urgentCount > 0 ? <Badge label={`${process.urgentCount} urg.`} tone="danger" size="sm" /> : null}
                <Txt variant="smallStrong" color={colors.textMuted}>
                  {process.totalCards}
                </Txt>
                <Icon name="chevron-right" size={18} color={colors.textFaint} />
              </Pressable>
            ))}
          </Card>
        )}

        <SectionHeader title="Atividade recente" />
        {recent.isLoading ? (
          <SkeletonList count={3} height={64} />
        ) : (recent.data?.data.length ?? 0) === 0 ? (
          <Card>
            <Txt variant="small" color={colors.textMuted}>
              Nenhuma solicitação por aqui ainda.
            </Txt>
          </Card>
        ) : (
          <Card padded={false}>
            {recent.data!.data.map((item, index) => {
              const status = statusMeta(item.status);
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  onPress={() => navigation.navigate('Card', { solicitationId: item.id, title: item.title })}
                  android_ripple={{ color: colors.ripple }}
                  style={[styles.recentRow, index > 0 && styles.rowBorder]}
                >
                  <View style={{ flex: 1, gap: 4 }}>
                    <Txt variant="smallStrong" numberOfLines={2}>
                      {item.title}
                    </Txt>
                    <View style={styles.recentMeta}>
                      <Badge label={status.label} tone={status.tone} size="sm" />
                      <Txt variant="caption" color={colors.textMuted}>
                        {timeAgo(item.updatedAt)}
                      </Txt>
                    </View>
                  </View>
                  <Icon name="chevron-right" size={18} color={colors.textFaint} />
                </Pressable>
              );
            })}
          </Card>
        )}
      </ScreenScroll>
    </View>
  );
}

function Stat({ label, value, highlight, danger }: { label: string; value: string; highlight?: boolean; danger?: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}`}>
      <Txt variant="title" color={danger ? '#FECACA' : highlight ? '#FDE68A' : colors.onBrand}>
        {value}
      </Txt>
      <Txt variant="caption" color="rgba(255,255,255,0.75)" numberOfLines={1}>
        {label}
      </Txt>
    </View>
  );
}

function QuickAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.quick, pressed && { opacity: 0.85 }]}>
      <View style={styles.quickIcon}>
        <Icon name={icon} size={22} color={colors.brandText} />
      </View>
      <Txt variant="smallStrong" align="center">
        {label}
      </Txt>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    hero: {
      backgroundColor: colors.hero,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.lg,
      borderBottomLeftRadius: radii.xl,
      borderBottomRightRadius: radii.xl,
      gap: spacing.lg,
    },
    heroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    heroUser: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    stats: { flexDirection: 'row', gap: spacing.sm },
    stat: {
      flex: 1,
      backgroundColor: 'rgba(255,255,255,0.12)',
      borderRadius: radii.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      gap: 2,
    },
    attention: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
    attentionIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.warningSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actions: { flexDirection: 'row', gap: spacing.sm },
    quick: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      paddingVertical: spacing.md,
      alignItems: 'center',
      gap: spacing.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      ...shadow.card,
    },
    quickIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.brandSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    processRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, minHeight: 60 },
    processIcon: {
      width: 36,
      height: 36,
      borderRadius: radii.sm,
      backgroundColor: colors.brandSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    recentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
    recentMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  }),
);
