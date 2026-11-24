import React, { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBoard, useMyPendingApprovals } from '../api/queries';
import type { KanbanCard } from '../api/types';
import { KanbanCardView } from '../components/KanbanCardView';
import { useAuth } from '../context/auth-context';
import { formatCurrency } from '../domain/format';
import type { RootScreenProps } from '../navigation/types';
import { Chips, Input } from '../ui/inputs';
import { Screen, ScreenHeader } from '../ui/layout';
import { EmptyState, ErrorState, IconButton, SkeletonList, Txt } from '../ui/primitives';
import { makeStyles, phaseColor, spacing, useTheme } from '../ui/theme';

type QuickFilter = 'all' | 'my_approvals' | 'mine' | 'no_assignee' | 'urgent' | 'sla_risk';

const FILTERS: Array<{ value: QuickFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'my_approvals', label: 'Minhas aprovações' },
  { value: 'mine', label: 'Comigo' },
  { value: 'no_assignee', label: 'Sem responsável' },
  { value: 'urgent', label: 'Alta prioridade' },
  { value: 'sla_risk', label: 'Prazo em risco' },
];

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Quadro de um processo no celular: as fases viram abas (com a cor e a contagem), e os cards da
 * fase escolhida ficam numa lista — arrastar colunas não funciona bem numa tela de 6 polegadas.
 */
export default function BoardScreen({ route, navigation }: RootScreenProps<'Board'>) {
  const { colors, isDark } = useTheme();
  const styles = useStyles();
  const { formId, formName } = route.params;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const board = useBoard(formId);
  const pending = useMyPendingApprovals();
  const [phaseId, setPhaseId] = useState<string | null>(null);
  const [filter, setFilter] = useState<QuickFilter>('all');
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');

  const myApprovalCards = useMemo(
    () => new Set((pending.data ?? []).map((step) => step.approval.solicitationId)),
    [pending.data],
  );

  const matches = useMemo(() => {
    const q = normalize(query.trim());
    return (card: KanbanCard) => {
      if (q) {
        const haystack = normalize(
          [card.title, card.requesterName, card.responsibleName, card.id.slice(0, 8), ...(card.fields ?? []).map((f) => f.text)]
            .filter(Boolean)
            .join(' '),
        );
        if (!haystack.includes(q)) return false;
      }
      switch (filter) {
        case 'my_approvals':
          return myApprovalCards.has(card.id);
        case 'mine':
          return card.responsibleUserId === user?.id;
        case 'no_assignee':
          return !card.responsibleUserId;
        case 'urgent':
          return card.priority === 'urgent' || card.priority === 'high';
        case 'sla_risk':
          return card.slaStatus === 'warning' || card.slaStatus === 'breached' || card.phaseSla?.state === 'warning' || card.phaseSla?.state === 'breached';
        default:
          return true;
      }
    };
  }, [query, filter, myApprovalCards, user?.id]);

  const columns = board.data?.columns ?? [];
  const filteredCounts = columns.map((column) => column.cards.filter(matches).length);
  const selected = columns.find((column) => column.id === phaseId) ?? columns[0];
  const cards = selected ? selected.cards.filter(matches) : [];
  const total = columns.reduce((sum, column) => sum + column.cards.length, 0);

  return (
    <Screen>
      <ScreenHeader
        back
        title={board.data?.formName ?? formName}
        subtitle={board.data ? (total === 1 ? '1 card' : `${total} cards`) : undefined}
        right={
          <IconButton
            name={searching ? 'x' : 'search'}
            label={searching ? 'Fechar busca' : 'Buscar card'}
            color={colors.text}
            onPress={() => {
              if (searching) setQuery('');
              setSearching((v) => !v);
            }}
          />
        }
      />
      <View style={styles.bar}>
        {searching ? (
          <Input
            icon="search"
            autoFocus
            placeholder="Título, solicitante, número…"
            value={query}
            onChangeText={setQuery}
            containerStyle={{ marginBottom: spacing.sm }}
          />
        ) : null}
        <Chips
          items={columns.map((column, index) => ({
            value: column.id,
            label: column.label,
            count: filteredCounts[index],
            color: phaseColor(column.color, isDark),
          }))}
          value={selected?.id ?? ''}
          onChange={setPhaseId}
        />
        <Chips items={FILTERS} value={filter} onChange={setFilter} style={{ marginTop: spacing.sm }} />
      </View>

      {board.isLoading ? (
        <View style={{ padding: spacing.lg }}>
          <SkeletonList count={4} height={120} />
        </View>
      ) : board.isError ? (
        <ErrorState onRetry={() => void board.refetch()} />
      ) : (
        <FlatList
          data={cards}
          keyExtractor={(card) => card.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xxxl }]}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          refreshControl={
            <RefreshControl
              refreshing={board.isRefetching}
              onRefresh={() => {
                void board.refetch();
                void pending.refetch();
              }}
              colors={[colors.brand]}
              progressBackgroundColor={colors.surface}
            />
          }
          ListHeaderComponent={
            selected && typeof selected.totalValue === 'number' ? (
              <View style={styles.total}>
                <Txt variant="small" color={colors.textMuted}>
                  Total da fase
                </Txt>
                <Txt variant="heading">{formatCurrency(selected.totalValue)}</Txt>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon={filter !== 'all' || query ? 'filter' : 'inbox'}
              title={filter !== 'all' || query ? 'Nenhum card com esse filtro' : 'Nenhum card nesta fase'}
              text={selected?.blockMoveBack ? 'Esta fase é um ponto sem volta: card que chega aqui não volta para trás.' : undefined}
            />
          }
          renderItem={({ item }) => (
            <KanbanCardView
              card={item}
              display={selected?.cardDisplay}
              hideProcess={formId !== 'unassigned'}
              myApprovalPending={myApprovalCards.has(item.id)}
              onPress={() => navigation.navigate('Card', { solicitationId: item.id, title: item.title, focusDecision: myApprovalCards.has(item.id) })}
            />
          )}
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
    list: { padding: spacing.lg },
    total: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  }),
);
