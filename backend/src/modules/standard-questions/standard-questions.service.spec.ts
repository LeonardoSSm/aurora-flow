import { NotFoundException } from '@nestjs/common';
import type { DataSource, Repository } from 'typeorm';
import type { FormEntity, FormStandardQuestionEntity } from '../../database/entities';
import { StandardQuestionsService } from './standard-questions.service';
import type { SaveStandardQuestionsDto } from './dto/save-standard-questions.dto';

function makeQuestion(
  overrides: Partial<FormStandardQuestionEntity> = {},
): FormStandardQuestionEntity {
  return {
    id: 'question-1',
    formId: 'form-1',
    code: 'nome_completo',
    label: 'Nome completo',
    fieldType: 'short_text',
    required: false,
    order: 0,
    settingsJson: null,
    optionsJson: null,
    ...overrides,
  } as FormStandardQuestionEntity;
}

function buildService(overrides: {
  form?: Partial<FormEntity> | null;
  existingQuestions?: FormStandardQuestionEntity[];
}) {
  const existingQuestions = overrides.existingQuestions ?? [];

  const questionsRepository: Partial<Repository<FormStandardQuestionEntity>> = {
    find: jest.fn().mockResolvedValue(existingQuestions),
  };

  const questionTxRepo: Partial<Repository<FormStandardQuestionEntity>> = {
    find: jest.fn().mockResolvedValue(existingQuestions),
    delete: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockImplementation((data) => Promise.resolve({ id: 'new-question-id', ...data })),
  };

  const manager = {
    getRepository: jest.fn().mockReturnValue(questionTxRepo),
  };

  const dataSource: Partial<DataSource> = {
    transaction: jest.fn().mockImplementation(async (cb: (m: unknown) => unknown) => cb(manager)),
  };

  const formsRepo: Partial<Repository<FormEntity>> = {
    findOne: jest
      .fn()
      .mockResolvedValue(overrides.form === undefined ? { id: 'form-1' } : overrides.form),
  };

  const service = new StandardQuestionsService(
    dataSource as DataSource,
    questionsRepository as Repository<FormStandardQuestionEntity>,
    formsRepo as Repository<FormEntity>,
  );

  return { service, questionsRepository, questionTxRepo, formsRepo, dataSource };
}

describe('StandardQuestionsService.findByForm', () => {
  it('retorna perguntas ordenadas por form', async () => {
    const { service, questionsRepository } = buildService({});

    await service.findByForm('form-1');

    expect(questionsRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { formId: 'form-1' },
        order: { order: 'ASC' },
      }),
    );
  });
});

describe('StandardQuestionsService.save', () => {
  it('lança NotFoundException quando o formulário não existe', async () => {
    const { service } = buildService({ form: null });

    await expect(
      service.save('missing-form', { questions: [] } as SaveStandardQuestionsDto),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cria perguntas quando não há nada existente', async () => {
    const { service, questionTxRepo } = buildService({ existingQuestions: [] });
    const dto: SaveStandardQuestionsDto = {
      questions: [
        { code: 'nome', label: 'Nome completo', fieldType: 'short_text', order: 0 },
        { code: 'email', label: 'E-mail', fieldType: 'email', order: 1 },
      ],
    } as SaveStandardQuestionsDto;

    await service.save('form-1', dto);

    expect(questionTxRepo.save).toHaveBeenCalledTimes(2);
    expect(questionTxRepo.delete).not.toHaveBeenCalled();
  });

  it('apaga perguntas removidas do payload', async () => {
    const existingQuestions = [
      makeQuestion({ id: 'question-1' }),
      makeQuestion({ id: 'question-2', code: 'email' }),
    ];
    const { service, questionTxRepo } = buildService({ existingQuestions });
    const dto: SaveStandardQuestionsDto = {
      questions: [{ id: 'question-1', code: 'nome', label: 'Nome', fieldType: 'short_text', order: 0 }],
    } as SaveStandardQuestionsDto;

    await service.save('form-1', dto);

    expect(questionTxRepo.delete).toHaveBeenCalledWith(['question-2']);
  });

  it('mantém o id ao atualizar pergunta existente (upsert)', async () => {
    const existingQuestions = [makeQuestion({ id: 'question-1', label: 'Antigo' })];
    const { service, questionTxRepo } = buildService({ existingQuestions });
    const dto: SaveStandardQuestionsDto = {
      questions: [
        { id: 'question-1', code: 'nome', label: 'Novo rótulo', fieldType: 'short_text', order: 0 },
      ],
    } as SaveStandardQuestionsDto;

    await service.save('form-1', dto);

    expect(questionTxRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'question-1', label: 'Novo rótulo' }),
    );
  });

  it('só grava optionsJson quando o payload traz opções', async () => {
    const { service, questionTxRepo } = buildService({ existingQuestions: [] });
    const dto: SaveStandardQuestionsDto = {
      questions: [
        {
          code: 'area',
          label: 'Área de interesse',
          fieldType: 'single_select',
          order: 0,
          options: [{ value: 'ti', label: 'TI' }],
        },
      ],
    } as SaveStandardQuestionsDto;

    await service.save('form-1', dto);

    expect(questionTxRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ optionsJson: [{ value: 'ti', label: 'TI' }] }),
    );
  });
});
