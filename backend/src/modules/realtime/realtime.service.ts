import { randomUUID } from 'crypto';
import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { SolicitationsService } from '../solicitations/solicitations.service';

/**
 * Tempo real (SSE) para as telas abertas: avisa que algo mudou para o navegador buscar de novo o
 * que já busca — nenhum dado sai por aqui sem passar pelo escopo do usuário. A única exceção com
 * conteúdo é "chegou solicitação nova", e ela só vai para quem pode ver a solicitação.
 *
 * Conexões vivem na memória deste processo: vale enquanto o backend roda numa instância só. Com
 * mais de uma, os eventos teriam que passar pelo RabbitMQ para chegar a todas.
 */

export type RealtimeSolicitationSummary = {
  id: string;
  title: string;
  formId: string | null;
  formName: string | null;
};

export type RealtimeEvent =
  | { type: 'solicitation.created'; solicitation: RealtimeSolicitationSummary }
  | { type: 'solicitations.changed' };

export type RealtimeClient = {
  actor: JwtPayload;
  send: (event: RealtimeEvent) => void;
  close: () => void;
};

/** Abas abertas por usuário; a mais antiga fecha quando passa disso. */
export const MAX_CONNECTIONS_PER_USER = 5;
/** Rajadas (um fluxo que move vários cards) viram um aviso só. */
export const CHANGED_COALESCE_MS = 300;

@Injectable()
export class RealtimeService implements OnApplicationShutdown {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly clients = new Map<string, RealtimeClient>();
  private changedTimer: NodeJS.Timeout | null = null;

  constructor(private readonly solicitationsService: SolicitationsService) {}

  get connectionCount(): number {
    return this.clients.size;
  }

  add(client: RealtimeClient): string {
    const sameUser = [...this.clients].filter(([, c]) => c.actor.sub === client.actor.sub);
    for (const [id, old] of sameUser.slice(0, Math.max(0, sameUser.length - MAX_CONNECTIONS_PER_USER + 1))) {
      this.clients.delete(id);
      old.close();
    }
    const id = randomUUID();
    this.clients.set(id, client);
    return id;
  }

  remove(id: string): void {
    this.clients.delete(id);
  }

  /** Algo mudou em solicitações, fases ou aprovações: cada tela busca de novo o que mostra. */
  broadcastChanged(): void {
    if (this.changedTimer) return;
    this.changedTimer = setTimeout(() => {
      this.changedTimer = null;
      this.sendAll(() => ({ type: 'solicitations.changed' }));
    }, CHANGED_COALESCE_MS);
  }

  /**
   * Solicitação nova: vai para quem pode vê-la (mesmo escopo e visibilidade de fase do Kanban),
   * menos quem a criou. A checagem roda uma vez por usuário, não por aba.
   */
  async notifyCreated(solicitationId: string, creatorId: string | null): Promise<void> {
    const byUser = new Map<string, RealtimeClient[]>();
    for (const client of this.clients.values()) {
      if (client.actor.sub === creatorId) continue;
      const list = byUser.get(client.actor.sub);
      if (list) list.push(client);
      else byUser.set(client.actor.sub, [client]);
    }

    await Promise.all(
      [...byUser.values()].map(async (clients) => {
        try {
          const summary = await this.solicitationsService.describeIfVisible(
            solicitationId,
            clients[0].actor,
          );
          if (!summary) return;
          for (const client of clients) this.safeSend(client, { type: 'solicitation.created', solicitation: summary });
        } catch (error) {
          this.logger.warn({ err: error, solicitationId }, 'Realtime: falha ao checar acesso');
        }
      }),
    );
  }

  onApplicationShutdown(): void {
    if (this.changedTimer) clearTimeout(this.changedTimer);
    for (const client of this.clients.values()) client.close();
    this.clients.clear();
  }

  private sendAll(build: (client: RealtimeClient) => RealtimeEvent): void {
    for (const client of this.clients.values()) this.safeSend(client, build(client));
  }

  private safeSend(client: RealtimeClient, event: RealtimeEvent): void {
    try {
      client.send(event);
    } catch (error) {
      this.logger.warn({ err: error }, 'Realtime: falha ao enviar evento');
    }
  }
}
