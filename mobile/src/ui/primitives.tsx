import { Feather } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { initials } from '../domain/format';
import { makeStyles, MIN_TOUCH, type Palette, radii, spacing, type Tone, type, type TypeVariant, useTheme } from './theme';

// ── Texto ────────────────────────────────────────────────────────────────────

export type TxtProps = TextProps & {
  variant?: TypeVariant;
  color?: string;
  align?: TextStyle['textAlign'];
  style?: StyleProp<TextStyle>;
};

export function Txt({ variant = 'body', color, align, style, ...rest }: TxtProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Text
      {...rest}
      style={[type[variant], { color: color ?? colors.text }, align ? { textAlign: align } : null, variant === 'overline' && styles.upper, style]}
    />
  );
}

// ── Ícone ────────────────────────────────────────────────────────────────────

export type IconName = React.ComponentProps<typeof Feather>['name'];

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color?: string }) {
  const { colors } = useTheme();
  return <Feather name={name} size={size} color={color ?? colors.textSecondary} />;
}

// ── Botão ────────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success' | 'dangerOutline';

function buttonColors(colors: Palette): Record<ButtonVariant, { bg: string; fg: string; border: string }> {
  return {
    primary: { bg: colors.brand, fg: colors.onBrand, border: colors.brand },
    secondary: { bg: colors.brandSoft, fg: colors.brandText, border: colors.brandSoft },
    outline: { bg: colors.surface, fg: colors.text, border: colors.borderStrong },
    ghost: { bg: 'transparent', fg: colors.brandText, border: 'transparent' },
    danger: { bg: colors.danger, fg: colors.onBrand, border: colors.danger },
    success: { bg: colors.success, fg: colors.onBrand, border: colors.success },
    dangerOutline: { bg: colors.surface, fg: colors.danger, border: colors.dangerBorder },
  };
}

export type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  variant?: ButtonVariant;
  size?: 'md' | 'sm' | 'lg';
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  block?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading,
  block,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const { colors, isDark } = useTheme();
  const styles = useStyles();
  const palette = buttonColors(colors)[variant];
  const height = size === 'lg' ? 52 : size === 'sm' ? 38 : MIN_TOUCH;
  const isDisabled = disabled || loading;
  return (
    <Pressable
      // O Android não repinta o fundo de um Pressable com ripple quando a cor muda: troca de tema remonta.
      key={isDark ? 'dark' : 'light'}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      android_ripple={{ color: colors.ripple }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          minHeight: height,
          paddingHorizontal: size === 'sm' ? spacing.md : spacing.lg,
        },
        block && styles.block,
        isDisabled && styles.disabled,
        pressed && variant !== 'ghost' && styles.pressed,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} size="small" />
      ) : (
        <>
          {icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} color={palette.fg} /> : null}
          <Text
            numberOfLines={1}
            style={[size === 'sm' ? type.smallStrong : type.bodyStrong, { color: palette.fg }]}
          >
            {label}
          </Text>
          {iconRight ? <Icon name={iconRight} size={size === 'sm' ? 16 : 18} color={palette.fg} /> : null}
        </>
      )}
    </Pressable>
  );
}

/** Botão só com ícone (cabeçalho, ações de linha). Sempre com rótulo de acessibilidade. */
export function IconButton({
  name,
  label,
  onPress,
  color,
  size = 22,
  badge,
  style,
  disabled,
}: {
  name: IconName;
  label: string;
  onPress?: () => void;
  color?: string;
  size?: number;
  badge?: number;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      android_ripple={{ color: colors.ripple, borderless: true, radius: 22 }}
      style={[styles.iconButton, disabled && styles.disabled, style]}
    >
      <Icon name={name} size={size} color={color} />
      {badge && badge > 0 ? (
        <View style={styles.iconBadge}>
          <Text style={styles.iconBadgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

export function Card({
  children,
  onPress,
  style,
  padded = true,
  accessibilityLabel,
  accent,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  accessibilityLabel?: string;
  /** Faixa colorida à esquerda (cor da fase, aviso). */
  accent?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const content = (
    <>
      {accent ? <View style={[styles.cardAccent, { backgroundColor: accent }]} /> : null}
      {children}
    </>
  );
  const base = [styles.card, padded && styles.cardPadded, accent ? styles.cardWithAccent : null, style];
  if (!onPress) return <View style={base}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      android_ripple={{ color: colors.ripple }}
      style={({ pressed }) => [...base, pressed && styles.cardPressed]}
    >
      {content}
    </Pressable>
  );
}

// ── Etiqueta ─────────────────────────────────────────────────────────────────

export function Badge({
  label,
  tone = 'neutral',
  icon,
  dot,
  size = 'md',
  style,
}: {
  label: string;
  tone?: Tone;
  icon?: IconName;
  dot?: boolean;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}) {
  const { tones } = useTheme();
  const styles = useStyles();
  const palette = tones[tone];
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: palette.bg },
        size === 'sm' && { paddingHorizontal: 6, paddingVertical: 2 },
        style,
      ]}
    >
      {dot ? <View style={[styles.badgeDot, { backgroundColor: palette.fg }]} /> : null}
      {icon ? <Icon name={icon} size={size === 'sm' ? 11 : 12} color={palette.fg} /> : null}
      <Text numberOfLines={1} style={[size === 'sm' ? styles.badgeTextSm : styles.badgeText, { color: palette.fg }]}>
        {label}
      </Text>
    </View>
  );
}

// ── Avatar ───────────────────────────────────────────────────────────────────

export function Avatar({ name, size = 36, color }: { name: string | null | undefined; size?: number; color?: string }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color ?? colors.brand,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: colors.onBrand, fontWeight: '700', fontSize: size * 0.38 }}>{initials(name)}</Text>
    </View>
  );
}

