import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SolicitationOriginType } from '../../common/enums/solicitation-origin-type.enum';
import type {
  PhaseChangedEvent,
  SolicitationCreatedEvent,
} from '../../common/events/solicitation-events';
import { KanbanPhaseEntity, SolicitationEntity } from '../../database/entities';
import { RabbitMqService } from '../queue/rabbitmq.service';
import { phaseApproverMetadata } from '../kanban-phases/phase-people';
import { DEFAULT_FLOW_SUBMISSION_QUEUE, type FlowContextJob } from './flows.queue';
import { FlowsService, type FlowEntry } from './flows.service';
import { buildFlowFieldValues } from './lib/flow-field-values';
import { MAX_FLOW_EVENT_DEPTH, type FlowExecutionContext } from './types/flow.types';

/** A entrada numa fase: por mudança de fase ou pelo card que nasce na 1ª. */
type PhaseEntered = {
  eventName: string;
  actorId: string | null;
  occurredAt: Date;
  toPhaseId: string;
  fromPhaseId: string | null;
  flowEventDepth: number;
};

/**
 * Reage a `solicitations.phase_changed` (SolicitationsService.movePhase) e dispara os fluxos com o
 * gatilho "Entrou na fase" (`trigger_phase_entered`), filtrando pela fase de destino e, se o nó
 * pedir, pela de origem. É a base das regras de processo montadas como fluxo: "chegou na
 * aprovação → acima de R$ X cria a aprovação da diretoria", "chegou no pagamento → avisa o
 * financeiro". Um fluxo que move o card dispara de novo este gatilho; o limite de encadeamento
 * (MAX_FLOW_EVENT_DEPTH) impede o laço.
 *
 * O card que nasce na 1ª fase (formulário enviado, criação manual) também "entra" nela. No mapa
 * do processo, a 1ª fase liga no gatilho, e o formulário de abertura é dela. Quem nasce em outra
 * fase (faixa de pontuação, entrada externa) já chega por `phase_changed`.
 */
@Injectable()
export class FlowsPhaseEnteredListener {
  private readonly logger = new Logger(FlowsPhaseEnteredListener.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly rabbitMqService: RabbitMqService,
    private readonly flowsService: FlowsService,
    @InjectRepository(SolicitationEntity)
    private readonly solicitationsRepo: Repository<SolicitationEntity>,
    @InjectRepository(KanbanPhaseEntity)
    private readonly kanbanPhasesRepo: Repository<KanbanPhaseEntity>,
  ) {}

