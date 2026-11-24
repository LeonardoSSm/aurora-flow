import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Not, Repository } from 'typeorm';
import {
  KanbanPhaseEntity,
  KanbanPhaseFieldValueEntity,
  SolicitationEntity,
  SubmissionItemEntity,
} from '../../database/entities';
import { readSolicitationFormFieldValues } from '../flows/lib/flow-field-values';
import {
  canSeeCardInPhase,
  cardVisibilityFieldCodes,
  normalizeCardVisibility,
} from '../kanban-phases/phase-card-visibility';
import type { AccessActor, ProcessGrants } from './process-access.service';

/** O que o filtro lê do card: a fase em que está, de onde vêm as respostas e de quem é. */
export type CardFilterTarget = Pick<
  SolicitationEntity,
  'id' | 'formId' | 'currentPhaseId' | 'submissionId' | 'metadata' | 'createdBy' | 'assigneeId'
>;

/** Resposta do card para um código de campo (formulário > valor de fluxo > campo de fase). */
export type CardAnswerLookup = (card: CardFilterTarget, fieldCode: string) => unknown;

/** O card é da pessoa (ela abriu ou é a responsável): o filtro da fase não esconde dela. */
export function ownsCard(card: Pick<CardFilterTarget, 'createdBy' | 'assigneeId'>, actorId: string): boolean {
  return card.createdBy === actorId || card.assigneeId === actorId;
}

/** Fase em que o card está: a gravada, ou a primeira quando não há (ou foi apagada). */
function phaseOfCard(card: CardFilterTarget, phases: KanbanPhaseEntity[]): KanbanPhaseEntity | undefined {
  return phases.find((phase) => phase.id === card.currentPhaseId) ?? phases[0];
}

/**
 * Filtro de cards da fase pela resposta ("Configurações da fase" no Kanban), como regra de acesso:
 * card escondido de alguém some do quadro, do painel, da lista de Solicitações, de Respostas e não abre
 * por link. Não esconde de quem configura as fases do processo, nem o card que a pessoa abriu ou do
 * qual é responsável.
 */
