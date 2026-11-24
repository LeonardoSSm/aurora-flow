import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { apiErrorMessage } from '../../api/client';
import { useAddComment, useComments, useHandoffs, useHistory, usePhaseTimeline } from '../../api/queries';
import type { HistoryEvent, Solicitation } from '../../api/types';
import { useAuth } from '../../context/auth-context';
import { formatDateTime, formatDuration, statusMeta, timeAgo } from '../../domain/format';
import { Input, Segmented } from '../../ui/inputs';
import { Avatar, Badge, Button, Card, Icon, LoadingBlock, SectionHeader, Txt } from '../../ui/primitives';
import { makeStyles, radii, spacing, useTheme } from '../../ui/theme';
import { useToast } from '../../ui/toast';
import { useNavigation } from '@react-navigation/native';

const EVENT_LABEL: Record<string, string> = {
  created: 'Solicitação criada',
  comment: 'Comentário adicionado',
  assignee_changed: 'Responsável alterado',
  priority_changed: 'Prioridade alterada',
  phase_changed: 'Mudou de fase',
  phase_approval_requested: 'Aprovação da fase pedida',
  phase_approval_approved: 'Fase aprovada',
  phase_approval_rejected: 'Fase reprovada',
  phase_sla_extended: 'Prazo da fase prorrogado',
  phase_advance_blocked: 'Tentativa de avançar barrada',
  forwarded: 'Encaminhada para outro processo',
  proposal_sent: 'Proposta enviada',
  proposal_approved: 'Proposta aprovada',
  proposal_rejected: 'Proposta reprovada',
};

const EVENT_ICON: Record<string, 'plus-circle' | 'message-circle' | 'user' | 'flag' | 'arrow-right-circle' | 'check-circle' | 'x-circle' | 'clock' | 'send' | 'lock' | 'activity'> = {
  created: 'plus-circle',
  comment: 'message-circle',
  assignee_changed: 'user',
  priority_changed: 'flag',
  phase_changed: 'arrow-right-circle',
  phase_approval_requested: 'send',
  phase_approval_approved: 'check-circle',
  phase_approval_rejected: 'x-circle',
  phase_sla_extended: 'clock',
  phase_advance_blocked: 'lock',
  forwarded: 'send',
};

function eventText(event: HistoryEvent): string {
  if (event.message) return event.message;
  if (event.eventType === 'status_changed' && event.toValue) return `Status: ${statusMeta(event.toValue).label}`;
  return EVENT_LABEL[event.eventType] ?? event.eventType;
}

/** Conversa (comentários) e o histórico do card, com o tempo em cada fase e os encaminhamentos. */
export function ActivityPanel({ solicitation }: { solicitation: Solicitation }) {
  const [view, setView] = useState<'comments' | 'history'>('comments');
  return (
    <View style={{ gap: spacing.lg }}>
      <Segmented
        items={[
          { value: 'comments', label: 'Comentários', icon: 'message-circle' },
          { value: 'history', label: 'Histórico', icon: 'clock' },
        ]}
        value={view}
        onChange={setView}
      />
      {view === 'comments' ? <Comments solicitation={solicitation} /> : <History solicitation={solicitation} />}
    </View>
  );
}

function Comments({ solicitation }: { solicitation: Solicitation }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const toast = useToast();
  const { can, user } = useAuth();
  const comments = useComments(solicitation.id);
  const add = useAddComment(solicitation.id);
  const [draft, setDraft] = useState('');
  const [internal, setInternal] = useState(false);
  const canInternal = can('comments.view_internal', solicitation.formId);

  async function send() {
    const content = draft.trim();
    if (!content) return;
    try {
      await add.mutateAsync({ content, isInternal: internal });
      setDraft('');
    } catch (error) {
      toast({ title: 'Não foi possível comentar', description: apiErrorMessage(error, 'Tente de novo.'), variant: 'error' });
    }
  }

  return (
    <View style={{ gap: spacing.md }}>
      <Card style={{ gap: spacing.sm }}>
        <Input value={draft} onChangeText={setDraft} placeholder="Escreva um comentário…" multiline />
        <View style={styles.composerRow}>
          {canInternal ? (
            <Button
              label={internal ? 'Interno (só a equipe)' : 'Visível ao solicitante'}
              icon={internal ? 'lock' : 'globe'}
              size="sm"
              variant="ghost"
              onPress={() => setInternal((v) => !v)}
            />
          ) : (
            <View />
          )}
          <Button label="Enviar" icon="send" size="sm" disabled={!draft.trim()} loading={add.isPending} onPress={() => void send()} />
        </View>
      </Card>

      {comments.isLoading ? (
        <LoadingBlock />
      ) : (comments.data?.length ?? 0) === 0 ? (
        <Txt variant="small" color={colors.textMuted} align="center" style={{ paddingVertical: spacing.lg }}>
          Ninguém comentou ainda.
        </Txt>
      ) : (
        [...comments.data!]
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .map((comment) => {
            const mine = comment.authorUserId === user?.id;
            const author = comment.authorName ?? (mine ? user?.fullName : null) ?? (comment.authorType === 'requester' ? 'Solicitante' : 'Equipe');
            return (
              <View key={comment.id} style={[styles.bubbleRow, mine && { flexDirection: 'row-reverse' }]}>
                <Avatar name={author} size={32} color={comment.authorType === 'requester' ? '#0E7490' : colors.brand} />
                <View style={[styles.bubble, mine && styles.bubbleMine, comment.isInternal && styles.bubbleInternal]}>
                  <View style={styles.bubbleHead}>
                    <Txt variant="smallStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {author}
                    </Txt>
                    {comment.isInternal ? <Badge label="Interno" tone="warning" icon="lock" size="sm" /> : null}
                  </View>
                  <Txt variant="body" selectable>
                    {comment.content}
                  </Txt>
                  <Txt variant="caption" color={colors.textMuted}>
                    {timeAgo(comment.createdAt)}
                  </Txt>
                </View>
              </View>
            );
          })
      )}
    </View>
  );
}

