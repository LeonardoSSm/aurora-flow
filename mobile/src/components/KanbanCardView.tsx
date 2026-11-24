import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { CardDisplay, CardIndicator, KanbanCard } from '../api/types';
import { formatCurrency, formatDate, formatDuration, phaseSlaLabel, priorityMeta, shortCode, slaMeta, timeAgo } from '../domain/format';
import { Avatar, Badge, Card, Icon, Txt } from '../ui/primitives';
import { makeStyles, type Palette, radii, spacing, useTheme } from '../ui/theme';

/** O card de sempre (padrão do sistema) — quando a fase não manda o "Personalizar card". */
const DEFAULT_DISPLAY: CardDisplay = {
  indicators: ['process', 'priority', 'value', 'sla', 'phase_sla', 'assignee', 'updated_at'],
  fields: [],
};

function priorityAccent(colors: Palette): Record<string, string> {
  return { urgent: colors.danger, high: '#F59E0B', medium: colors.brand, low: '#94A3B8' };
}

/**
 * Card do Kanban como o web desenha: o que aparece segue o "Personalizar card" da fase (ajuste da
 * pessoa > padrão da fase > padrão do sistema), inclusive os campos escolhidos do processo.
 */
export function KanbanCardView({
  card,
  display,
  myApprovalPending,
  onPress,
  showProcess,
  hideProcess,
}: {
  card: KanbanCard;
  display?: CardDisplay | null;
  myApprovalPending?: boolean;
  onPress: () => void;
  /** Força a etiqueta do processo (listas que misturam processos). */
  showProcess?: boolean;
  /** Dentro do quadro de um processo a etiqueta só repete o título da tela. */
  hideProcess?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const shown = display ?? DEFAULT_DISPLAY;
  const show = (key: CardIndicator) => shown.indicators.includes(key);
  const priority = priorityMeta(card.priority);
  const sla = slaMeta(card.slaStatus ?? null);
  const fields = card.fields ?? [];
  const showProcessTag = ((show('process') && !hideProcess) || showProcess) && Boolean(card.formName);
  const showPriority = show('priority') && (card.priority === 'urgent' || card.priority === 'high');
  const topRow = card.hasIntegrationError || show('number') || showProcessTag || showPriority;

  const meta: Array<{ icon: 'calendar' | 'clock'; text: string }> = [];
  if (show('created_at') && card.createdAt) meta.push({ icon: 'calendar', text: `Aberta em ${formatDate(card.createdAt)}` });
  if (show('time_in_phase') && card.phaseEnteredAt) {
    meta.push({ icon: 'clock', text: `Na fase há ${formatDuration((Date.now() - new Date(card.phaseEnteredAt).getTime()) / 60_000)}` });
  }

  return (
    <Card
      onPress={onPress}
      accent={show('priority') ? priorityAccent(colors)[card.priority] : undefined}
      accessibilityLabel={`${card.title}. ${show('priority') ? `Prioridade ${priority.label}.` : ''}`}
      style={styles.card}
    >
      {topRow ? (
      <View style={styles.topRow}>
        {card.hasIntegrationError ? <Icon name="alert-triangle" size={14} color={colors.warning} /> : null}
        {show('number') ? (
          <Txt variant="caption" color={colors.textMuted} style={styles.mono}>
            {shortCode(card.id)}
          </Txt>
        ) : null}
        {((show('process') && !hideProcess) || showProcess) && card.formName ? (
          <View style={styles.process}>
            <Txt variant="caption" color={colors.textSecondary} numberOfLines={1}>
              {card.formName}
            </Txt>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        {show('priority') && (card.priority === 'urgent' || card.priority === 'high') ? (
          <Badge label={priority.label} tone={priority.tone} size="sm" />
        ) : null}
      </View>
      ) : null}

      {myApprovalPending ? <Badge label="Sua aprovação pendente" tone="warning" icon="check-circle" size="sm" style={{ alignSelf: 'flex-start' }} /> : null}

      <Txt variant="bodyStrong" numberOfLines={3}>
        {card.title}
      </Txt>

      {show('requester') && card.requesterName ? (
        <View style={styles.inline}>
          <Icon name="user" size={13} color={colors.textMuted} />
          <Txt variant="caption" color={colors.textSecondary} numberOfLines={1}>
            {card.requesterName}
          </Txt>
        </View>
      ) : null}

      {show('value') && typeof card.value === 'number' ? (
        <Txt variant="heading">{formatCurrency(card.value)}</Txt>
      ) : null}

      {fields.length > 0 ? (
        <View style={styles.fields}>
          {fields.map((field) => (
            <View key={field.code} style={styles.fieldRow}>
              <Txt variant="caption" color={colors.textMuted} numberOfLines={1} style={styles.fieldLabel}>
                {field.label}
              </Txt>
              <Txt variant="caption" color={colors.text} numberOfLines={2} style={styles.fieldValue}>
                {field.text}
              </Txt>
            </View>
          ))}
        </View>
      ) : null}

      {(show('sla') && card.slaDueAt) || (show('phase_sla') && card.phaseSla) ? (
        <View style={styles.badges}>
          {show('sla') && card.slaDueAt && sla ? (
            <Badge label={`${sla.label} · ${formatDate(card.slaDueAt)}`} tone={sla.tone} icon="flag" size="sm" />
          ) : null}
          {show('phase_sla') && card.phaseSla ? (
            <Badge
              label={phaseSlaLabel(card.phaseSla.minutesRemaining)}
              tone={card.phaseSla.state === 'breached' ? 'danger' : card.phaseSla.state === 'warning' ? 'warning' : 'success'}
              icon="clock"
              size="sm"
            />
          ) : null}
        </View>
      ) : null}

      {meta.length > 0 ? (
        <View style={styles.badges}>
          {meta.map((item) => (
            <View key={item.text} style={styles.inline}>
              <Icon name={item.icon} size={12} color={colors.textMuted} />
              <Txt variant="caption" color={colors.textMuted}>
                {item.text}
              </Txt>
            </View>
          ))}
        </View>
      ) : null}

      {show('assignee') || show('updated_at') ? (
        <View style={styles.footer}>
          {show('assignee') ? (
            card.responsibleName ? (
              <View style={styles.inline}>
                <Avatar name={card.responsibleName} size={22} />
                <Txt variant="caption" color={colors.textSecondary} numberOfLines={1}>
                  {card.responsibleName}
                </Txt>
              </View>
            ) : (
              <Txt variant="caption" color={colors.textFaint}>
                Sem responsável
              </Txt>
            )
          ) : (
            <View />
          )}
          {show('updated_at') ? (
            <Txt variant="caption" color={colors.textMuted}>
              {timeAgo(card.updatedAt)}
            </Txt>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    card: { gap: spacing.sm, padding: spacing.md },
    topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 18 },
    mono: { fontVariant: ['tabular-nums'], fontWeight: '700' },
    process: {
      backgroundColor: colors.divider,
      borderRadius: radii.sm,
      paddingHorizontal: 6,
      paddingVertical: 2,
      flexShrink: 1,
    },
    inline: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
    fields: { backgroundColor: colors.surfaceAlt, borderRadius: radii.sm, padding: spacing.sm, gap: 4 },
    fieldRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'baseline' },
    fieldLabel: { maxWidth: '45%' },
    fieldValue: { flex: 1, fontWeight: '600' },
    badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingTop: spacing.sm,
    },
  }),
);
