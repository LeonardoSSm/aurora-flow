import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type {
  ApprovalApprovedEvent,
  ApprovalRejectedEvent,
} from '../../common/events/approval-events';
import { ApprovalEntity, FlowExecutionEntity } from '../../database/entities';
import { RabbitMqService } from '../queue/rabbitmq.service';
import {
  DEFAULT_FLOW_SUBMISSION_QUEUE,
  type FlowContextJob,
  type FlowResumeJob,
} from './flows.queue';
import { FlowsService, type FlowEntry } from './flows.service';
import { buildFlowFieldValues } from './lib/flow-field-values';
import {
  MAX_FLOW_EVENT_DEPTH,
  type FlowExecutionContext,
  type FlowTriggerNodeType,
} from './types/flow.types';

type ApprovalCompletedEvent = ApprovalApprovedEvent | ApprovalRejectedEvent;

@Injectable()
export class FlowsApprovalListener {
  private readonly logger = new Logger(FlowsApprovalListener.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly rabbitMqService: RabbitMqService,
    private readonly flowsService: FlowsService,
    @InjectRepository(ApprovalEntity)
    private readonly approvalsRepo: Repository<ApprovalEntity>,
    @InjectRepository(FlowExecutionEntity)
    private readonly executionsRepo: Repository<FlowExecutionEntity>,
  ) {}

  @OnEvent('approvals.approved')
  @OnEvent('approvals.rejected')
  async handleApprovalCompleted(event: ApprovalCompletedEvent): Promise<void> {
    try {
      const flowEventDepth = this.getFlowEventDepth(event);
      if (flowEventDepth >= MAX_FLOW_EVENT_DEPTH) {
        this.logger.warn(`Flow event depth limit reached for approval ${event.approvalId}.`);
        return;
      }

      const approval = await this.approvalsRepo.findOne({
        where: { id: event.approvalId },
        relations: [
          'steps',
          'solicitation',
          'solicitation.form',
          'solicitation.submission',
          'solicitation.submission.items',
          'solicitation.assignee',
          'solicitation.createdByUser',
        ],
      });
      if (!approval?.solicitation) {
        this.logger.warn(`Approval ${event.approvalId} not found for flow event.`);
        return;
      }

      const triggerType: FlowTriggerNodeType = 'trigger_approval_completed';
      // Aprovação de fase: o gatilho pode filtrar por ela, e os nós seguintes sabem em que fase estão.
      const entries = await this.flowsService.findActiveFlowEntries(triggerType, {
        formId: approval.solicitation.formId,
        ...(approval.phaseId ? { phaseId: approval.phaseId } : {}),
      });
      const metadata = {
        ...this.buildMetadata(event),
        ...(approval.phaseId ? { phaseId: approval.phaseId } : {}),
        flowEventDepth,
      };

      await this.dispatchFlows(
        entries,
        triggerType,
        event.name,
        approval,
        event.actorId,
        metadata,
        flowEventDepth,
      );

      await this.resumePausedExecutions(event.approvalId);
    } catch (err) {
      this.logger.error(
        `Flow approval listener failed for ${event.approvalId}: ${this.errorMessage(err)}`,
      );
    }
  }

  private async dispatchFlows(
    entries: FlowEntry[],
    triggerType: FlowTriggerNodeType,
    eventName: string,
    approval: ApprovalEntity,
    actorId: string | null,
    metadata: Record<string, unknown>,
    flowEventDepth: number,
  ): Promise<void> {
    const queue = this.getQueueName();
    const solicitation = approval.solicitation;

    for (const { flow, entryNode } of entries) {
      const context = {
        ...this.buildContext(eventName, approval, actorId, metadata),
        entryNodeId: entryNode.id,
      };
      const job: FlowContextJob = {
        kind: 'flow_context',
        flowId: flow.id,
        triggerType,
        entryNodeId: entryNode.id,
        eventName,
        approvalId: approval.id,
        solicitationId: solicitation.id,
        actorId,
        flowEventDepth,
        metadata,
        emittedAt: new Date().toISOString(),
      };

      const queued = await this.rabbitMqService.publishJson(queue, job, {
        messageId: `${eventName}:${approval.id}:${flow.id}`,
        headers: { event: eventName, flowId: flow.id },
        expiration: String(24 * 60 * 60 * 1000),
      });
      if (queued) continue;

      this.logger.warn(
        `RabbitMQ unavailable. Executing flow ${flow.id} inline for approval ${approval.id}.`,
      );
      await this.flowsService.executeFlowWithContext(flow, context);
    }
  }

  /**
   * Retoma toda FlowExecutionEntity que ficou parada em action_create_approval esperando
   * exatamente esta aprovação — independente de dispatchFlows() (que só inicia fluxos NOVOS
   * reagindo a trigger_approval_completed). São dois mecanismos ortogonais: um continua uma
   * execução em andamento, o outro pode iniciar execuções do zero.
   */
  private async resumePausedExecutions(approvalId: string): Promise<void> {
    const paused = await this.executionsRepo.find({
      where: { approvalId, status: 'waiting_approval' },
    });
    if (paused.length === 0) return;

    const queue = this.getQueueName();
    for (const execution of paused) {
      const job: FlowResumeJob = {
        kind: 'flow_resume',
        executionId: execution.id,
        approvalId,
        emittedAt: new Date().toISOString(),
      };

      const queued = await this.rabbitMqService.publishJson(queue, job, {
        messageId: `flow_resume:${execution.id}:${approvalId}`,
        headers: { event: 'flow_resume' },
        expiration: String(24 * 60 * 60 * 1000),
      });
      if (queued) continue;

      this.logger.warn(
        `RabbitMQ unavailable. Resuming flow execution ${execution.id} inline for approval ${approvalId}.`,
      );
      await this.flowsService.resumePausedExecution(execution.id, approvalId);
    }
  }

  private buildContext(
    eventName: string,
    approval: ApprovalEntity,
    actorId: string | null,
    metadata: Record<string, unknown>,
  ): FlowExecutionContext {
    const solicitation = approval.solicitation;
    const submission = solicitation.submission ?? undefined;
    const fields = buildFlowFieldValues(submission?.items);

    return {
      eventName,
      approval,
      solicitation,
      submission,
      form: solicitation.form ?? undefined,
      fields,
      metadata,
      actorId: actorId ?? undefined,
      flowEventDepth: Number(metadata.flowEventDepth ?? 0),
    };
  }

  private buildMetadata(event: ApprovalCompletedEvent): Record<string, unknown> {
    const metadata: Record<string, unknown> = {
      decision: event.name === 'approvals.approved' ? 'approved' : 'rejected',
    };
    if ('stepId' in event) metadata.stepId = event.stepId;
    return metadata;
  }

  private getFlowEventDepth(event: ApprovalCompletedEvent): number {
    const depth = Number(event.flowDepth ?? 0);
    return Number.isFinite(depth) && depth > 0 ? depth : 0;
  }

  private getQueueName(): string {
    return this.configService.get<string>(
      'RABBITMQ_FLOW_SUBMISSION_QUEUE',
      DEFAULT_FLOW_SUBMISSION_QUEUE,
    );
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
