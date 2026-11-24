import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { keys, useInbox, useMarkAllRead, useMarkRead } from '../api/queries';
import type { InboxItem } from '../api/types';
import { timeAgo } from '../domain/format';
import { openAppLink } from '../navigation/links';
import { Screen, ScreenHeader, ScreenScroll } from '../ui/layout';
import { Button, Card, EmptyState, ErrorState, Icon, SkeletonList, Txt } from '../ui/primitives';
import { makeStyles, radii, spacing, useTheme } from '../ui/theme';

/** O sino do web no celular: avisos do sistema, com o link para o card ou a aprovação. */
export default function InboxScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const inbox = useInbox();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const items = inbox.data?.data ?? [];
  const unread = items.filter((item) => !item.isRead).length;

  function open(item: InboxItem) {
    if (!item.isRead) {
      markRead.mutate(item.id, { onSettled: () => void queryClient.invalidateQueries({ queryKey: keys.unread }) });
    }
    if (item.link) openAppLink(navigation, item.link);
  }

  return (
    <Screen>
      <ScreenHeader
        large
        title="Avisos"
        subtitle={inbox.data ? (unread === 0 ? 'Tudo lido' : unread === 1 ? '1 não lido' : `${unread} não lidos`) : undefined}
        right={
          unread > 0 ? (
            <Button
              label="Ler todos"
              size="sm"
              variant="ghost"
              icon="check-square"
              loading={markAll.isPending}
              onPress={() => markAll.mutate(undefined, { onSettled: () => void queryClient.invalidateQueries({ queryKey: keys.unread }) })}
            />
          ) : undefined
        }
      />
      <ScreenScroll
        refreshing={inbox.isRefetching}
        onRefresh={() => {
          void inbox.refetch();
          void queryClient.invalidateQueries({ queryKey: keys.unread });
        }}
      >
        {inbox.isLoading ? (
          <SkeletonList count={5} height={72} />
        ) : inbox.isError ? (
          <ErrorState onRetry={() => void inbox.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState icon="bell" title="Nenhum aviso" text="Atribuições, aprovações e mudanças nos seus cards aparecem aqui." />
        ) : (
          <Card padded={false}>
            {items.map((item, index) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`${item.isRead ? '' : 'Não lido. '}${item.title ?? ''} ${item.message}`}
                onPress={() => open(item)}
                android_ripple={{ color: colors.ripple }}
                style={[styles.row, index > 0 && styles.border, !item.isRead && styles.unread]}
              >
                <View style={[styles.icon, !item.isRead && { backgroundColor: colors.brand }]}>
                  <Icon name="bell" size={16} color={item.isRead ? colors.textMuted : colors.onBrand} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  {item.title ? (
                    <Txt variant={item.isRead ? 'small' : 'smallStrong'} numberOfLines={2}>
                      {item.title}
                    </Txt>
                  ) : null}
                  <Txt variant="small" color={colors.textSecondary} numberOfLines={3}>
                    {item.message}
                  </Txt>
                  <Txt variant="caption" color={colors.textMuted}>
                    {timeAgo(item.createdAt)}
                  </Txt>
                </View>
                {item.link ? <Icon name="chevron-right" size={18} color={colors.textFaint} /> : null}
              </Pressable>
            ))}
          </Card>
        )}
      </ScreenScroll>
    </Screen>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.lg },
    border: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    unread: { backgroundColor: colors.brandTint },
    icon: {
      width: 32,
      height: 32,
      borderRadius: radii.pill,
      backgroundColor: colors.divider,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
  }),
);
