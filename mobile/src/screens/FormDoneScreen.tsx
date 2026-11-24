import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootScreenProps } from '../navigation/types';
import { Button, Icon, Txt } from '../ui/primitives';
import { makeStyles, spacing, useTheme } from '../ui/theme';

/** Confirmação do envio. O card nasce pelo fluxo do processo e aparece no quadro em seguida. */
export default function FormDoneScreen({ route, navigation }: RootScreenProps<'FormDone'>) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { submissionId, formTitle, formId } = route.params;
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.xxxl, paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.center}>
        <View style={styles.badge}>
          <Icon name="check" size={44} color={colors.onBrand} />
        </View>
        <Txt variant="display" align="center">
          Pedido enviado!
        </Txt>
        <Txt variant="body" color={colors.textSecondary} align="center">
          Recebemos sua resposta para “{formTitle}”. Você acompanha o andamento pelo processo e pelos avisos.
        </Txt>
        <Txt variant="caption" color={colors.textMuted} align="center" selectable>
          Protocolo {submissionId.slice(0, 8).toUpperCase()}
        </Txt>
      </View>
      <View style={{ gap: spacing.sm }}>
        <Button label="Enviar outra resposta" icon="repeat" variant="outline" onPress={() => navigation.replace('FormFill', { formId, title: formTitle })} />
        <Button label="Voltar ao início" icon="home" onPress={() => navigation.navigate('Tabs', { screen: 'Home' })} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.xl, justifyContent: 'space-between' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
    badge: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: colors.success,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
  }),
);