  @OnEvent('solicitations.phase_changed')
  async handlePhaseChanged(event: PhaseChangedEvent): Promise<void> {
    try {
      const flowEventDepth = Number(event.flowDepth ?? 0);
      if (flowEventDepth >= MAX_FLOW_EVENT_DEPTH) {
        this.logger.warn(`Flow event depth limit reached for solicitation ${event.solicitationId}.`);
        return;
      }

      const solicitation = await this.loadSolicitation(event.solicitationId);
      if (!solicitation?.formId) return;

      await this.dispatchPhaseEntered(solicitation, {
        eventName: event.name,
        actorId: event.actorId,
        occurredAt: event.occurredAt,
        toPhaseId: event.toPhaseId,
        fromPhaseId: event.fromPhaseId,
        flowEventDepth,
      });
    } catch (err) {
      this.logger.error(
        `Flow phase-entered listener failed for solicitation ${event.solicitationId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Card novo sem fase gravada está na 1ª fase: dispara os "Entrou na fase" dela. A entrada externa
   * (webhook, "Criar solicitação" de um fluxo) fica de fora. Ela escolhe a fase de propósito e não
   * traz o encadeamento; assim, um fluxo da 1ª fase que cria outra solicitação viraria laço.
   */
  @OnEvent('solicitations.created')
  async handleSolicitationCreated(event: SolicitationCreatedEvent): Promise<void> {
    if (!event.formId || event.originType === SolicitationOriginType.WEBHOOK) return;
    // Card encaminhado de outro processo traz o encadeamento de quem o criou.
    const flowEventDepth = Number(event.flowDepth ?? 0);
    if (flowEventDepth >= MAX_FLOW_EVENT_DEPTH) {
      this.logger.warn(`Flow event depth limit reached for solicitation ${event.solicitationId}.`);
      return;
    }
    try {
      const solicitation = await this.loadSolicitation(event.solicitationId);
      if (!solicitation?.formId || solicitation.currentPhaseId) return;

      const firstPhase = await this.kanbanPhasesRepo.findOne({
        where: { formId: solicitation.formId },
        order: { order: 'ASC' },
      });
      if (!firstPhase) return;

      await this.dispatchPhaseEntered(
        solicitation,
        {
          eventName: event.name,
          actorId: event.actorId,
          occurredAt: event.occurredAt,
          toPhaseId: firstPhase.id,
          fromPhaseId: null,
          flowEventDepth,
        },
        firstPhase,
      );
    } catch (err) {
      this.logger.error(
        `Flow phase-entered listener failed for new solicitation ${event.solicitationId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private loadSolicitation(id: string): Promise<SolicitationEntity | null> {
    return this.solicitationsRepo.findOne({
      where: { id },
      relations: ['form', 'submission', 'submission.items', 'assignee', 'createdByUser'],
    });
  }

  private async dispatchPhaseEntered(
    solicitation: SolicitationEntity,
    entered: PhaseEntered,
    knownPhase?: KanbanPhaseEntity,
  ): Promise<void> {
    const entries = await this.flowsService.findActiveFlowEntries('trigger_phase_entered', {
      formId: solicitation.formId,
      phaseId: entered.toPhaseId,
      ...(entered.fromPhaseId ? { fromPhaseId: entered.fromPhaseId } : {}),
    });
    if (entries.length === 0) return;

    const phase =
      knownPhase ?? (await this.kanbanPhasesRepo.findOne({ where: { id: entered.toPhaseId } }));
    const metadata: Record<string, unknown> = {
      phaseId: entered.toPhaseId,
      fromPhaseId: entered.fromPhaseId,
      flowEventDepth: entered.flowEventDepth,
    };
    if (phase) {
      metadata.phaseLabel = phase.label;
      // Quem aprova a fase: perfis + usuários e a regra, para "Criar aprovação" no modo da fase.
      Object.assign(metadata, phaseApproverMetadata(phase));
    }

    await this.dispatchFlows(entries, solicitation, entered, metadata);
  }

  private async dispatchFlows(
    entries: FlowEntry[],
    solicitation: SolicitationEntity,
    entered: PhaseEntered,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const queue = this.configService.get<string>(
      'RABBITMQ_FLOW_SUBMISSION_QUEUE',
      DEFAULT_FLOW_SUBMISSION_QUEUE,
    );
    const fields = buildFlowFieldValues(solicitation.submission?.items);
    const { eventName, flowEventDepth } = entered;

    for (const { flow, entryNode } of entries) {
      const job: FlowContextJob = {
        kind: 'flow_context',
        flowId: flow.id,
        triggerType: 'trigger_phase_entered',
        entryNodeId: entryNode.id,
        eventName,
        submissionId: solicitation.submissionId ?? null,
        solicitationId: solicitation.id,
        actorId: entered.actorId,
        flowEventDepth,
        metadata,
        emittedAt: new Date().toISOString(),
      };

      const queued = await this.rabbitMqService.publishJson(queue, job, {
        messageId: `${eventName}:${solicitation.id}:${entered.toPhaseId}:${flow.id}:${entered.occurredAt.getTime()}`,
        headers: { event: eventName, flowId: flow.id },
        expiration: String(24 * 60 * 60 * 1000),
      });
      if (queued) continue;

      this.logger.warn(
        `RabbitMQ unavailable. Executing flow ${flow.id} inline for solicitation ${solicitation.id}.`,
      );
      const context: FlowExecutionContext = {
        eventName,
        entryNodeId: entryNode.id,
        submission: solicitation.submission ?? undefined,
        form: solicitation.form ?? undefined,
        fields,
        solicitation,
        flowEventDepth,
        metadata,
      };
      await this.flowsService.executeFlowWithContext(flow, context);
    }
  }
}
