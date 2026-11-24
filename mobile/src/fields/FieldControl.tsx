import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { ChoiceRow, FieldShell, Input, PickerTrigger, YesNo } from '../ui/inputs';
import { Badge, Icon, Notice, Txt } from '../ui/primitives';
import { SelectSheet } from '../ui/select-sheet';
import { makeStyles, radii, spacing, useTheme } from '../ui/theme';
import { formatCalculatedValue } from '../utils/formula';
import { maskCep, maskCnpj, maskCpf, maskPhone } from '../utils/validators';
import { ItemOrderField } from './ItemOrderField';
import { ProductTableField } from './ProductTableField';

/**
 * Um campo de formulário ou de fase, já com rótulo, ajuda e erro. Mesmo desenho e mesmos formatos
 * de valor do web (data `AAAA-MM-DD`, hora `HH:MM`, data e hora `AAAA-MM-DDTHH:MM`, moeda
 * `R$ 1.500,00`), para o que o app grava ser igual ao que o portal grava.
 */

export type FieldModel = {
  id: string;
  code: string;
  label: string;
  fieldType: string;
  required: boolean;
  settings: Record<string, unknown>;
  options: Array<{ value: string; label: string }>;
  help?: string | null;
  /** Opções completas (produto da tabela de produtos precisa do id interno e do rótulo). */
  rawOptions?: Array<{ id: string; internalValue: string; displayLabel: string; order: number }>;
};

type Props = {
  field: FieldModel;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string | null;
  disabled?: boolean;
  /** "Cálculo": o número já calculado (o valor não fica no estado). */
  calculated?: number | null;
  /** Cálculo de fase tem formato fixo (R$ ou horas). */
  calculatedSettings?: Record<string, unknown>;
};

const pad = (n: number) => String(n).padStart(2, '0');

function toDateValue(date: Date, mode: 'date' | 'time' | 'datetime'): string {
  const d = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const t = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (mode === 'date') return d;
  if (mode === 'time') return t;
  return `${d}T${t}`;
}

/** Lê o que está gravado (inclusive o ISO com fuso que o app antigo mandava). */
function parseDateValue(value: unknown, mode: 'date' | 'time' | 'datetime'): Date | null {
  if (typeof value !== 'string' || !value) return null;
  if (mode === 'time') {
    const m = /^(\d{2}):(\d{2})/.exec(value);
    if (!m) return null;
    const d = new Date();
    d.setHours(Number(m[1]), Number(m[2]), 0, 0);
    return d;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value);
  if (m && !/Z|[+-]\d{2}:?\d{2}$/.test(value)) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0));
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateDisplay(date: Date, mode: 'date' | 'time' | 'datetime'): string {
  const d = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
  const t = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (mode === 'date') return d;
  if (mode === 'time') return t;
  return `${d} às ${t}`;
}

