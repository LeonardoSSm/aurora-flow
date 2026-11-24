import React, { forwardRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Icon, Txt, type IconName } from './primitives';
import { makeStyles, MIN_TOUCH, radii, spacing, useTheme } from './theme';

/** Rótulo + ajuda + erro em volta de qualquer controle — mesmo desenho em formulário e fase. */
export function FieldShell({
  label,
  required,
  help,
  error,
  children,
  style,
}: {
  label?: string;
  required?: boolean;
  help?: string | null;
  error?: string | null;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.shell, style]}>
      {label ? (
        <Txt variant="smallStrong" color={colors.text}>
          {label}
          {required ? <Txt variant="smallStrong" color={colors.danger}>{' *'}</Txt> : null}
        </Txt>
      ) : null}
      {help ? (
        <Txt variant="caption" color={colors.textMuted}>
          {help}
        </Txt>
      ) : null}
      {children}
      {error ? (
        <View style={styles.errorRow} accessibilityLiveRegion="polite">
          <Icon name="alert-circle" size={14} color={colors.danger} />
          <Txt variant="caption" color={colors.danger} style={{ flex: 1 }}>
            {error}
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

export type InputProps = TextInputProps & {
  invalid?: boolean;
  icon?: IconName;
  trailing?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
};

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { invalid, icon, trailing, containerStyle, style, multiline, onFocus, onBlur, editable = true, ...rest },
  ref,
) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[
        styles.inputBox,
        multiline && styles.inputBoxMulti,
        focused && styles.inputFocused,
        invalid && styles.inputInvalid,
        !editable && styles.inputDisabled,
        containerStyle,
      ]}
    >
      {icon ? <Icon name={icon} size={18} color={colors.textMuted} /> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textFaint}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        editable={editable}
        style={[styles.input, multiline && styles.inputMulti, style]}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        {...rest}
      />
      {trailing}
    </View>
  );
});

/** Campo que abre algo ao tocar (data, lista suspensa): parece um input, age como botão. */
export function PickerTrigger({
  value,
  placeholder,
  onPress,
  icon = 'chevron-down',
  invalid,
  disabled,
  accessibilityLabel,
}: {
  value: string | null;
  placeholder: string;
  onPress: () => void;
  icon?: IconName;
  invalid?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? placeholder}
      accessibilityValue={value ? { text: value } : undefined}
      onPress={onPress}
      disabled={disabled}
      style={[styles.inputBox, invalid && styles.inputInvalid, disabled && styles.inputDisabled]}
    >
      <Txt variant="body" color={value ? colors.text : colors.textFaint} style={{ flex: 1 }} numberOfLines={2}>
        {value ?? placeholder}
      </Txt>
      <Icon name={icon} size={18} color={colors.textMuted} />
    </Pressable>
  );
}

/** Opção de escolha única/múltipla em lista (rádio ou caixa). */
export function ChoiceRow({
  label,
  selected,
  multiple,
  onPress,
  disabled,
}: {
  label: string;
  selected: boolean;
  multiple?: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole={multiple ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: selected, disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={[styles.choice, selected && styles.choiceSelected]}
    >
      <View
        style={[
          multiple ? styles.checkbox : styles.radio,
          selected && (multiple ? styles.checkboxOn : styles.radioOn),
        ]}
      >
        {selected ? (
          multiple ? <Icon name="check" size={14} color="#fff" /> : <View style={styles.radioDot} />
        ) : null}
      </View>
      <Txt variant="body" style={{ flex: 1 }}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** Sim / Não grande, para caixa de seleção de checklist (melhor que um switch pequeno no campo). */
export function YesNo({
  value,
  onChange,
  disabled,
}: {
  value: boolean | null | undefined;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.segment}>
      {[
        { label: 'Sim', v: true, icon: 'check' as const },
        { label: 'Não', v: false, icon: 'x' as const },
      ].map((item) => {
        const on = value === item.v;
        return (
          <Pressable
            key={item.label}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled: !!disabled }}
            onPress={() => onChange(item.v)}
            disabled={disabled}
            style={[styles.segmentItem, on && styles.segmentOn]}
          >
            <Icon name={item.icon} size={16} color={on ? colors.brandText : colors.textMuted} />
            <Txt variant="bodyStrong" color={on ? colors.brandText : colors.textSecondary}>
              {item.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Abas em pílula (Lista/Kanban, filtros de status). Rola na horizontal quando não cabe. */
export function Chips<T extends string>({
  items,
  value,
  onChange,
  style,
}: {
  items: ReadonlyArray<{ value: T; label: string; count?: number; color?: string }>;
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={style} contentContainerStyle={styles.chips}>
      {items.map((item) => {
        const on = item.value === value;
        return (
          <Pressable
            key={item.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(item.value)}
            style={[styles.chip, on && styles.chipOn]}
          >
            {item.color ? <View style={[styles.chipDot, { backgroundColor: item.color }]} /> : null}
            <Txt variant="smallStrong" color={on ? colors.onBrand : colors.textSecondary} numberOfLines={1}>
              {item.label}
            </Txt>
            {item.count !== undefined ? (
              <View style={[styles.chipCount, on && styles.chipCountOn]}>
                <Txt variant="caption" color={on ? colors.brandText : colors.textSecondary} style={{ fontWeight: '700' }}>
                  {item.count}
                </Txt>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Controle segmentado de largura total (2–3 opções). */
export function Segmented<T extends string>({
  items,
  value,
  onChange,
}: {
  items: ReadonlyArray<{ value: T; label: string; icon?: IconName }>;
  value: T;
  onChange: (value: T) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.segment}>
      {items.map((item) => {
        const on = item.value === value;
        return (
          <Pressable
            key={item.value}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: on }}
            onPress={() => onChange(item.value)}
            style={[styles.segmentItem, on && styles.segmentOn]}
          >
            {item.icon ? <Icon name={item.icon} size={16} color={on ? colors.brandText : colors.textMuted} /> : null}
            <Txt variant="smallStrong" color={on ? colors.brandText : colors.textSecondary}>
              {item.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    shell: { gap: 6 },
    errorRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    inputBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: MIN_TOUCH,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
    },
    inputBoxMulti: { alignItems: 'flex-start', paddingVertical: spacing.sm },
    inputFocused: { borderColor: colors.brand, borderWidth: 1.5 },
    inputInvalid: { borderColor: colors.danger },
    inputDisabled: { backgroundColor: colors.surfaceAlt },
    input: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 10 },
    inputMulti: { minHeight: 96, paddingVertical: 4 },
    choice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: MIN_TOUCH,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    choiceSelected: { borderColor: colors.brand, backgroundColor: colors.brandTint },
    radio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioOn: { borderColor: colors.brand },
    radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxOn: { backgroundColor: colors.brand, borderColor: colors.brand },
    segment: {
      flexDirection: 'row',
      backgroundColor: colors.track,
      borderRadius: radii.md,
      padding: 3,
      gap: 3,
    },
    segmentItem: {
      flex: 1,
      minHeight: 42,
      borderRadius: radii.sm + 2,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    segmentOn: {
      backgroundColor: colors.raised,
      shadowColor: '#0F172A',
      shadowOpacity: 0.08,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 1 },
      elevation: 1,
    },
    chips: { gap: spacing.sm, paddingVertical: 2, paddingRight: spacing.lg },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 38,
      paddingHorizontal: spacing.md,
      borderRadius: radii.pill,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
    chipDot: { width: 8, height: 8, borderRadius: 4 },
    chipCount: {
      minWidth: 22,
      paddingHorizontal: 6,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.divider,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipCountOn: { backgroundColor: colors.surface },
  }),
);