@Injectable()
export class CardFilterService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(KanbanPhaseEntity)
    private readonly phasesRepository: Repository<KanbanPhaseEntity>,
    @InjectRepository(KanbanPhaseFieldValueEntity)
    private readonly phaseFieldValuesRepository: Repository<KanbanPhaseFieldValueEntity>,
  ) {}

  /**
   * Respostas que o filtro precisa ler, com a mesma precedência do "Valor do card": resposta do
   * formulário, depois o valor dado por um fluxo, por último o campo de fase. Só busca para os cards
   * cuja fase (devolvida por `phaseOf`) tem filtro, e só os campos que as regras usam. `null` quando
   * nenhum card precisa (nada a filtrar).
   */
  async loadAnswers<T extends CardFilterTarget>(
    cards: T[],
    phaseOf: (card: T) => KanbanPhaseEntity | undefined,
  ): Promise<CardAnswerLookup | null> {
    const codesByCard = new Map<string, string[]>();
    for (const card of cards) {
      const phase = phaseOf(card);
      const codes = phase ? cardVisibilityFieldCodes(phase) : [];
      if (codes.length) codesByCard.set(card.id, codes);
    }
    if (codesByCard.size === 0) return null;
    const filtered = cards.filter((card) => codesByCard.has(card.id));
    const codes = [...new Set([...codesByCard.values()].flat())];
    const ids = filtered.map((card) => card.id);
    const submissionIds = filtered.map((card) => card.submissionId).filter((id): id is string => !!id);
    const [phaseValues, formItems] = await Promise.all([
      this.phaseFieldValuesRepository.find({ where: { solicitationId: In(ids), fieldCode: In(codes) } }),
      submissionIds.length
        ? this.dataSource
            .getRepository(SubmissionItemEntity)
            .find({ where: { submissionId: In(submissionIds), fieldCode: In(codes) } })
        : Promise.resolve([]),
    ]);
    type AnswerItem = Pick<SubmissionItemEntity, 'valueText' | 'valueNumber' | 'valueBoolean' | 'valueJson'>;
    const raw = (item: AnswerItem): unknown =>
      item.valueText ?? item.valueNumber ?? item.valueBoolean ?? item.valueJson ?? null;
    const key = (owner: string, code: string): string => `${owner}|${code}`;
    const fromPhase = new Map((phaseValues ?? []).map((item) => [key(item.solicitationId, item.fieldCode), raw(item)]));
    const fromForm = new Map((formItems ?? []).map((item) => [key(item.submissionId, item.fieldCode), raw(item)]));
    const present = (value: unknown): boolean =>
      value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0);

    return (card, fieldCode) => {
      const form = card.submissionId ? fromForm.get(key(card.submissionId, fieldCode)) : undefined;
      if (present(form)) return form;
      const flow = readSolicitationFormFieldValues(card.metadata)[fieldCode];
      if (present(flow)) return flow;
      return fromPhase.get(key(card.id, fieldCode)) ?? null;
    };
  }

  /**
   * O card aparece para a pessoa na fase em que está? `seesAll` = configura as fases do processo.
   * `answerOf` vem de `loadAnswers` (null = nenhuma fase com filtro).
   */
  shows(
    phase: KanbanPhaseEntity,
    card: CardFilterTarget,
    actor: AccessActor,
    seesAll: boolean,
    answerOf: CardAnswerLookup | null,
  ): boolean {
    if (!answerOf || seesAll || ownsCard(card, actor.sub)) return true;
    return canSeeCardInPhase(phase, actor, false, (code) => answerOf(card, code));
  }

  /** O filtro da fase esconde ESTE card da pessoa? Card sem processo nunca é escondido. */
  async hides(card: CardFilterTarget, actor: AccessActor, grants: ProcessGrants): Promise<boolean> {
    if (!card.id || !card.formId) return false;
    if (ownsCard(card, actor.sub) || grants.scope(card.formId, 'kanban_phases.manage') !== 'none') return false;
    const phases =
      (await this.phasesRepository.find({ where: { formId: card.formId }, order: { order: 'ASC' } })) ?? [];
    const phase = phaseOfCard(card, phases);
    if (!phase || !normalizeCardVisibility(phase.cardVisibility)) return false;
    const answerOf = await this.loadAnswers([card], () => phase);
    return !this.shows(phase, card, actor, false, answerOf);
  }

  /**
   * Cards que o filtro esconde da pessoa (para as listas: Solicitações e Respostas), com a resposta de
   * que nasceram. Só olha processos com fase filtrada em que a pessoa não configura as fases;
   * `formId` restringe a um processo.
   */
  async hiddenCards(
    actor: AccessActor,
    grants: ProcessGrants,
    formId?: string,
  ): Promise<Array<Pick<CardFilterTarget, 'id' | 'submissionId'>>> {
    const filteredPhases =
      (await this.phasesRepository.find({
        where: { cardVisibility: Not(IsNull()), ...(formId ? { formId } : {}) },
      })) ?? [];
    const formIds = [
      ...new Set(
        filteredPhases
          .filter((phase) => grants.scope(phase.formId, 'kanban_phases.manage') === 'none')
          .filter((phase) => this.mayHide(phase, actor))
          .map((phase) => phase.formId),
      ),
    ];
    if (formIds.length === 0) return [];

    const [phases, cards] = await Promise.all([
      this.phasesRepository.find({ where: { formId: In(formIds) }, order: { order: 'ASC' } }),
      this.dataSource
        .getRepository(SolicitationEntity)
        .createQueryBuilder('solicitation')
        .select([
          'solicitation.id',
          'solicitation.formId',
          'solicitation.currentPhaseId',
          'solicitation.submissionId',
          'solicitation.metadata',
          'solicitation.createdBy',
          'solicitation.assigneeId',
        ])
        .where('solicitation.form_id IN (:...cardFilterFormIds)', { cardFilterFormIds: formIds })
        // O próprio card a pessoa sempre vê.
        .andWhere('(solicitation.created_by IS DISTINCT FROM :cardFilterActor)', { cardFilterActor: actor.sub })
        .andWhere('(solicitation.assignee_id IS DISTINCT FROM :cardFilterActor)', { cardFilterActor: actor.sub })
        .getMany(),
    ]);
    const phasesByForm = new Map<string, KanbanPhaseEntity[]>();
    for (const phase of phases) {
      const list = phasesByForm.get(phase.formId);
      if (list) list.push(phase);
      else phasesByForm.set(phase.formId, [phase]);
    }
    const phaseOf = (card: CardFilterTarget): KanbanPhaseEntity | undefined =>
      phaseOfCard(card, phasesByForm.get(card.formId as string) ?? []);
    const answerOf = await this.loadAnswers(cards, phaseOf);
    if (!answerOf) return [];
    return cards
      .filter((card) => {
        const phase = phaseOf(card);
        return phase && !this.shows(phase, card, actor, false, answerOf);
      })
      .map((card) => ({ id: card.id, submissionId: card.submissionId }));
  }

  /** A fase pode esconder algo da pessoa? Quem não está em regra e "vê todos" não perde nada. */
  private mayHide(phase: KanbanPhaseEntity, actor: AccessActor): boolean {
    const config = normalizeCardVisibility(phase.cardVisibility);
    if (!config) return false;
    const inSomeRule = config.rules.some(
      (rule) => rule.roleCodes.includes(actor.role) || rule.userIds.includes(actor.sub),
    );
    return inSomeRule || !config.othersSeeAll;
  }
}
