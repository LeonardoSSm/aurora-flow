import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as nodemailer from 'nodemailer';
import { Repository } from 'typeorm';
import {
  AutomationAction,
  AutomationCondition,
  AutomationConditions,
} from '../../common/types/automation-action.types';
import {
  AutomationExecutionEntity,
  AutomationRuleEntity,
  NotificationEntity,
  SubmissionEntity,
  SubmissionItemEntity,
} from '../../database/entities';

type SubmissionContext = {
  submissionId: string;
  formId: string;
  responderName: string | null;
  responderEmail: string | null;
  fields: Record<string, string>;
};

@Injectable()
export class AutomationsService {
  private readonly logger = new Logger(AutomationsService.name);

  constructor(
    @InjectRepository(AutomationRuleEntity)
    private readonly rulesRepo: Repository<AutomationRuleEntity>,
    @InjectRepository(AutomationExecutionEntity)
    private readonly executionsRepo: Repository<AutomationExecutionEntity>,
    @InjectRepository(NotificationEntity)
    private readonly notificationsRepo: Repository<NotificationEntity>,
    @InjectRepository(SubmissionEntity)
    private readonly submissionsRepo: Repository<SubmissionEntity>,
    @InjectRepository(SubmissionItemEntity)
    private readonly itemsRepo: Repository<SubmissionItemEntity>,
    private readonly config: ConfigService,
  ) {}

  async executeRulesForSubmission(submissionId: string, formId: string): Promise<void> {
    const rules = await this.rulesRepo.find({
      where: { formId, isActive: true, trigger: 'on_submission' },
    });

    if (rules.length === 0) return;

    const submission = await this.submissionsRepo.findOne({ where: { id: submissionId } });
    const items = await this.itemsRepo.find({ where: { submissionId } });

    const fields: Record<string, string> = {};
    for (const item of items) {
      const text =
        item.valueText ??
        (item.valueNumber !== null && item.valueNumber !== undefined
          ? String(item.valueNumber)
          : item.valueBoolean !== null && item.valueBoolean !== undefined
            ? String(item.valueBoolean)
            : '');
      fields[item.fieldCode] = text;
    }

    const ctx: SubmissionContext = {
      submissionId,
      formId,
      responderName: submission?.responderName ?? null,
      responderEmail: submission?.responderEmail ?? null,
      fields,
    };

    for (const rule of rules) {
      await this.runRule(rule, ctx);
    }
  }

  async executeRulesForSectionReached(
    formId: string,
    sectionId: string,
    progressId: string,
    fields: Record<string, string>,
  ): Promise<void> {
    const rules = await this.rulesRepo.find({
      where: { formId, isActive: true, trigger: 'on_section_reached', targetSectionId: sectionId },
    });
    if (rules.length === 0) return;

    const ctx: SubmissionContext = {
      submissionId: progressId,
      formId,
      responderName: null,
      responderEmail: null,
      fields,
    };

    for (const rule of rules) {
      const alreadyFired = await this.executionsRepo.exist({
        where: { ruleId: rule.id, progressId },
      });
      if (alreadyFired) continue;

      await this.runRule(rule, ctx, progressId);
    }
  }