function History({ solicitation }: { solicitation: Solicitation }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const navigation = useNavigation();
  const history = useHistory(solicitation.id);
  const timeline = usePhaseTimeline(solicitation.id, Boolean(solicitation.formId));
  const handoffs = useHandoffs(solicitation.id);
  const links = handoffs.data;

  return (
    <View style={{ gap: spacing.md }}>
      {links && (links.source || links.forwarded.length > 0) ? (
        <Card style={{ gap: spacing.sm }}>
          {links.source ? (
            <HandoffRow
              label="Veio de"
              title={links.source.title}
              process={links.source.formName}
              onPress={() => navigation.navigate('Card', { solicitationId: links.source!.id, title: links.source!.title })}
            />
          ) : null}
          {links.forwarded.map((item) => (
            <HandoffRow
              key={item.id}
              label="Encaminhada para"
              title={item.title}
              process={item.formName}
              onPress={() => navigation.navigate('Card', { solicitationId: item.id, title: item.title })}
            />
          ))}
        </Card>
      ) : null}

      {(timeline.data?.length ?? 0) > 0 ? (
        <>
          <SectionHeader title="Tempo em cada fase" style={{ marginTop: 0 }} />
          <Card style={{ gap: spacing.sm }}>
            {timeline.data!.map((entry, index) => {
              const tone =
                entry.status === 'late' || entry.status === 'breached'
                  ? 'danger'
                  : entry.status === 'warning'
                    ? 'warning'
                    : entry.status === 'no_sla'
                      ? 'neutral'
                      : 'success';
              return (
                <View key={`${entry.phaseId}-${index}`} style={styles.timelineRow}>
                  <View style={[styles.dot, entry.current && styles.dotCurrent]} />
                  <View style={{ flex: 1 }}>
                    <Txt variant="smallStrong">{entry.phaseLabel}</Txt>
                    <Txt variant="caption" color={colors.textMuted}>
                      {formatDateTime(entry.enteredAt)}
                      {entry.leftAt ? ` → ${formatDateTime(entry.leftAt)}` : ' · agora'}
                    </Txt>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <Txt variant="smallStrong">{formatDuration(entry.durationMinutes)}</Txt>
                    {entry.status !== 'no_sla' ? (
                      <Badge
                        label={tone === 'danger' ? 'Fora do prazo' : tone === 'warning' ? 'Em risco' : 'No prazo'}
                        tone={tone}
                        size="sm"
                      />
                    ) : null}
                  </View>
                </View>
              );
            })}
          </Card>
        </>
      ) : null}

      <SectionHeader title="Histórico" style={{ marginTop: spacing.sm }} />
      {history.isLoading ? (
        <LoadingBlock />
      ) : (
        <Card style={{ gap: 0 }}>
          {(history.data ?? []).length === 0 ? (
            <Txt variant="small" color={colors.textMuted}>
              Sem eventos.
            </Txt>
          ) : (
            history.data!.map((event, index) => (
              <View key={event.id} style={styles.event}>
                <View style={styles.eventRail}>
                  <View style={styles.eventIcon}>
                    <Icon name={EVENT_ICON[event.eventType] ?? 'activity'} size={14} color={colors.brandText} />
                  </View>
                  {index < history.data!.length - 1 ? <View style={styles.eventLine} /> : null}
                </View>
                <View style={{ flex: 1, paddingBottom: spacing.md, gap: 2 }}>
                  <Txt variant="small">{eventText(event)}</Txt>
                  <Txt variant="caption" color={colors.textMuted}>
                    {event.actor?.fullName ?? 'Sistema'} · {formatDateTime(event.createdAt)}
                  </Txt>
                </View>
              </View>
            ))
          )}
        </Card>
      )}
    </View>
  );
}

function HandoffRow({ label, title, process, onPress }: { label: string; title: string; process: string | null; onPress: () => void }) {
  return (
    <Button
      label={`${label}: ${title}${process ? ` (${process})` : ''}`}
      variant="ghost"
      icon={label === 'Veio de' ? 'corner-up-left' : 'corner-down-right'}
      onPress={onPress}
      style={{ justifyContent: 'flex-start', paddingHorizontal: 0 }}
    />
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    composerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    bubbleRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
    bubble: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      borderTopLeftRadius: 4,
      padding: spacing.md,
      gap: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    bubbleMine: { backgroundColor: colors.brandTint, borderTopLeftRadius: radii.lg, borderTopRightRadius: 4 },
    bubbleInternal: { borderColor: '#FCD34D', borderWidth: 1 },
    bubbleHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    timelineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 4 },
    dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.borderStrong },
    dotCurrent: { backgroundColor: colors.brand },
    event: { flexDirection: 'row', gap: spacing.md },
    eventRail: { alignItems: 'center', width: 28 },
    eventIcon: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.brandSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    eventLine: { flex: 1, width: 2, backgroundColor: colors.divider, marginVertical: 2 },
  }),
);
