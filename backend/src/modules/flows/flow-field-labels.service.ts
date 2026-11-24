import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  FormFieldEntity,
  FormVersionEntity,
  KanbanPhaseEntity,
  KanbanPhaseFieldEntity,
} from '../../database/entities';
import { buildFieldLabels, type ChoiceOptionsByCode } from './lib/flow-field-labels';
import type { FlowExecutionContext } from './types/flow.types';

/**
 * Carrega as opções dos campos de escolha do processo (formulário da versão respondida e campos
 * das fases) para os textos do fluxo mostrarem o rótulo. Nunca derruba a execução: sem rótulo,
 * o texto sai com o valor, como antes.
 */
@Injectable()
export class FlowFieldLabelsService {
  private readonly logger = new Logger(FlowFieldLabelsService.name);

  constructor(
    @InjectRepository(FormFieldEntity)
    private readonly formFieldsRepo: Repository<FormFieldEntity>,
    @InjectRepository(FormVersionEntity)
    private readonly formVersionsRepo: Repository<FormVersionEntity>,
    @InjectRepository(KanbanPhaseEntity)
    private readonly phasesRepo: Repository<KanbanPhaseEntity>,
    @InjectRepository(KanbanPhaseFieldEntity)
    private readonly phaseFieldsRepo: Repository<KanbanPhaseFieldEntity>,
  ) {}

  async labelsFor(ctx: FlowExecutionContext): Promise<Record<string, string>> {
    if (!ctx.fields || Object.keys(ctx.fields).length === 0) return {};
    const formId = ctx.form?.id ?? ctx.submission?.formId ?? ctx.solicitation?.formId;
    if (!formId) return {};
    try {
      return buildFieldLabels(ctx.fields, await this.optionsFor(formId, ctx));
    } catch (error) {
      this.logger.warn(
        `Rótulos dos campos do fluxo indisponíveis: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {};
    }
  }

  private async optionsFor(formId: string, ctx: FlowExecutionContext): Promise<ChoiceOptionsByCode> {
    const options: ChoiceOptionsByCode = new Map();

    // Campos das fases primeiro: a resposta do formulário ganha num código repetido (como em ctx.fields).
    const phases = await this.phasesRepo.find({ where: { formId }, select: ['id'] });
    if (phases.length > 0) {
      const phaseFields = await this.phaseFieldsRepo.find({
        where: { phaseId: In(phases.map((phase) => phase.id)) },
      });
      for (const field of phaseFields) {
        if (!field.optionsJson?.length) continue;
        options.set(field.code, new Map(field.optionsJson.map((option) => [option.value, option.label])));
      }
    }

    const versionId =
      ctx.submission?.formVersionId ??
      ctx.solicitation?.submission?.formVersionId ??
      (
        await this.formVersionsRepo.findOne({
          where: { formId },
          order: { versionNumber: 'DESC' },
          select: ['id'],
        })
      )?.id;
    if (versionId) {
      const fields = await this.formFieldsRepo.find({
        where: { formVersionId: versionId },
        relations: { options: true },
      });
      for (const field of fields) {
        if (!field.options?.length) continue;
        options.set(
          field.code,
          new Map(field.options.map((option) => [option.internalValue, option.displayLabel])),
        );
      }
    }
    return options;
  }
}
