import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { apiErrorMessage } from '../api/client';
import { useDecideStep } from '../api/queries';
import type { Approval, ApprovalStep } from '../api/types';
import { approvalStatusMeta, formatDateTime } from '../domain/format';
import { FieldShell, Input } from '../ui/inputs';
import { Badge, Button, Icon, Txt } from '../ui/primitives';
import { Sheet } from '../ui/sheet';
import { makeStyles, radii, spacing, useTheme } from '../ui/theme';
import { useToast } from '../ui/toast';

function stepWho(step: ApprovalStep): string {
  if (step.assignedUser) return step.assignedUser.fullName;
  if (step.assignedRole) return `Perfil ${step.assignedRole.name}`;
  if (step.assignedRoleCode) return `Perfil ${step.assignedRoleCode}`;
  if (step.assignedEmail) return step.assignedEmail;
  return 'Aprovador';
}

/** Quem aprova, em que ordem e o que cada um decidiu (com o comentário). */
export function ApprovalStepsList({ steps }: { steps: ApprovalStep[] }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const ordered = [...steps].sort((a, b) => a.order - b.order);
  return (
    <View style={{ gap: spacing.sm }}>
      {ordered.map((step) => {
        const meta = approvalStatusMeta(step.status);
        const icon = step.status === 'approved' ? 'check-circle' : step.status === 'rejected' ? 'x-circle' : 'clock';
        const color =
          step.status === 'approved' ? colors.success : step.status === 'rejected' ? colors.danger : colors.warning;
        return (
          <View key={step.id} style={styles.step}>
            <Icon name={icon} size={18} color={color} />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="smallStrong">{stepWho(step)}</Txt>
              {step.decision ? (
                <Txt variant="caption" color={colors.textMuted}>
                  {meta.label} em {formatDateTime(step.decision.decidedAt)}
                </Txt>
              ) : (
                <Txt variant="caption" color={colors.textMuted}>
                  {meta.label}
                </Txt>
              )}
              {step.decision?.comment ? (
                <Txt variant="small" color={colors.textSecondary}>
                  “{step.decision.comment}”
                </Txt>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function ApprovalStatusBadge({ approval }: { approval: Approval | null }) {
  if (!approval) return <Badge label="Não solicitada" tone="neutral" />;
  const meta = approvalStatusMeta(approval.status);
  return <Badge label={approval.status === 'pending' ? 'Aguardando aprovação' : meta.label} tone={meta.tone} dot />;
}

/**
 * Decidir uma etapa: Aprovar ou Reprovar, com comentário (obrigatório para reprovar, como o
 * motivo que o solicitante recebe).
 */
export function DecisionButtons({
  stepId,
  solicitationId,
  onDecided,
}: {
  stepId: string;
  solicitationId?: string;
  onDecided?: (decision: 'approved' | 'rejected') => void;
}) {
  const styles = useStyles();
  const toast = useToast();
  const decide = useDecideStep(solicitationId);
  const [mode, setMode] = useState<'approved' | 'rejected' | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!mode) return;
    if (mode === 'rejected' && !comment.trim()) {
      setError('Conte o motivo da reprovação.');
      return;
    }
    try {
      await decide.mutateAsync({ stepId, decision: mode, comment });
      toast({ title: mode === 'approved' ? 'Aprovado' : 'Reprovado', variant: 'success' });
      setMode(null);
      setComment('');
      onDecided?.(mode);
    } catch (err) {
      setError(apiErrorMessage(err, 'Não foi possível registrar a decisão.'));
    }
  }

  return (
    <>
      <View style={styles.buttons}>
        <Button label="Reprovar" icon="x" variant="dangerOutline" onPress={() => setMode('rejected')} style={{ flex: 1 }} />
        <Button label="Aprovar" icon="check" variant="success" onPress={() => setMode('approved')} style={{ flex: 1 }} />
      </View>
      <Sheet
        visible={mode !== null}
        onClose={() => {
          setMode(null);
          setError(null);
        }}
        title={mode === 'approved' ? 'Aprovar' : 'Reprovar'}
        subtitle={mode === 'approved' ? 'O comentário é opcional.' : 'Quem pediu vai ver o motivo.'}
        footer={
          <Button
            label={mode === 'approved' ? 'Confirmar aprovação' : 'Confirmar reprovação'}
            variant={mode === 'approved' ? 'success' : 'danger'}
            loading={decide.isPending}
            onPress={() => void confirm()}
            style={{ flex: 1 }}
          />
        }
      >
        <FieldShell label="Comentário" required={mode === 'rejected'} error={error}>
          <Input
            value={comment}
            onChangeText={(text) => {
              setComment(text);
              setError(null);
            }}
            multiline
            placeholder={mode === 'approved' ? 'Algo a acrescentar?' : 'Por que está reprovando?'}
            autoFocus
          />
        </FieldShell>
      </Sheet>
    </>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    step: {
      flexDirection: 'row',
      gap: spacing.sm,
      alignItems: 'flex-start',
      padding: spacing.sm,
      borderRadius: radii.sm,
      backgroundColor: colors.surfaceAlt,
    },
    buttons: { flexDirection: 'row', gap: spacing.sm },
  }),
);
