import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import type { SolicitationCreatedEvent } from '../../common/events/solicitation-events';
import { RealtimeService } from './realtime.service';

/** Eventos que mudam o que o Resumo e o Kanban mostram. */
export const REALTIME_CHANGE_EVENTS = [
  'solicitations.created',
  'solicitations.status_changed',
  'solicitations.assignee_changed',
  'solicitations.priority_changed',
  'solicitations.moved',
  'solicitations.phase_changed',
  'solicitations.phase_sla.warning',
  'solicitations.phase_sla.breached',
  'approvals.created',
  'approvals.approved',
  'approvals.rejected',
  'approvals.cancelled',
] as const;

@Injectable()
export class RealtimeListener implements OnModuleInit, OnModuleDestroy {
  // Um array em @OnEvent vira UM nome com partes no EventEmitter2 (a.b.c), não vários eventos.
  private readonly onChanged = (): void => this.realtimeService.broadcastChanged();

  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit(): void {
    for (const name of REALTIME_CHANGE_EVENTS) this.eventEmitter.on(name, this.onChanged);
  }

  onModuleDestroy(): void {
    for (const name of REALTIME_CHANGE_EVENTS) this.eventEmitter.off(name, this.onChanged);
  }

  @OnEvent('solicitations.created', { async: true })
  async onCreated(event: SolicitationCreatedEvent): Promise<void> {
    await this.realtimeService.notifyCreated(event.solicitationId, event.actorId);
  }
}
