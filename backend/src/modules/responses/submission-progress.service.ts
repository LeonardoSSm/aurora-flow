import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FormVersionEntity, SubmissionProgressEntity } from '../../database/entities';
import { AutomationsService } from '../automations/automations.service';
import { SubmitProgressDto } from './dto/submit-progress.dto';

@Injectable()
export class SubmissionProgressService {
  constructor(
    @InjectRepository(SubmissionProgressEntity)
    private readonly progressRepo: Repository<SubmissionProgressEntity>,
    @InjectRepository(FormVersionEntity)
    private readonly versionsRepo: Repository<FormVersionEntity>,
    private readonly automationsService: AutomationsService,
  ) {}

  async recordProgress(dto: SubmitProgressDto): Promise<{ progressId: string }> {
    const version = await this.versionsRepo.findOne({ where: { id: dto.formVersionId } });
    if (!version) {
      throw new NotFoundException('Versão do formulário não encontrada.');
    }

    const fields: Record<string, string> = {};
    for (const item of dto.items) {
      const text =
        item.valueText ??
        (item.valueNumber !== null && item.valueNumber !== undefined
          ? String(item.valueNumber)
          : item.valueBoolean !== null && item.valueBoolean !== undefined
            ? String(item.valueBoolean)
            : '');
      fields[item.fieldCode] = text;
    }

    let progress = dto.progressId
      ? await this.progressRepo.findOne({
          where: { id: dto.progressId, formVersionId: dto.formVersionId },
        })
      : null;

    progress ??= this.progressRepo.create({
      formId: version.formId,
      formVersionId: dto.formVersionId,
      answersJson: {},
      visitedSectionIds: [],
    });

    progress.answersJson = fields;
    progress.visitedSectionIds = Array.from(
      new Set([...progress.visitedSectionIds, dto.sectionId]),
    );
    await this.progressRepo.save(progress);

    await this.automationsService.executeRulesForSectionReached(
      version.formId,
      dto.sectionId,
      progress.id,
      fields,
    );

    return { progressId: progress.id };
  }
}
