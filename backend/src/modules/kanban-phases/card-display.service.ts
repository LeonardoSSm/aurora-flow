import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import {
  FormFieldEntity,
  FormVersionEntity,
  KanbanPhaseEntity,
  KanbanPhaseFieldEntity,
  KanbanPhaseFieldValueEntity,
  SolicitationEntity,
  SubmissionItemEntity,
  UserKanbanCardDisplayEntity,
} from '../../database/entities';
import type { KanbanCardDisplay } from '../../database/entities/kanban-phase.entity';
import { readSolicitationFormFieldValues } from '../flows/lib/flow-field-values';
import {
  CARD_DISPLAY_EXCLUDED_TYPES,
  effectiveCardDisplay,
  formatCardFieldValue,
  normalizeCardDisplay,
  type CardDisplaySource,
  type CardFieldMeta,
  type KanbanCardFieldValue,
} from './card-display';

/** Um campo do processo que pode ir para o card (lista do editor). */
export type CardDisplayFieldOption = {
  code: string;
  label: string;
  fieldType: string;
  phaseLabel: string | null;
};

/** Tudo o que o editor "Personalizar card" de uma fase precisa. */
export type PhaseCardDisplayView = {
  phaseId: string;
  /** Padrão da fase (null = padrão do sistema). */
  phaseDefault: KanbanCardDisplay | null;
  /** Ajuste da pessoa (null = segue o padrão da fase). */
  personal: KanbanCardDisplay | null;
  effective: KanbanCardDisplay;
  source: CardDisplaySource;
  fields: CardDisplayFieldOption[];
};


/** O que se lê do card para achar as respostas dele. */
type CardAnswerSource = Pick<SolicitationEntity, 'id' | 'submissionId' | 'metadata'>;

