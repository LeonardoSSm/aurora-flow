import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { usePublishedForms } from '../api/queries';
import { Input } from '../ui/inputs';
import { Screen, ScreenHeader, ScreenScroll } from '../ui/layout';
import { Card, EmptyState, ErrorState, Icon, SkeletonList, Txt } from '../ui/primitives';
import { makeStyles, radii, spacing, useTheme } from '../ui/theme';

/** Abrir um pedido: os formulários publicados que a pessoa pode preencher. */
export default function NewRequestScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const navigation = useNavigation();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const forms = usePublishedForms(search);

  return (
    <Screen>
      <ScreenHeader large title="Novo pedido" subtitle="Escolha o formulário" />
      <ScreenScroll refreshing={forms.isRefetching} onRefresh={() => void forms.refetch()}>
        <Input icon="search" placeholder="Buscar formulário" value={query} onChangeText={setQuery} containerStyle={{ marginBottom: spacing.lg }} />
        {forms.isLoading ? (
          <SkeletonList count={4} height={84} />
        ) : forms.isError ? (
          <ErrorState onRetry={() => void forms.refetch()} />
        ) : (forms.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon="file-plus"
            title={search ? 'Nenhum formulário com esse nome' : 'Nenhum formulário disponível'}
            text={search ? undefined : 'Os formulários publicados dos seus processos aparecem aqui.'}
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            {forms.data!.map((form) => (
              <Card
                key={form.id}
                onPress={() => navigation.navigate('FormFill', { formId: form.id, title: form.name })}
                accessibilityLabel={`Preencher ${form.name}`}
                style={styles.card}
              >
                <View style={styles.icon}>
                  <Icon name="file-text" size={20} color={colors.brandText} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="bodyStrong" numberOfLines={2}>
                    {form.name}
                  </Txt>
                  {form.description ? (
                    <Txt variant="small" color={colors.textMuted} numberOfLines={2}>
                      {form.description}
                    </Txt>
                  ) : null}
                </View>
                <Icon name="chevron-right" size={20} color={colors.textFaint} />
              </Card>
            ))}
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
  }),
);
