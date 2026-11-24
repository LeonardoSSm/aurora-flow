import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { ResponseUi } from '../domain/responses';
import { Badge, Txt } from '../ui/primitives';
import { makeStyles, radii, spacing, useTheme } from '../ui/theme';

/** Uma resposta na tela: texto, Sim/Não, opções marcadas ou tabela (produtos, pedido, ERP). */
export function ResponseValueView({ ui }: { ui: ResponseUi }) {
  const { colors } = useTheme();
  const styles = useStyles();
  switch (ui.type) {
    case 'badge':
      return <Badge label={ui.text} tone={ui.positive ? 'success' : 'neutral'} style={{ alignSelf: 'flex-start' }} />;
    case 'chips':
      return (
        <View style={styles.chips}>
          {ui.chips.map((chip, index) => (
            <Badge key={`${chip}-${index}`} label={chip} tone="brand" />
          ))}
        </View>
      );
    case 'lines':
      return (
        <View style={{ gap: 2 }}>
          {ui.lines.map((line, index) => (
            <Txt key={index} variant="small">
              {line}
            </Txt>
          ))}
        </View>
      );
    case 'table':
      return (
        <View style={{ gap: spacing.sm }}>
          {ui.rows.map((row, index) => (
            <View key={index} style={styles.tableRow}>
              <Txt variant="smallStrong">{row.label}</Txt>
              {ui.columns.map((column, ci) =>
                row.cells[ci] && row.cells[ci] !== '—' ? (
                  <View key={column} style={styles.cell}>
                    <Txt variant="caption" color={colors.textMuted} style={{ flex: 1 }}>
                      {column}
                    </Txt>
                    <Txt variant="smallStrong">{row.cells[ci]}</Txt>
                  </View>
                ) : null,
              )}
            </View>
          ))}
          {ui.total ? (
            <View style={[styles.cell, styles.total]}>
              <Txt variant="smallStrong" style={{ flex: 1 }}>
                Total
              </Txt>
              <Txt variant="heading" color={colors.brandText}>
                {ui.total}
              </Txt>
            </View>
          ) : null}
        </View>
      );
    default:
      return (
        <Txt variant="body" selectable>
          {ui.text}
        </Txt>
      );
  }
}

/** Tabela larga (muitas colunas) com rolagem lateral — reservado para relatórios futuros. */
export function WideTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator>
      <View>
        <View style={styles.wideRow}>
          {columns.map((column) => (
            <Txt key={column} variant="caption" color={colors.textMuted} style={styles.wideCell}>
              {column}
            </Txt>
          ))}
        </View>
        {rows.map((row, index) => (
          <View key={index} style={styles.wideRow}>
            {row.map((cell, ci) => (
              <Txt key={ci} variant="small" style={styles.wideCell}>
                {cell}
              </Txt>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    tableRow: { backgroundColor: colors.surfaceAlt, borderRadius: radii.sm, padding: spacing.sm, gap: 4 },
    cell: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    total: { paddingHorizontal: spacing.sm },
    wideRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    wideCell: { width: 120, padding: spacing.xs },
  }),
);