@Injectable()
export class CardDisplayService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(KanbanPhaseEntity)
    private readonly phasesRepository: Repository<KanbanPhaseEntity>,
    @InjectRepository(UserKanbanCardDisplayEntity)
    private readonly personalRepository: Repository<UserKanbanCardDisplayEntity>,
  ) {}

  /**
   * Campos que podem aparecer no card: os do formulário (versão mais nova) e depois os das fases;
   * num código repetido o do formulário ganha, como no "Valor do card" e nos fluxos.
   */
  async fieldCatalog(formId: string): Promise<CardFieldMeta[]> {
    const [version, phaseFields] = await Promise.all([
      this.dataSource.getRepository(FormVersionEntity).findOne({
        where: { formId },
        order: { versionNumber: 'DESC' },
        select: { id: true },
      }),
      this.dataSource.getRepository(KanbanPhaseFieldEntity).find({
        where: { phase: { formId } },
        relations: { phase: true },
        order: { phase: { order: 'ASC' }, order: 'ASC' },
      }),
    ]);
    const formFields = version
      ? await this.dataSource.getRepository(FormFieldEntity).find({
          where: { formVersionId: version.id },
          relations: { options: true, section: true },
          order: { section: { order: 'ASC' }, order: 'ASC' },
        })
      : [];

    const catalog: CardFieldMeta[] = [];
    const taken = new Set<string>();
    const hoursOf = (settings: unknown): boolean =>
      (settings as { formulaFormat?: unknown } | null)?.formulaFormat === 'hours';
    for (const field of formFields) {
      if (CARD_DISPLAY_EXCLUDED_TYPES.has(field.fieldType) || taken.has(field.code)) continue;
      taken.add(field.code);
      catalog.push({
        code: field.code,
        label: field.label || field.code,
        fieldType: field.fieldType,
        options: new Map((field.options ?? []).map((option) => [option.internalValue, option.displayLabel])),
        hours: hoursOf(field.settingsJson),
        phaseLabel: null,
      });
    }
    for (const field of phaseFields) {
      if (CARD_DISPLAY_EXCLUDED_TYPES.has(field.fieldType) || taken.has(field.code)) continue;
      taken.add(field.code);
      catalog.push({
        code: field.code,
        label: field.label || field.code,
        fieldType: field.fieldType,
        options: new Map((field.optionsJson ?? []).map((option) => [option.value, option.label])),
        hours: hoursOf(field.settingsJson),
        phaseLabel: field.phase?.label ?? null,
      });
    }
    return catalog;
  }

  async getForPhase(formId: string, phaseId: string, userId: string): Promise<PhaseCardDisplayView> {
    const phase = await this.findPhase(formId, phaseId);
    const [personalRow, catalog] = await Promise.all([
      this.personalRepository.findOne({ where: { userId, phaseId } }),
      this.fieldCatalog(formId),
    ]);
    const phaseDefault = normalizeCardDisplay(phase.cardDisplay);
    const personal = normalizeCardDisplay(personalRow?.config);
    const { display, source } = effectiveCardDisplay(personal, phaseDefault);
    return {
      phaseId,
      phaseDefault,
      personal,
      effective: display,
      source,
      fields: catalog.map(({ code, label, fieldType, phaseLabel }) => ({ code, label, fieldType, phaseLabel })),
    };
  }

  /** Padrão da fase para todos. `null` volta ao padrão do sistema. */
  async savePhaseDefault(
    formId: string,
    phaseId: string,
    input: unknown,
    userId: string,
  ): Promise<PhaseCardDisplayView> {
    const phase = await this.findPhase(formId, phaseId);
    await this.phasesRepository.update(phase.id, { cardDisplay: input === null ? null : normalizeCardDisplay(input) });
    return this.getForPhase(formId, phaseId, userId);
  }

  /** Ajuste só desta pessoa. `null` apaga o ajuste (volta ao padrão da fase). */
  async savePersonal(formId: string, phaseId: string, userId: string, input: unknown): Promise<PhaseCardDisplayView> {
    await this.findPhase(formId, phaseId);
    const config = input === null ? null : normalizeCardDisplay(input);
    if (!config) {
      await this.personalRepository.delete({ userId, phaseId });
    } else {
      await this.personalRepository.upsert({ userId, phaseId, config }, ['userId', 'phaseId']);
    }
    return this.getForPhase(formId, phaseId, userId);
  }

  /** Ajustes da pessoa nas fases indicadas (fase sem ajuste fica de fora). */
  async personalByPhase(userId: string, phaseIds: string[]): Promise<Map<string, KanbanCardDisplay>> {
    if (phaseIds.length === 0) return new Map();
    const rows = await this.personalRepository.find({ where: { userId, phaseId: In(phaseIds) } });
    const map = new Map<string, KanbanCardDisplay>();
    for (const row of rows ?? []) {
      const config = normalizeCardDisplay(row.config);
      if (config) map.set(row.phaseId, config);
    }
    return map;
  }

  /**
   * Campos escolhidos de cada card, já como texto. `displayOf` diz que campos a fase do card mostra.
   * Mesma precedência do "Valor do card": resposta do formulário, valor dado por um fluxo, campo de
   * fase. Campo sem resposta fica de fora. Só consulta o banco quando algum card pede campo.
   */
  async loadCardFields<T extends CardAnswerSource>(
    formId: string,
    cards: T[],
    displayOf: (card: T) => KanbanCardDisplay,
  ): Promise<Map<string, KanbanCardFieldValue[]>> {
    const result = new Map<string, KanbanCardFieldValue[]>();
    const wanted = cards.filter((card) => displayOf(card).fields.length > 0);
    if (wanted.length === 0) return result;

    const codes = [...new Set(wanted.flatMap((card) => displayOf(card).fields.map((field) => field.fieldCode)))];
    const ids = wanted.map((card) => card.id);
    const submissionIds = wanted.map((card) => card.submissionId).filter((id): id is string => !!id);
    const [catalog, phaseValues, formItems] = await Promise.all([
      this.fieldCatalog(formId),
      this.dataSource
        .getRepository(KanbanPhaseFieldValueEntity)
        .find({ where: { solicitationId: In(ids), fieldCode: In(codes) } }),
      submissionIds.length
        ? this.dataSource
            .getRepository(SubmissionItemEntity)
            .find({ where: { submissionId: In(submissionIds), fieldCode: In(codes) } })
        : Promise.resolve([]),
    ]);
    const metaByCode = new Map(catalog.map((meta) => [meta.code, meta]));
    type AnswerItem = Pick<SubmissionItemEntity, 'valueText' | 'valueNumber' | 'valueBoolean' | 'valueJson'>;
    const raw = (item: AnswerItem): unknown =>
      item.valueText ?? item.valueNumber ?? item.valueBoolean ?? item.valueJson ?? null;
    const key = (owner: string, code: string): string => `${owner}|${code}`;
    const fromPhase = new Map((phaseValues ?? []).map((item) => [key(item.solicitationId, item.fieldCode), raw(item)]));
    const fromForm = new Map((formItems ?? []).map((item) => [key(item.submissionId, item.fieldCode), raw(item)]));

    for (const card of wanted) {
      const flowValues = readSolicitationFormFieldValues(card.metadata);
      const values: KanbanCardFieldValue[] = [];
      for (const field of displayOf(card).fields) {
        const meta = metaByCode.get(field.fieldCode);
        // Campo que saiu do processo não aparece (o editor mostra "campo não encontrado").
        if (!meta) continue;
        const candidates = [
          card.submissionId ? fromForm.get(key(card.submissionId, field.fieldCode)) : undefined,
          flowValues[field.fieldCode],
          fromPhase.get(key(card.id, field.fieldCode)),
        ];
        let text: string | null = null;
        for (const candidate of candidates) {
          text = formatCardFieldValue(candidate, meta);
          if (text !== null) break;
        }
        if (text !== null) values.push({ code: field.fieldCode, label: field.label ?? meta.label, text });
      }
      if (values.length) result.set(card.id, values);
    }
    return result;
  }

  private async findPhase(formId: string, phaseId: string): Promise<KanbanPhaseEntity> {
    const phase = await this.phasesRepository.findOne({ where: { id: phaseId, formId } });
    if (!phase) throw new NotFoundException('Fase não encontrada neste processo.');
    return phase;
  }
}
