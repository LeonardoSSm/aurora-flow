import { IsNull, type EntityManager } from 'typeorm';
import {
  SolicitationPhasePeriodEntity,
  type KanbanPhaseEntity,
  type SolicitationEntity,
} from '../../database/entities';
import { computePhaseDueAt, hasPhaseSla } from '../kanban-phases/phase-sla';

type PhaseLike = Pick<
  KanbanPhaseEntity,
  'id' | 'label' | 'slaHours' | 'slaBusinessHours' | 'slaWarningPercent' | 'isTerminal'
>;

/** Quando o card entrou na fase atual: a última mudança de fase, ou a criação. */
export function phaseEnteredAtOf(solicitation: Pick<SolicitationEntity, 'phaseEnteredAt' | 'createdAt'>): Date {
  return solicitation.phaseEnteredAt ?? solicitation.createdAt;
}

/**
 * Vencimento do prazo da fase atual: a prorrogação, se houve; senão, o prazo configurado na fase
 * contado da entrada — assim, mudar o prazo da fase vale na hora para os cards que estão nela.
 */
export function effectivePhaseDueAt(
  solicitation: Pick<SolicitationEntity, 'phaseEnteredAt' | 'createdAt' | 'phaseDueAt'>,
  phase: PhaseLike | null | undefined,
): Date | null {
  if (!phase || !hasPhaseSla(phase)) return null;
  return solicitation.phaseDueAt ?? computePhaseDueAt(phaseEnteredAtOf(solicitation), phase);
}

/**
 * Mudança de fase na linha do tempo: fecha a passagem pela fase anterior (com o prazo que valia) e
 * abre a da nova. Card que nunca teve passagem gravada (criado antes do SLA por fase, ou ainda na
 * 1ª fase) ganha a passagem anterior a partir da entrada conhecida. Zera o prazo e o aviso da fase
 * no card — a nova fase começa do zero.
 */
export async function recordPhaseChange(
  manager: EntityManager,
  input: {
    solicitation: SolicitationEntity;
    from: PhaseLike | null;
    to: PhaseLike;
    now: Date;
  },
): Promise<void> {
  const { solicitation, from, to, now } = input;
  const repo = manager.getRepository(SolicitationPhasePeriodEntity);

  if (from) {
    const open = await repo.findOne({
      where: { solicitationId: solicitation.id, leftAt: IsNull() },
      order: { enteredAt: 'DESC' },
    });
    const dueAt = effectivePhaseDueAt(solicitation, from);
    if (open) {
      await repo.save({ ...open, leftAt: now, dueAt });
    } else {
      await repo.save(
        repo.create({
          solicitationId: solicitation.id,
          phaseId: from.id,
          phaseLabel: from.label,
          enteredAt: phaseEnteredAtOf(solicitation),
          leftAt: now,
          dueAt,
          slaBusinessHours: from.slaBusinessHours ?? false,
          extended: Boolean(solicitation.phaseDueAt),
        }),
      );
    }
  }

  await repo.save(
    repo.create({
      solicitationId: solicitation.id,
      phaseId: to.id,
      phaseLabel: to.label,
      enteredAt: now,
      leftAt: null,
      dueAt: hasPhaseSla(to) ? computePhaseDueAt(now, to) : null,
      slaBusinessHours: to.slaBusinessHours ?? false,
      extended: false,
    }),
  );

  solicitation.phaseEnteredAt = now;
  solicitation.phaseDueAt = null;
  solicitation.phaseSlaStatus = null;
}
