import type { Repository } from 'typeorm';
import type { FormVersionEntity, SubmissionProgressEntity } from '../../database/entities';
import type { AutomationsService } from '../automations/automations.service';
import { SubmissionProgressService } from './submission-progress.service';
import type { SubmitProgressDto } from './dto/submit-progress.dto';

const VERSION = { id: 'version-1', formId: 'form-1' } as FormVersionEntity;

function buildService(existingProgress: Partial<SubmissionProgressEntity> | null = null) {
  const progressRepo: Partial<Repository<SubmissionProgressEntity>> = {
    findOne: jest.fn().mockResolvedValue(existingProgress),
    create: jest.fn().mockImplementation((data) => ({ id: 'new-progress-id', ...data })),
    save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
  };
  const versionsRepo: Partial<Repository<FormVersionEntity>> = {
    findOne: jest.fn().mockResolvedValue(VERSION),
  };
  const automationsService: Partial<AutomationsService> = {
    executeRulesForSectionReached: jest.fn().mockResolvedValue(undefined),
  };

  const service = new SubmissionProgressService(
    progressRepo as Repository<SubmissionProgressEntity>,
    versionsRepo as Repository<FormVersionEntity>,
    automationsService as AutomationsService,
  );

  return { service, progressRepo, versionsRepo, automationsService };
}

describe('SubmissionProgressService.recordProgress', () => {
  it('creates a new progress row on the first ping (no progressId sent)', async () => {
    const { service, progressRepo } = buildService(null);
    const dto: SubmitProgressDto = {
      formVersionId: 'version-1',
      sectionId: 'section-1',
      items: [{ fieldId: 'f1', fieldCode: 'area', valueText: 'financeiro' }],
    };

    const result = await service.recordProgress(dto);

    expect(progressRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ formId: 'form-1', formVersionId: 'version-1' }),
    );
    expect(result.progressId).toBe('new-progress-id');
  });

  it('reuses an existing progress row and appends the newly visited section', async () => {
    const { service, progressRepo } = buildService({
      id: 'progress-1',
      formId: 'form-1',
      formVersionId: 'version-1',
      answersJson: {},
      visitedSectionIds: ['section-1'],
    });
    const dto: SubmitProgressDto = {
      formVersionId: 'version-1',
      sectionId: 'section-2',
      progressId: 'progress-1',
      items: [{ fieldId: 'f2', fieldCode: 'centro_custo', valueText: 'TI-01' }],
    };

    const result = await service.recordProgress(dto);

    expect(result.progressId).toBe('progress-1');
    const saved = (progressRepo.save as jest.Mock).mock.calls.at(-1)?.[0];
    expect(saved.visitedSectionIds).toEqual(['section-1', 'section-2']);
    expect(saved.answersJson).toEqual({ centro_custo: 'TI-01' });
  });

  it('does not duplicate a section id that was already visited', async () => {
    const { service, progressRepo } = buildService({
      id: 'progress-1',
      formId: 'form-1',
      formVersionId: 'version-1',
      answersJson: {},
      visitedSectionIds: ['section-1'],
    });
    const dto: SubmitProgressDto = {
      formVersionId: 'version-1',
      sectionId: 'section-1',
      progressId: 'progress-1',
      items: [],
    };

    await service.recordProgress(dto);

    const saved = (progressRepo.save as jest.Mock).mock.calls.at(-1)?.[0];
    expect(saved.visitedSectionIds).toEqual(['section-1']);
  });

  it('delegates to AutomationsService with the normalized field values', async () => {
    const { service, automationsService } = buildService(null);
    const dto: SubmitProgressDto = {
      formVersionId: 'version-1',
      sectionId: 'section-1',
      items: [{ fieldId: 'f1', fieldCode: 'area', valueText: 'financeiro' }],
    };

    await service.recordProgress(dto);

    expect(automationsService.executeRulesForSectionReached).toHaveBeenCalledWith(
      'form-1',
      'section-1',
      'new-progress-id',
      { area: 'financeiro' },
    );
  });
});
