import React from 'react';
import { StyleSheet, View } from 'react-native';
import { productTableColumns, type ProductTableRow } from '../domain/form-runtime';
import { Input } from '../ui/inputs';
import { Txt } from '../ui/primitives';
import { makeStyles, radii, spacing, useTheme } from '../ui/theme';
import type { FieldModel } from './FieldControl';

/**
 * "Tabela de produtos": um cartão por produto (lista fixa do construtor), com as colunas que quem
 * responde preenche. Colunas do criador aparecem só para leitura.
 */
export function ProductTableField({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FieldModel;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const rows = Array.isArray(value) ? (value as ProductTableRow[]) : [];
  const columns = productTableColumns({ settingsJson: field.settings } as never);
  const presets = field.settings.productTableProductValues as Record<string, Record<string, string | number>> | undefined;
  const options = field.rawOptions ?? field.options.map((o, index) => ({ id: o.value, internalValue: o.value, displayLabel: o.label, order: index }));

  if (options.length === 0) {
    return (
      <Txt variant="small" color={colors.textMuted}>
        Nenhum produto foi configurado para este campo.
      </Txt>
    );
  }

  const rowValues = (product: string) => rows.find((row) => row.produto === product)?.values ?? {};

  function update(product: string, column: string, cell: string | number | null) {
    const next: ProductTableRow[] = options.map((option) => {
      const current = { ...rowValues(option.displayLabel) };
      if (option.displayLabel === product) {
        if (cell === null || cell === '') delete current[column];
        else current[column] = cell;
      }
      return { produto: option.displayLabel, values: current };
    });
    onChange(next);
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {options.map((option) => (
        <View key={option.id} style={styles.card}>
          <Txt variant="bodyStrong">{option.displayLabel}</Txt>
          {columns.map((column) => {
            if (column.filledBy === 'creator') {
              const preset = presets?.[option.internalValue]?.[column.id];
              return (
                <View key={column.id} style={styles.row}>
                  <Txt variant="small" color={colors.textMuted} style={{ flex: 1 }}>
                    {column.label}
                  </Txt>
                  <Txt variant="smallStrong">{preset ?? '—'}</Txt>
                </View>
              );
            }
            const cell = rowValues(option.displayLabel)[column.label];
            return (
              <View key={column.id} style={styles.row}>
                <Txt variant="small" color={colors.textSecondary} style={{ flex: 1 }}>
                  {column.label}
                </Txt>
                <Input
                  containerStyle={styles.cellInput}
                  value={cell === null || cell === undefined ? '' : String(cell).replace('.', column.type === 'number' ? ',' : '.')}
                  editable={!disabled}
                  keyboardType={column.type === 'number' ? 'decimal-pad' : 'default'}
                  placeholder={column.type === 'number' ? '0' : ''}
                  accessibilityLabel={`${option.displayLabel}: ${column.label}`}
                  onChangeText={(text) => {
                    if (column.type !== 'number') return update(option.displayLabel, column.label, text);
                    if (text.trim() === '') return update(option.displayLabel, column.label, null);
                    const num = Number(text.replace(',', '.'));
                    if (!Number.isNaN(num)) update(option.displayLabel, column.label, num);
                  }}
                />
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    card: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      padding: spacing.md,
      gap: spacing.sm,
      backgroundColor: colors.surface,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    cellInput: { width: 120, minHeight: 44 },
  }),
);
