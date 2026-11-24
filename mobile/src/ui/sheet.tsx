import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconButton, Txt, type IconName } from './primitives';
import { makeStyles, radii, spacing, useTheme } from './theme';

/**
 * Folha que sobe de baixo (escolher fase, decidir aprovação, opções de lista). Fecha no fundo
 * escuro, no X e no voltar do Android.
 */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  scroll = true,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  scroll?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const translate = useRef(new Animated.Value(height)).current;

  useEffect(() => {
    if (visible) {
      translate.setValue(height);
      Animated.timing(translate, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [visible, height, translate]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fechar" accessibilityRole="button" />
        <Animated.View
          style={[
            styles.sheet,
            { maxHeight: height * 0.88, paddingBottom: footer ? 0 : insets.bottom + spacing.md, transform: [{ translateY: translate }] },
          ]}
        >
          <View style={styles.grabber} />
          {title ? (
            <View style={styles.head}>
              <View style={{ flex: 1 }}>
                <Txt variant="heading" accessibilityRole="header">
                  {title}
                </Txt>
                {subtitle ? (
                  <Txt variant="small" color={colors.textMuted}>
                    {subtitle}
                  </Txt>
                ) : null}
              </View>
              <IconButton name="x" label="Fechar" onPress={onClose} />
            </View>
          ) : null}
          {scroll ? (
            <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          ) : (
            <View style={[styles.body, styles.bodyContent]}>{children}</View>
          )}
          {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Linha de opção dentro da folha (ícone, texto, marcação). */
export function SheetOption({
  label,
  description,
  icon,
  selected,
  disabled,
  onPress,
  tone,
  trailing,
}: {
  label: string;
  description?: string;
  icon?: IconName;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
  tone?: string;
  trailing?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      android_ripple={{ color: colors.ripple }}
      style={[styles.option, selected && styles.optionSelected, disabled && styles.optionDisabled]}
    >
      {tone ? <View style={[styles.optionDot, { backgroundColor: tone }]} /> : null}
      {icon ? <Icon name={icon} size={20} color={selected ? colors.brandText : colors.textSecondary} /> : null}
      <View style={{ flex: 1 }}>
        <Txt variant={selected ? 'bodyStrong' : 'body'} color={selected ? colors.brandText : colors.text}>
          {label}
        </Txt>
        {description ? (
          <Txt variant="caption" color={colors.textMuted}>
            {description}
          </Txt>
        ) : null}
      </View>
      {trailing}
      {selected ? <Icon name="check" size={20} color={colors.brandText} /> : null}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    fill: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radii.xl,
      borderTopRightRadius: radii.xl,
      overflow: 'hidden',
    },
    grabber: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.borderStrong,
      marginTop: spacing.sm,
    },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: spacing.lg,
      paddingRight: spacing.sm,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
    },
    body: { flexGrow: 0 },
    bodyContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.xs },
    footer: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      flexDirection: 'row',
      gap: spacing.sm,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 52,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.md,
    },
    optionSelected: { backgroundColor: colors.brandTint },
    optionDisabled: { opacity: 0.45 },
    optionDot: { width: 10, height: 10, borderRadius: 5 },
  }),
);
