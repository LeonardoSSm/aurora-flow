import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { FormEntity, FormStandardQuestionEntity } from '../../database/entities';
import { SaveStandardQuestionsDto, StandardQuestionInputDto } from './dto/save-standard-questions.dto';

@Injectable()
export class StandardQuestionsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(FormStandardQuestionEntity)
    private readonly questionsRepository: Repository<FormStandardQuestionEntity>,
    @InjectRepository(FormEntity)
    private readonly formsRepository: Repository<FormEntity>,
  ) {}

  async findByForm(formId: string): Promise<FormStandardQuestionEntity[]> {
    return this.questionsRepository.find({
      where: { formId },
      order: { order: 'ASC' },
    });
  }

  async save(
    formId: string,
    dto: SaveStandardQuestionsDto,
  ): Promise<FormStandardQuestionEntity[]> {
    const form = await this.formsRepository.findOne({ where: { id: formId } });
    if (!form) throw new NotFoundException('Formulario nao encontrado.');

    await this.dataSource.transaction(async (manager) => {
      const questionRepo = manager.getRepository(FormStandardQuestionEntity);

      const existingQuestions = await questionRepo.find({ where: { formId } });
      const existingQuestionIds = new Set(existingQuestions.map((q) => q.id));
      const incomingQuestionIds = new Set(
        dto.questions
          .filter((q): q is StandardQuestionInputDto & { id: string } => !!q.id)
          .map((q) => q.id),
      );

      const questionIdsToDelete = existingQuestions
        .map((q) => q.id)
        .filter((id) => !incomingQuestionIds.has(id));
      if (questionIdsToDelete.length > 0) {
        await questionRepo.delete(questionIdsToDelete);
      }

      for (const questionInput of dto.questions) {
        await questionRepo.save({
          id:
            questionInput.id && existingQuestionIds.has(questionInput.id)
              ? questionInput.id
              : undefined,
          formId,
          code: questionInput.code,
          label: questionInput.label,
          fieldType: questionInput.fieldType,
          required: questionInput.required ?? false,
          order: questionInput.order,
          settingsJson: questionInput.settingsJson ?? null,
          optionsJson: questionInput.options ?? null,
        });
      }
    });

    return this.findByForm(formId);
  }
}
