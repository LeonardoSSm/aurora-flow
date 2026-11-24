import { useInfiniteQuery } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchSolicitations } from '../api/endpoints';
import { useAuth } from '../context/auth-context';
import { formatDate, priorityMeta, shortCode, slaMeta, statusMeta, timeAgo } from '../domain/format';
import type { RootScreenProps } from '../navigation/types';
import { Chips, Input } from '../ui/inputs';
import { Screen, ScreenHeader } from '../ui/layout';
import { Badge, Card, EmptyState, ErrorState, SkeletonList, Txt } from '../ui/primitives';
import { makeStyles, spacing, useTheme } from '../ui/theme';

const STATUS = [
  { value: '', label: 'Todas' },
  { value: 'new', label: 'Novas' },
  { value: 'in_analysis', label: 'Em análise' },
  { value: 'waiting_approval', label: 'Aguardando aprovação' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'approved', label: 'Aprovadas' },
  { value: 'completed', label: 'Concluídas' },
  { value: 'rejected', label: 'Reprovadas' },
  { value: 'cancelled', label: 'Canceladas' },
] as const;

const PAGE = 20;

/** Todas as solicitações que a pessoa vê, com busca, filtro de status e paginação infinita. */
export default function SolicitationsScreen({ route, navigation }: RootScreenProps<'Solicitations'>) {
  const { colors } = useTheme();
  const styles = useStyles();
  const mine = route.params?.mine ?? false;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [status, setStatus] = useState<string>('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  const list = useInfiniteQuery({
    queryKey: ['solicitations', 'infinite', { status, search, mine }],
    queryFn: ({ pageParam }) =>
      fetchSolicitations({
        page: pageParam,
        limit: PAGE,
        status: status || undefined,
        search: search || undefined,
        assigneeId: mine ? user?.id : undefined,
      }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
  });
  const items = list.data?.pages.flatMap((page) => page.data) ?? [];
  const total = list.data?.pages[0]?.total;

  return (
    <Screen>
      <ScreenHeader back title={route.params?.title ?? 'Solicitações'} subtitle={total !== undefined ? `${total} no total` : undefined} />
      <View style={styles.bar}>
        <Input icon="search" placeholder="Buscar por título" value={query} onChangeText={setQuery} containerStyle={{ marginBottom: spacing.sm }} />
        <Chips items={STATUS} value={status as (typeof STATUS)[number]['value']} onChange={setStatus} />
      </View>
      {list.isLoading ? (
        <View style={{ padding: spacing.lg }}>
          <SkeletonList count={5} height={86} />
        </View>
      ) : list.isError ? (
        <ErrorState onRetry={() => void list.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxxl }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => void list.refetch()} colors={[colors.brand]} progressBackgroundColor={colors.surface} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator color={colors.brandText} style={{ marginTop: spacing.lg }} /> : null}
          ListEmptyComponent={<EmptyState icon="search" title="Nenhuma solicitação encontrada" />}
          renderItem={({ item }) => {
            const s = statusMeta(item.status);
            const p = priorityMeta(item.priority);
            const sla = slaMeta(item.slaStatus);
            return (
              <Card
                onPress={() => navigation.navigate('Card', { solicitationId: item.id, title: item.title })}
                style={{ gap: spacing.sm }}
                accessibilityLabel={item.title}
              >
                <View style={styles.row}>
                  <Txt variant="caption" color={colors.textMuted} style={{ fontWeight: '700' }}>
                    {shortCode(item.id)}
                  </Txt>
                  {item.form?.name ? (
                    <Txt variant="caption" color={colors.textSecondary} numberOfLines={1} style={{ flex: 1 }}>
                      {item.form.name}
                    </Txt>
                  ) : (
                    <View style={{ flex: 1 }} />
                  )}
                  <Txt variant="caption" color={colors.textMuted}>
                    {timeAgo(item.updatedAt)}
                  </Txt>
                </View>
                <Txt variant="bodyStrong" numberOfLines={2}>
                  {item.title}
                </Txt>
                <View style={styles.badges}>
                  <Badge label={s.label} tone={s.tone} size="sm" />
                  {item.priority === 'urgent' || item.priority === 'high' ? <Badge label={p.label} tone={p.tone} size="sm" /> : null}
                  {sla && item.slaDueAt ? <Badge label={`${sla.label} · ${formatDate(item.slaDueAt)}`} tone={sla.tone} size="sm" /> : null}
                  {item.assignee ? (
                    <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
                      · {item.assignee.fullName}
                    </Txt>
                  ) : null}
                </View>
              </Card>
            );
          }}
        />
      )}
    </Screen>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    bar: {
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  }),
);
