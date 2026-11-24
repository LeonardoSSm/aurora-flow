import { useNavigation } from '@react-navigation/native';
import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton, Txt } from './primitives';
import { makeStyles, spacing, useTheme } from './theme';

/**
 * Cabeçalho das telas. `large` = telas das abas (título grande, sem voltar); senão, barra compacta
 * com voltar. Fica sobre a área segura do topo (o app desenha de ponta a ponta no Android 15+).
 */
export function ScreenHeader({
  title,
  subtitle,
  overline,
  back,
  onBack,
  right,
  large,
}: {
  title: string;
  subtitle?: string;
  overline?: string;
  back?: boolean;
  onBack?: () => void;
  right?: React.ReactNode;
  large?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const handleBack = onBack ?? (() => navigation.goBack());
  return (
    <View style={[styles.header, { paddingTop: insets.top + (large ? spacing.md : spacing.xs) }]}>
      <View style={styles.headerRow}>
        {back ? (
          <IconButton name="arrow-left" label="Voltar" onPress={handleBack} color={colors.text} style={styles.backBtn} />
        ) : null}
        <View style={[styles.headerText, !back && { paddingLeft: spacing.xs }]}>
          {overline ? (
            <Txt variant="overline" color={colors.textMuted} numberOfLines={1}>
              {overline}
            </Txt>
          ) : null}
          <Txt
            variant={large ? 'display' : 'heading'}
            numberOfLines={large ? 1 : 2}
            accessibilityRole="header"
          >
            {title}
          </Txt>
          {subtitle ? (
            <Txt variant="small" color={colors.textMuted} numberOfLines={1}>
              {subtitle}
            </Txt>
          ) : null}
        </View>
        {right ? <View style={styles.headerRight}>{right}</View> : null}
      </View>
    </View>
  );
}

/** Corpo rolável padrão: fundo, respiro lateral, puxar para atualizar e espaço para o rodapé fixo. */
export function ScreenScroll({
  children,
  refreshing,
  onRefresh,
  contentStyle,
  footerSpace = 0,
  ...rest
}: ScrollViewProps & {
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  /** Altura do rodapé fixo por cima do conteúdo (botão de enviar/salvar). */
  footerSpace?: number;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingBottom: spacing.xxxl + footerSpace + (footerSpace ? 0 : insets.bottom) },
        contentStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} colors={[colors.brand]} tintColor={colors.brandText} progressBackgroundColor={colors.surface} />
        ) : undefined
      }
      {...rest}
    >
      {children}
    </ScrollView>
  );
}

export function Screen({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  return <View style={[styles.screen, style]}>{children}</View>;
}

/** Tela com formulário: o teclado empurra o conteúdo (Android já redimensiona; iOS precisa disto). */
export function KeyboardScreen({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {children}
    </KeyboardAvoidingView>
  );
}

/**
 * Rodapé fixo com a ação principal. Respeita a barra de navegação do Android (o botão "Enviar
 * formulário" ficava embaixo dela quando o app passou a desenhar de ponta a ponta).
 */
export function StickyFooter({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return <View style={[styles.footer, { paddingBottom: spacing.md + insets.bottom }]}>{children}</View>;
}

/** Altura útil do rodapé fixo (sem a área segura), para reservar espaço no fim da rolagem. */
export const STICKY_FOOTER_HEIGHT = 48 + spacing.md * 2;

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: {
      backgroundColor: colors.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44 },
    backBtn: { marginLeft: -spacing.xs },
    headerText: { flex: 1, gap: 1 },
    headerRight: { flexDirection: 'row', alignItems: 'center' },
    scroll: { flex: 1 },
    scrollContent: { padding: spacing.lg },
    footer: {
      backgroundColor: colors.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      flexDirection: 'row',
      gap: spacing.sm,
    },
  }),
);
