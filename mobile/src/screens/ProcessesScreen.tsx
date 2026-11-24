import { useNavigation } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useKanbanSummary } from '../api/queries';
import { Input } from '../ui/inputs';
import { Screen, ScreenHeader, ScreenScroll } from '../ui/layout';
import { Badge, Card, EmptyState, ErrorState, Icon, IconButton, SkeletonList, Txt } from '../ui/primitives';
import { makeStyles, radii, spacing, useTheme } from '../ui/theme';

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Os processos (quadros Kanban) que a pessoa vê, com quantos cards e quantos urgentes. */
export default function ProcessesScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const navigation = useNavigation();
  const summary = useKanbanSummary();
  const [query, setQuery] = useState('');

  const items = useMemo(() => {
    const all = summary.data ?? [];
    const q = normalize(query.trim());
    return q ? all.filter((item) => normalize(item.formName).includes(q)) : all;
  }, [summary.data, query]);

  return (
    <Screen>
      <ScreenHeader
        large
        title="Processos"
        subtitle={summary.data ? `${summary.data.filter((s) => s.formId).length} processos` : undefined}
        right={
          <IconButton name="list" label="Todas as solicitações" color={colors.text} onPress={() => navigation.navigate('Solicitations')} />
        }
      />
      <ScreenScroll refreshing={summary.isRefetching} onRefresh={() => void summary.refetch()}>
        {(summary.data?.length ?? 0) > 5 ? (
          <Input icon="search" placeholder="Buscar processo" value={query} onChangeText={setQuery} containerStyle={{ marginBottom: spacing.lg }} />
        ) : null}
        {summary.isLoading ? (
          <SkeletonList count={4} height={76} />
        ) : summary.isError ? (
          <ErrorState onRetry={() => void summary.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon="trello"
            title={query ? 'Nenhum processo com esse nome' : 'Nenhum processo por aqui'}
            text={query ? undefined : 'Quando você tiver acesso a um processo, os cards dele aparecem aqui.'}
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            {items.map((item) => (
              <Card
                key={item.formId ?? 'unassigned'}
                onPress={() =>
                  navigation.navigate('Board', {
                    formId: item.formId ?? 'unassigned',
                    formName: item.formId ? item.formName : 'Sem processo',
                  })
                }
                accessibilityLabel={`${item.formName}, ${item.totalCards} cards`}
                style={styles.card}
              >
                <View style={[styles.icon, !item.formId && { backgroundColor: colors.divider }]}>
                  <Icon name={item.formId ? 'trello' : 'inbox'} size={20} color={item.formId ? colors.brandText : colors.textMuted} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Txt variant="bodyStrong" numberOfLines={2}>
                    {item.formId ? item.formName : 'Sem processo'}
                  </Txt>
                  <View style={styles.meta}>
                    <Txt variant="caption" color={colors.textMuted}>
                      {item.totalCards === 1 ? '1 card' : `${item.totalCards} cards`}
                    </Txt>
                    {item.urgentCount > 0 ? (
                      <Badge label={item.urgentCount === 1 ? '1 urgente' : `${item.urgentCount} urgentes`} tone="danger" size="sm" />
                    ) : null}
                  </View>
                </View>
                <Icon name="chevron-right" size={20} color={colors.textFaint} />
              </Card>
            ))}
            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.navigate('Solicitations', { mine: true, title: 'Minhas solicitações' })}
              style={styles.link}
            >
              <Icon name="user" size={16} color={colors.brandText} />
              <Txt variant="smallStrong" color={colors.brandText}>
                Ver as solicitações sob minha responsabilidade
              </Txt>
            </Pressable>
          </View>
        )}
      </ScreenScroll>
    </Screen>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    icon: {
      width: 44,
      height: 44,
      borderRadius: radii.md,
      backgroundColor: colors.brandSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    link: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'center', paddingVertical: spacing.md },
  }),
);
