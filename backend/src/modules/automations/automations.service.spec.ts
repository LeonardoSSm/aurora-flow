import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import type {
  AutomationExecutionEntity,
  AutomationRuleEntity,
  NotificationEntity,
  SubmissionEntity,
  SubmissionItemEntity,
} from '../../database/entities';
import { AutomationsService } from './automations.service';

function makeRule(overrides: Partial<AutomationRuleEntity> = {}): AutomationRuleEntity {
  return {
    id: 'rule-1',
    formId: 'form-1',
    name: 'Notificar equipe',
    isActive: true,
    trigger: 'on_section_reached',
    targetSectionId: 'section-1',
    conditions: null,
    actions: [{ type: 'notify_users', userIds: ['user-1'], message: 'Seção alcançada' }],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as AutomationRuleEntity;
}

function buildService(overrides: {
  rules?: AutomationRuleEntity[];
  alreadyFired?: boolean;
}) {
  const rulesRepo: Partial<Repository<AutomationRuleEntity>> = {
    find: jest.fn().mockResolvedValue(overrides.rules ?? [makeRule()]),
  };
  const executionsRepo: Partial<Repository<AutomationExecutionEntity>> = {
    exist: jest.fn().mockResolvedValue(overrides.alreadyFired ?? false),
    create: jest.fn().mockImplementation((data) => ({ ...data })),
    save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
  };
  const notificationsRepo: Partial<Repository<NotificationEntity>> = {
    create: jest.fn().mockImplementation((data) => data),
    save: jest.fn().mockResolvedValue(undefined),
  };
  const submissionsRepo: Partial<Repository<SubmissionEntity>> = { findOne: jest.fn() };
  const itemsRepo: Partial<Repository<SubmissionItemEntity>> = { find: jest.fn() };
  const config: Partial<ConfigService> = { get: jest.fn() };

  const service = new AutomationsService(
    rulesRepo as Repository<AutomationRuleEntity>,
    executionsRepo as Repository<AutomationExecutionEntity>,
    notificationsRepo as Repository<NotificationEntity>,
    submissionsRepo as Repository<SubmissionEntity>,
    itemsRepo as Repository<SubmissionItemEntity>,
    config as ConfigService,
  );

  return { service, rulesRepo, executionsRepo, notificationsRepo };
}

describe('AutomationsService.executeRulesForSectionReached', () => {
  it('queries only active on_section_reached rules scoped to the given section', async () => {
    const { service, rulesRepo } = buildService({ rules: [] });

    await service.executeRulesForSectionReached('form-1', 'section-1', 'progress-1', {});

    expect(rulesRepo.find).toHaveBeenCalledWith({
      where: {
        formId: 'form-1',
        isActive: true,
        trigger: 'on_section_reached',
        targetSectionId: 'section-1',
      },
    });
  });

  it('runs the rule and records an execution keyed by progressId (not submissionId)', async () => {
    const { service, executionsRepo, notificationsRepo } = buildService({});

    await service.executeRulesForSectionReached('form-1', 'section-1', 'progress-1', {
      area: 'financeiro',
    });

    expect(notificationsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', message: 'Seção alcançada' }),
    );
    expect(executionsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ ruleId: 'rule-1', progressId: 'progress-1', submissionId: null }),
    );
    const saved = (executionsRepo.save as jest.Mock).mock.calls.at(-1)?.[0];
    expect(saved.status).toBe('success');
  });

  it('does not re-fire a rule already executed for the same progressId', async () => {
    const { service, executionsRepo } = buildService({ alreadyFired: true });

    await service.executeRulesForSectionReached('form-1', 'section-1', 'progress-1', {});

    expect(executionsRepo.exist).toHaveBeenCalledWith({
      where: { ruleId: 'rule-1', progressId: 'progress-1' },
    });
    expect(executionsRepo.create).not.toHaveBeenCalled();
  });

  it('skips actions but still records the execution when rule conditions do not match', async () => {
    const rule = makeRule({
      conditions: { match: 'all', rules: [{ fieldCode: 'area', operator: 'equals', value: 'ti' }] },
    });
    const { service, notificationsRepo, executionsRepo } = buildService({ rules: [rule] });

    await service.executeRulesForSectionReached('form-1', 'section-1', 'progress-1', {
      area: 'financeiro',
    });

    expect(notificationsRepo.create).not.toHaveBeenCalled();
    const saved = (executionsRepo.save as jest.Mock).mock.calls.at(-1)?.[0];
    expect(saved.status).toBe('success');
    expect(saved.actionsExecuted).toEqual([]);
  });

  it('does nothing when no rules are scoped to the section', async () => {
    const { service, executionsRepo } = buildService({ rules: [] });

    await service.executeRulesForSectionReached('form-1', 'section-1', 'progress-1', {});

    expect(executionsRepo.exist).not.toHaveBeenCalled();
    expect(executionsRepo.create).not.toHaveBeenCalled();
  });
});
