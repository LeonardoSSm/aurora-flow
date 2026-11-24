import { useQuery } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { fetchItemList } from '../api/endpoints';
import {
  previewItemOrderSettings,
  computeItemOrderTotals,
  formatCell,
  getItemOrderCellErrors,
  getItemOrderColumns,
  getItemOrderItems,
  getItemOrderTotalConfig,
  isItemOrderAnswer,
  newItemOrderAnswers,
  searchItemOrderItems,
  type CellValue,
  type InputColumn,
  type ItemOrderAnswer,
} from '../domain/item-order';
import { FieldShell, Input, YesNo } from '../ui/inputs';
import { Button, Icon, IconButton, LoadingBlock, Txt } from '../ui/primitives';
import { SelectSheet } from '../ui/select-sheet';
import { Sheet } from '../ui/sheet';
import { makeStyles, radii, spacing, useTheme } from '../ui/theme';
import type { FieldModel } from './FieldControl';

/**
 * "Pedido de itens": pesquisa na lista (nome ou código), adiciona e preenche as colunas do
 * formulário (ex.: Quantidade). Com total configurado, mostra subtotal por item e o total.
 */
export function ItemOrderField(props: {
  field: FieldModel;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  // Campo de fase chega sem os itens: carrega a lista e monta como o servidor montaria.
  const listId =
    getItemOrderItems(props.field.settings).length === 0 && typeof props.field.settings.itemListId === 'string'
      ? props.field.settings.itemListId
      : null;
  const list = useQuery({
    queryKey: ['item-list', listId],
    queryFn: () => fetchItemList(listId as string),
    enabled: Boolean(listId),
    staleTime: 60_000,
    retry: false,
  });
  const field = useMemo(
    () => (listId && list.data ? { ...props.field, settings: previewItemOrderSettings(props.field.settings, list.data) } : props.field),
    [listId, list.data, props.field],
  );
  if (listId && list.isLoading) return <LoadingBlock label="Carregando a lista de itens…" />;
  if (listId && list.isError) {
    return (
      <Txt variant="small" color={colors.danger}>
        Não foi possível carregar a lista de itens.
      </Txt>
    );
  }
  return <ItemOrderEditor {...props} field={field} />;
}

function ItemOrderEditor({
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
  const fieldLike = { required: field.required, settingsJson: field.settings };
  const answer: ItemOrderAnswer = isItemOrderAnswer(value) ? value : { kind: 'item_order', rows: [] };
  const items = getItemOrderItems(field.settings);
  const { sourceColumns, inputColumns } = getItemOrderColumns(field.settings);
  const totalConfig = getItemOrderTotalConfig(field.settings);
  const totals = computeItemOrderTotals(fieldLike, answer);
  const errors = getItemOrderCellErrors(fieldLike, answer);
  const itemByKey = useMemo(() => new Map(items.map((item) => [item.key, item])), [items]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchItemOrderItems(items, query), [items, query]);
  const added = new Set(answer.rows.map((row) => row.key));
  const extraColumns = sourceColumns.filter((column) => column.key !== 'name');

  if (items.length === 0) {
    return (
      <Txt variant="small" color={colors.textMuted}>
        A lista de itens deste campo está vazia.
      </Txt>
    );
  }

  function setRows(rows: ItemOrderAnswer['rows']) {
    onChange(rows.length > 0 ? { kind: 'item_order', rows } : null);
  }

  function addItem(key: string) {
    if (added.has(key)) return;
    setRows([...answer.rows, { key, answers: newItemOrderAnswers(inputColumns) }]);
    setQuery('');
    setSearchOpen(false);
  }

  function updateCell(key: string, columnId: string, cell: CellValue) {
    setRows(answer.rows.map((row) => (row.key === key ? { ...row, answers: { ...row.answers, [columnId]: cell } } : row)));
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {answer.rows.map((row) => {
        const item = itemByKey.get(row.key);
        const name = String(item?.values.name ?? 'Item fora da lista');
        const rowErrors = errors[row.key] ?? {};
        return (
          <View key={row.key} style={styles.row}>
            <View style={styles.rowHead}>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="bodyStrong">{name}</Txt>
                {extraColumns.length > 0 ? (
                  <Txt variant="caption" color={colors.textMuted}>
                    {extraColumns.map((column) => `${column.label}: ${formatCell(item?.values[column.key] ?? null, column.type)}`).join(' · ')}
                  </Txt>
                ) : null}
              </View>
              {!disabled ? (
                <IconButton
                  name="trash-2"
                  label={`Remover ${name}`}
                  color={colors.danger}
                  size={18}
                  onPress={() => setRows(answer.rows.filter((r) => r.key !== row.key))}
                />
              ) : null}
            </View>
            {inputColumns.map((column) => (
              <CellField
                key={column.id}
                column={column}
                value={row.answers[column.id]}
                error={rowErrors[column.id]}
                disabled={disabled}
                onChange={(cell) => updateCell(row.key, column.id, cell)}
              />
            ))}
            {totals && totals.subtotals[row.key] !== undefined ? (
              <View style={styles.subtotal}>
                <Txt variant="caption" color={colors.textMuted}>
                  Subtotal
                </Txt>
                <Txt variant="smallStrong">{formatCell(totals.subtotals[row.key], totalConfig?.type ?? 'number')}</Txt>
              </View>
            ) : null}
          </View>
        );
      })}

      {!disabled ? (
        <Button
          label={answer.rows.length === 0 ? 'Adicionar item' : 'Adicionar outro item'}
          icon="plus"
          variant="secondary"
          onPress={() => setSearchOpen(true)}
        />
      ) : null}

      {totals && answer.rows.length > 0 ? (
        <View style={styles.total}>
          <Txt variant="bodyStrong">Total do pedido</Txt>
          <Txt variant="heading" color={colors.brandText}>
            {formatCell(totals.total, totalConfig?.type ?? 'number')}
          </Txt>
        </View>
      ) : null}

      <Sheet visible={searchOpen} onClose={() => setSearchOpen(false)} title="Adicionar item" subtitle={`${items.length} itens na lista`}>
        <Input icon="search" placeholder="Nome ou código do item" value={query} onChangeText={setQuery} autoFocus autoCorrect={false} />
        <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
          {query.trim() === '' ? (
            <Txt variant="small" color={colors.textMuted} align="center" style={{ paddingVertical: spacing.lg }}>
              Digite para buscar na lista.
            </Txt>
          ) : results.length === 0 ? (
            <Txt variant="small" color={colors.textMuted} align="center" style={{ paddingVertical: spacing.lg }}>
              Nenhum item encontrado.
            </Txt>
          ) : (
            results.map((item) => {
              const isAdded = added.has(item.key);
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="button"
                  disabled={isAdded}
                  onPress={() => addItem(item.key)}
                  style={[styles.result, isAdded && { opacity: 0.5 }]}
                >
                  <View style={{ flex: 1 }}>
                    <Txt variant="bodyStrong">{String(item.values.name ?? item.key)}</Txt>
                    {extraColumns.length > 0 ? (
                      <Txt variant="caption" color={colors.textMuted}>
                        {extraColumns.map((column) => formatCell(item.values[column.key] ?? null, column.type)).join(' · ')}
                      </Txt>
                    ) : null}
                  </View>
                  <Icon name={isAdded ? 'check' : 'plus-circle'} size={22} color={isAdded ? colors.success : colors.brandText} />
                </Pressable>
              );
            })
          )}
        </View>
      </Sheet>
    </View>
  );
}

function CellField({
  column,
  value,
  error,
  disabled,
  onChange,
}: {
  column: InputColumn;
  value: CellValue | undefined;
  error?: string;
  disabled?: boolean;
  onChange: (value: CellValue) => void;
}) {
  const [text, setText] = useState(typeof value === 'number' ? String(value).replace('.', ',') : typeof value === 'string' ? value : '');
  let control: React.ReactNode;
  switch (column.type) {
    case 'number':
    case 'currency':
      control = (
        <Input
          value={text}
          editable={!disabled}
          invalid={!!error}
          keyboardType="decimal-pad"
          placeholder="0"
          onChangeText={(next) => {
            setText(next);
            if (next.trim() === '') return onChange(null);
            const num = Number(next.replace(/\./g, '').replace(',', '.'));
            onChange(Number.isFinite(num) ? num : next);
          }}
        />
      );
      break;
    case 'checkbox':
      control = <YesNo value={value === true} onChange={onChange} disabled={disabled} />;
      break;
    case 'select':
      control = (
        <SelectSheet
          title={column.label}
          options={(column.options ?? []).map((option) => ({ value: option, label: option }))}
          value={typeof value === 'string' ? value : null}
          onChange={(next) => onChange(typeof next === 'string' ? next : null)}
          invalid={!!error}
          disabled={disabled}
        />
      );
      break;
    default:
      control = (
        <Input
          value={typeof value === 'string' ? value : ''}
          editable={!disabled}
          invalid={!!error}
          multiline={column.type === 'long_text'}
          placeholder={column.type === 'date' ? 'AAAA-MM-DD' : ''}
          onChangeText={onChange}
        />
      );
  }
  return (
    <FieldShell label={column.label} required={column.required} help={column.helpText} error={error}>
      {control}
    </FieldShell>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    row: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      padding: spacing.md,
      gap: spacing.md,
      backgroundColor: colors.surface,
    },
    rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    subtotal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    total: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: colors.brandTint,
    },
    result: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 56,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
  }),
);