  private async runRule(
    rule: AutomationRuleEntity,
    ctx: SubmissionContext,
    progressId?: string,
  ): Promise<void> {
    const execution = this.executionsRepo.create({
      ruleId: rule.id,
      submissionId: progressId ? null : ctx.submissionId,
      progressId: progressId ?? null,
      status: 'running',
      startedAt: new Date(),
    });
    await this.executionsRepo.save(execution);

    const conditions = rule.conditions as AutomationConditions | null;
    if (conditions && !this.evaluateConditions(conditions, ctx.fields)) {
      execution.status = 'success';
      execution.completedAt = new Date();
      execution.actionsExecuted = [];
      await this.executionsRepo.save(execution);
      return;
    }

    const actions = rule.actions as unknown as AutomationAction[];
    const executed: Record<string, unknown>[] = [];

    try {
      for (const action of actions) {
        await this.executeAction(action, ctx);
        executed.push({ type: action.type, executedAt: new Date().toISOString() });
      }
      execution.status = 'success';
    } catch (error) {
      execution.status = 'failed';
      execution.errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Automation rule ${rule.id} failed: ${execution.errorMessage}`);
    }

    execution.completedAt = new Date();
    execution.actionsExecuted = executed;
    await this.executionsRepo.save(execution);
  }

  evaluateConditions(conditions: AutomationConditions, fields: Record<string, string>): boolean {
    const rules: AutomationCondition[] = conditions.rules ?? [];
    if (rules.length === 0) return true;

    const match = conditions.match ?? 'all';
    const results = rules.map((rule) => this.evaluateCondition(rule, fields));

    return match === 'any' ? results.some(Boolean) : results.every(Boolean);
  }

  private evaluateCondition(
    condition: AutomationCondition,
    fields: Record<string, string>,
  ): boolean {
    const value = fields[condition.fieldCode] ?? '';
    switch (condition.operator) {
      case 'equals':
        return value === (condition.value ?? '');
      case 'not_equals':
        return value !== (condition.value ?? '');
      case 'is_empty':
        return value.trim() === '';
      case 'is_not_empty':
        return value.trim() !== '';
      case 'contains':
        return value.includes(condition.value ?? '');
      default:
        return true;
    }
  }

  interpolateVariables(template: string, ctx: SubmissionContext): string {
    return template
      .replace(/\{\{submissionId\}\}/g, ctx.submissionId)
      .replace(/\{\{formId\}\}/g, ctx.formId)
      .replace(/\{\{responderName\}\}/g, ctx.responderName ?? '')
      .replace(/\{\{responderEmail\}\}/g, ctx.responderEmail ?? '')
      .replace(/\{\{field\.(\w+)\}\}/g, (_, code: string) => ctx.fields[code] ?? '');
  }

  private async executeAction(action: AutomationAction, ctx: SubmissionContext): Promise<void> {
    if (action.type === 'send_email') {
      await this.sendEmail(action.to, action.subject, action.body, ctx);
    } else if (action.type === 'webhook') {
      await this.callWebhook(action, ctx);
    } else if (action.type === 'notify_users') {
      await this.notifyUsers(action.userIds, action.message, ctx);
    }
  }

  private async sendEmail(
    to: string,
    subject: string,
    body: string,
    ctx: SubmissionContext,
  ): Promise<void> {
    const host = this.config.get<string>('SMTP_HOST');
    if (!host) {
      this.logger.warn('SMTP not configured, skipping send_email action');
      return;
    }

    const transporter = nodemailer.createTransport({
      host,
      port: Number(this.config.get<string>('SMTP_PORT') ?? '587'),
      auth: {
        user: this.config.get<string>('SMTP_USER'),
        pass: this.config.get<string>('SMTP_PASS'),
      },
    });

    await transporter.sendMail({
      from: this.config.get<string>('SMTP_FROM') ?? host,
      to: this.interpolateVariables(to, ctx),
      subject: this.interpolateVariables(subject, ctx),
      text: this.interpolateVariables(body, ctx),
    });
  }

  private async callWebhook(
    action: { url: string; method?: string; headers?: Record<string, string>; body?: string },
    ctx: SubmissionContext,
  ): Promise<void> {
    const method = action.method ?? 'POST';
    const url = this.interpolateVariables(action.url, ctx);
    const body = action.body ? this.interpolateVariables(action.body, ctx) : undefined;

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(action.headers ?? {}) },
      body,
    });

    if (!response.ok) {
      throw new Error(`Webhook responded with ${response.status}`);
    }
  }

  private async notifyUsers(
    userIds: string[],
    messageTemplate: string,
    ctx: SubmissionContext,
  ): Promise<void> {
    const message = this.interpolateVariables(messageTemplate, ctx);
    const notifications = userIds.map((userId) =>
      this.notificationsRepo.create({ userId, message }),
    );
    await this.notificationsRepo.save(notifications);
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  findRulesByForm(formId: string): Promise<AutomationRuleEntity[]> {
    return this.rulesRepo.find({ where: { formId }, order: { createdAt: 'ASC' } });
  }

  findRule(id: string): Promise<AutomationRuleEntity | null> {
    return this.rulesRepo.findOne({ where: { id } });
  }

  createRule(
    formId: string,
    dto: {
      name: string;
      isActive?: boolean;
      trigger?: string;
      targetSectionId?: string | null;
      conditions?: Record<string, unknown> | null;
      actions: Record<string, unknown>[];
    },
  ): Promise<AutomationRuleEntity> {
    const rule = this.rulesRepo.create({ ...dto, formId, trigger: dto.trigger ?? 'on_submission' });
    return this.rulesRepo.save(rule);
  }

  async updateRule(
    id: string,
    dto: {
      name?: string;
      isActive?: boolean;
      trigger?: string;
      targetSectionId?: string | null;
      conditions?: Record<string, unknown> | null;
      actions?: Record<string, unknown>[];
    },
  ): Promise<AutomationRuleEntity> {
    const rule = await this.rulesRepo.findOneOrFail({ where: { id } });
    Object.assign(rule, dto);
    return this.rulesRepo.save(rule);
  }

  deleteRule(id: string): Promise<void> {
    return this.rulesRepo.delete(id).then(() => undefined);
  }

  findExecutions(ruleId: string): Promise<AutomationExecutionEntity[]> {
    return this.executionsRepo.find({
      where: { ruleId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }
}