// ── Barra de progresso ───────────────────────────────────────────────────────

export function ProgressBar({ percent, color, height = 6 }: { percent: number; color?: string; height?: number }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const width = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]}>
      <View style={{ width: `${width}%`, height, borderRadius: height / 2, backgroundColor: color ?? colors.brand }} />
    </View>
  );
}

// ── Seção e linhas ───────────────────────────────────────────────────────────

export function SectionHeader({ title, action, style }: { title: string; action?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.sectionHeader, style]}>
      <Txt variant="overline" color={colors.textMuted} style={{ flex: 1 }}>
        {title}
      </Txt>
      {action}
    </View>
  );
}

export function InfoRow({
  label,
  value,
  icon,
  last,
  valueColor,
  children,
}: {
  label: string;
  value?: string | null;
  icon?: IconName;
  last?: boolean;
  valueColor?: string;
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      {icon ? <Icon name={icon} size={16} color={colors.textMuted} /> : null}
      <Txt variant="small" color={colors.textMuted} style={styles.infoLabel}>
        {label}
      </Txt>
      {children ?? (
        <Txt variant="smallStrong" color={valueColor ?? colors.text} style={styles.infoValue} selectable>
          {value || '—'}
        </Txt>
      )}
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  return <View style={[styles.divider, style]} />;
}

/** Aviso em faixa (trava de fase, perfil sem acesso, aprovação esperando). */
export function Notice({
  tone = 'warning',
  icon,
  title,
  text,
  action,
}: {
  tone?: Tone;
  icon?: IconName;
  title?: string;
  text?: string;
  action?: React.ReactNode;
}) {
  const { tones } = useTheme();
  const styles = useStyles();
  const palette = tones[tone];
  return (
    <View style={[styles.notice, { backgroundColor: palette.bg }]} accessibilityRole="alert">
      {icon ? (
        <View style={{ paddingTop: 1 }}>
          <Icon name={icon} size={18} color={palette.fg} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        {title ? (
          <Txt variant="smallStrong" color={palette.fg}>
            {title}
          </Txt>
        ) : null}
        {text ? (
          <Txt variant="small" color={palette.fg}>
            {text}
          </Txt>
        ) : null}
        {action ? <View style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }}>{action}</View> : null}
      </View>
    </View>
  );
}

// ── Estados ──────────────────────────────────────────────────────────────────

export function EmptyState({
  icon = 'inbox',
  title,
  text,
  action,
}: {
  icon?: IconName;
  title: string;
  text?: string;
  action?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={26} color={colors.brandText} />
      </View>
      <Txt variant="heading" align="center">
        {title}
      </Txt>
      {text ? (
        <Txt variant="small" color={colors.textMuted} align="center">
          {text}
        </Txt>
      ) : null}
      {action ? <View style={{ marginTop: spacing.md }}>{action}</View> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon="wifi-off"
      title="Não deu para carregar"
      text={message ?? 'Verifique a conexão e tente de novo.'}
      action={onRetry ? <Button label="Tentar de novo" variant="secondary" icon="refresh-cw" onPress={onRetry} /> : undefined}
    />
  );
}

export function LoadingBlock({ label }: { label?: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.brandText} />
      {label ? (
        <Txt variant="small" color={colors.textMuted}>
          {label}
        </Txt>
      ) : null}
    </View>
  );
}

/** Placeholder cinza enquanto a lista carrega (evita a tela pular). */
export function SkeletonList({ count = 4, height = 88 }: { count?: number; height?: number }) {
  const styles = useStyles();
  return (
    <View style={{ gap: spacing.md }}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={[styles.skeleton, { height }]} />
      ))}
    </View>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    upper: { textTransform: 'uppercase' },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      borderRadius: radii.md,
      borderWidth: 1,
      overflow: 'hidden',
    },
    block: { alignSelf: 'stretch' },
    disabled: { opacity: 0.5 },
    pressed: { opacity: 0.9 },
    iconButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconBadge: {
      position: 'absolute',
      top: 4,
      right: 2,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 4,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.surface,
    },
    iconBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    cardPadded: { padding: spacing.lg },
    cardWithAccent: { paddingLeft: spacing.lg + 4 },
    cardAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
    cardPressed: { backgroundColor: colors.surfaceAlt },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderRadius: radii.pill,
      paddingHorizontal: 8,
      paddingVertical: 3,
      maxWidth: '100%',
    },
    badgeDot: { width: 6, height: 6, borderRadius: 3 },
    badgeText: { fontSize: 12, fontWeight: '700', flexShrink: 1 },
    badgeTextSm: { fontSize: 11, fontWeight: '700', flexShrink: 1 },
    track: { backgroundColor: colors.divider, overflow: 'hidden', alignSelf: 'stretch' },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.xxl,
      marginBottom: spacing.sm,
      minHeight: 24,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: 12,
    },
    infoRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    infoLabel: { flexShrink: 0, maxWidth: '45%' },
    infoValue: { flex: 1, textAlign: 'right' },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, alignSelf: 'stretch' },
    notice: {
      flexDirection: 'row',
      gap: spacing.sm,
      borderRadius: radii.md,
      padding: spacing.md,
    },
    empty: { alignItems: 'center', paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl, gap: spacing.sm },
    emptyIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.brandSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.xs,
    },
    loading: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxxl, gap: spacing.sm },
    skeleton: { backgroundColor: colors.skeleton, borderRadius: radii.lg },
  }),
);