function DateField({ field, value, onChange, invalid, disabled }: { field: FieldModel; value: unknown; onChange: (v: unknown) => void; invalid: boolean; disabled?: boolean }) {
  const { colors } = useTheme();
  const mode = field.fieldType === 'time' ? 'time' : field.fieldType === 'datetime' ? 'datetime' : 'date';
  const current = parseDateValue(value, mode);
  const [iosOpen, setIosOpen] = useState(false);
  const minDate = typeof field.settings.minDate === 'string' ? parseDateValue(field.settings.minDate, 'date') : null;
  const maxDate = typeof field.settings.maxDate === 'string' ? parseDateValue(field.settings.maxDate, 'date') : null;

  function open() {
    const base = current ?? new Date();
    if (Platform.OS === 'android') {
      const pickTime = (day: Date) =>
        DateTimePickerAndroid.open({
          value: day,
          mode: 'time',
          is24Hour: true,
          onChange: (event, picked) => {
            if (event.type === 'set' && picked) onChange(toDateValue(picked, mode));
          },
        });
      if (mode === 'time') {
        pickTime(base);
        return;
      }
      DateTimePickerAndroid.open({
        value: base,
        mode: 'date',
        minimumDate: minDate ?? undefined,
        maximumDate: maxDate ?? undefined,
        onChange: (event, picked) => {
          if (event.type !== 'set' || !picked) return;
          if (mode === 'datetime') {
            const withTime = new Date(picked);
            withTime.setHours(base.getHours(), base.getMinutes(), 0, 0);
            pickTime(withTime);
          } else {
            onChange(toDateValue(picked, 'date'));
          }
        },
      });
      return;
    }
    setIosOpen(true);
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <PickerTrigger
        value={current ? formatDateDisplay(current, mode) : null}
        placeholder={mode === 'date' ? 'Escolher data' : mode === 'time' ? 'Escolher horário' : 'Escolher data e hora'}
        icon={mode === 'time' ? 'clock' : 'calendar'}
        onPress={open}
        invalid={invalid}
        disabled={disabled}
        accessibilityLabel={field.label}
      />
      {iosOpen ? (
        <DateTimePicker
          value={current ?? new Date()}
          mode={mode}
          display="spinner"
          locale="pt-BR"
          minimumDate={minDate ?? undefined}
          maximumDate={maxDate ?? undefined}
          onChange={(event: DateTimePickerEvent, picked?: Date) => {
            if (event.type === 'dismissed') setIosOpen(false);
            if (picked) onChange(toDateValue(picked, mode));
          }}
        />
      ) : null}
      {current && !field.required && !disabled ? (
        <Pressable accessibilityRole="button" onPress={() => onChange(null)} hitSlop={8} style={{ alignSelf: 'flex-start' }}>
          <Txt variant="caption" color={colors.brandText}>
            Limpar
          </Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Número: o texto fica livre enquanto digita (vírgula ou ponto); vai número para o valor. */
function NumberInput({ value, onChange, invalid, disabled, placeholder }: { value: unknown; onChange: (v: unknown) => void; invalid: boolean; disabled?: boolean; placeholder?: string }) {
  const [text, setText] = useState(() => (typeof value === 'number' ? String(value).replace('.', ',') : typeof value === 'string' ? value : ''));
  useEffect(() => {
    const parsed = Number(text.replace(/\./g, '').replace(',', '.'));
    if (typeof value === 'number' && value !== parsed) setText(String(value).replace('.', ','));
    if ((value === null || value === undefined || value === '') && text !== '' && Number.isFinite(parsed)) setText('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Input
      value={text}
      editable={!disabled}
      invalid={invalid}
      keyboardType="decimal-pad"
      placeholder={placeholder ?? '0'}
      onChangeText={(next) => {
        const clean = next.replace(/[^\d,.-]/g, '');
        setText(clean);
        if (clean.trim() === '') return onChange(null);
        const parsed = Number(clean.replace(/\./g, '').replace(',', '.'));
        onChange(Number.isFinite(parsed) ? parsed : clean);
      }}
    />
  );
}

/** Moeda como no web: "R$ 1.500,00" (digita só números; os centavos entram da direita). */
function maskCurrency(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
  if (!digits) return '';
  const cents = digits.padStart(3, '0');
  const int = cents.slice(0, -2);
  const dec = cents.slice(-2);
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${intFmt},${dec}`;
}

function currencyInitial(value: unknown): string {
  if (typeof value === 'number') return maskCurrency(value.toFixed(2).replace('.', ''));
  if (typeof value === 'string' && value) {
    // "R$ 1.500,00", "1500,00" ou "1500.5" (gravado como número em texto).
    if (/^\d+(\.\d+)?$/.test(value)) return maskCurrency(Number(value).toFixed(2).replace('.', ''));
    return maskCurrency(value);
  }
  return '';
}

function ScalePicker({ max, value, onChange, stars, disabled }: { max: number; value: unknown; onChange: (v: number) => void; stars?: boolean; disabled?: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const current = typeof value === 'number' ? value : Number(value) || 0;
  return (
    <View style={styles.scaleRow} accessibilityRole="radiogroup">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => {
        const on = stars ? n <= current : n === current;
        return (
          <Pressable
            key={n}
            accessibilityRole="radio"
            accessibilityLabel={`${n}`}
            accessibilityState={{ checked: n === current, disabled: !!disabled }}
            disabled={disabled}
            onPress={() => onChange(n)}
            style={[stars ? styles.star : styles.scaleBtn, !stars && on && styles.scaleOn]}
          >
            {stars ? (
              <MaterialCommunityIcons name={on ? 'star' : 'star-outline'} size={32} color={on ? '#F59E0B' : colors.borderStrong} />
            ) : (
              <Txt variant="bodyStrong" color={on ? colors.onBrand : colors.textSecondary}>
                {n}
              </Txt>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

export function FieldControl({ field, value, onChange, error, disabled, calculated, calculatedSettings }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const invalid = Boolean(error);
  const help = field.help ?? (typeof field.settings.helpText === 'string' ? field.settings.helpText : null);

  if (field.fieldType === 'title') {
    return (
      <View style={styles.titleBlock}>
        <Txt variant="heading">{field.label}</Txt>
        {help ? (
          <Txt variant="small" color={colors.textMuted}>
            {help}
          </Txt>
        ) : null}
      </View>
    );
  }
  if (field.fieldType === 'description') {
    return (
      <Txt variant="body" color={colors.textSecondary}>
        {field.label}
      </Txt>
    );
  }
  if (field.fieldType === 'divider') return <View style={styles.divider} />;

  const control = (() => {
    switch (field.fieldType) {
      case 'calculated': {
        const text = formatCalculatedValue(calculated ?? null, calculatedSettings ?? field.settings);
        return (
          <View style={styles.calculated}>
            <Icon name="cpu" size={18} color={colors.brandText} />
            <Txt variant={text ? 'heading' : 'small'} color={text ? colors.text : colors.textMuted} style={{ flex: 1 }}>
              {text || 'Preencha os campos usados no cálculo'}
            </Txt>
          </View>
        );
      }
      case 'long_text':
        return (
          <Input
            value={typeof value === 'string' ? value : ''}
            onChangeText={onChange}
            multiline
            editable={!disabled}
            invalid={invalid}
            placeholder="Escreva sua resposta"
          />
        );
      case 'email':
        return (
          <Input
            value={typeof value === 'string' ? value : ''}
            onChangeText={(t) => onChange(t.trim())}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!disabled}
            invalid={invalid}
            placeholder="email@dominio.com"
          />
        );
      case 'phone':
      case 'cpf':
      case 'cnpj':
      case 'cep': {
        const mask = { phone: maskPhone, cpf: maskCpf, cnpj: maskCnpj, cep: maskCep }[field.fieldType]!;
        const placeholder = { phone: '(11) 99999-9999', cpf: '000.000.000-00', cnpj: '00.000.000/0000-00', cep: '00000-000' }[field.fieldType];
        return (
          <Input
            value={typeof value === 'string' ? value : ''}
            onChangeText={(t) => onChange(mask(t))}
            keyboardType={field.fieldType === 'phone' ? 'phone-pad' : 'number-pad'}
            editable={!disabled}
            invalid={invalid}
            placeholder={placeholder}
          />
        );
      }
      case 'number':
        return <NumberInput value={value} onChange={onChange} invalid={invalid} disabled={disabled} />;
      case 'currency':
        return (
          <Input
            value={currencyInitial(value)}
            onChangeText={(t) => onChange(maskCurrency(t))}
            keyboardType="number-pad"
            editable={!disabled}
            invalid={invalid}
            placeholder="R$ 0,00"
          />
        );
      case 'date':
      case 'time':
      case 'datetime':
        return <DateField field={field} value={value} onChange={onChange} invalid={invalid} disabled={disabled} />;
      case 'checkbox':
        return <YesNo value={typeof value === 'boolean' ? value : null} onChange={onChange} disabled={disabled} />;
      case 'single_select': {
        const dropdown = field.settings.displayAs === 'dropdown' || field.options.length > 7;
        if (dropdown) {
          return (
            <SelectSheet
              title={field.label}
              options={field.options}
              value={typeof value === 'string' ? value : null}
              onChange={onChange}
              invalid={invalid}
              disabled={disabled}
            />
          );
        }
        return (
          <View style={{ gap: spacing.sm }} accessibilityRole="radiogroup">
            {field.options.map((option) => (
              <ChoiceRow
                key={option.value}
                label={option.label}
                selected={value === option.value}
                disabled={disabled}
                onPress={() => onChange(value === option.value && !field.required ? null : option.value)}
              />
            ))}
          </View>
        );
      }
      case 'multi_select': {
        const selected = Array.isArray(value) ? (value as string[]) : [];
        const dropdown = field.settings.displayAs === 'dropdown' || field.options.length > 7;
        if (dropdown) {
          return (
            <SelectSheet
              title={field.label}
              options={field.options}
              value={selected}
              onChange={onChange}
              multiple
              invalid={invalid}
              disabled={disabled}
            />
          );
        }
        return (
          <View style={{ gap: spacing.sm }}>
            {field.options.map((option) => {
              const on = selected.includes(option.value);
              return (
                <ChoiceRow
                  key={option.value}
                  multiple
                  label={option.label}
                  selected={on}
                  disabled={disabled}
                  onPress={() => onChange(on ? selected.filter((v) => v !== option.value) : [...selected, option.value])}
                />
              );
            })}
          </View>
        );
      }
      case 'scale':
      case 'rating': {
        const max = typeof field.settings.max === 'number' && field.settings.max > 0 ? field.settings.max : 5;
        return <ScalePicker max={max} value={value} onChange={onChange} stars={field.fieldType === 'rating'} disabled={disabled} />;
      }
      case 'product_table':
        return <ProductTableField field={field} value={value} onChange={onChange} disabled={disabled} />;
      case 'item_order':
        return <ItemOrderField field={field} value={value} onChange={onChange} disabled={disabled} />;
      case 'erp_lookup':
      case 'erp_table':
        return (
          <Notice
            tone="info"
            icon="monitor"
            text="Este campo consulta o ERP na hora e, por enquanto, só pode ser preenchido pelo portal web."
          />
        );
      case 'short_text':
      default:
        return (
          <Input
            value={typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''}
            onChangeText={onChange}
            editable={!disabled}
            invalid={invalid}
            placeholder="Sua resposta"
            maxLength={typeof field.settings.maxLength === 'number' ? field.settings.maxLength : undefined}
          />
        );
    }
  })();

  return (
    <FieldShell label={field.label} required={field.required && field.fieldType !== 'calculated'} help={help} error={error}>
      {control}
    </FieldShell>
  );
}

export function WebOnlyBadge() {
  return <Badge label="Só no portal" tone="info" icon="monitor" size="sm" />;
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    titleBlock: { gap: 2, paddingTop: spacing.sm },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
    calculated: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 48,
      borderRadius: radii.md,
      backgroundColor: colors.brandTint,
      borderWidth: 1,
      borderColor: colors.brandSoft,
      paddingHorizontal: spacing.md,
    },
    scaleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    scaleBtn: {
      minWidth: 44,
      height: 44,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.sm,
    },
    scaleOn: { backgroundColor: colors.brand, borderColor: colors.brand },
    star: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  }),
);
