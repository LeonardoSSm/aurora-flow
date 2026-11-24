import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveLopsAiListingConnection, type LopsAiListingConnection } from './lops-ai.config';
import type { LopsAiAgent } from './lops-ai.types';

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Descarta entradas malformadas em vez de derrubar a lista inteira por causa de uma. */
function parseAgents(body: unknown): LopsAiAgent[] {
  const rawAgents =
    body && typeof body === 'object' && Array.isArray((body as { agents?: unknown }).agents)
      ? ((body as { agents: unknown[] }).agents)
      : [];

  const agents: LopsAiAgent[] = [];
  for (const raw of rawAgents) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const slug = asNonEmptyString(item.slug);
    if (!slug) continue;
    agents.push({
      slug,
      name: asNonEmptyString(item.name) ?? slug,
      model: asNonEmptyString(item.model),
      visionModel: asNonEmptyString(item.visionModel),
      source: asNonEmptyString(item.source),
    });
  }
  return agents.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

@Injectable()
export class LopsAiService {
  private readonly logger = new Logger(LopsAiService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Lista os agentes disponíveis na LOPS IA para o editor de fluxos escolher de uma lista.
   * A chamada é feita pelo servidor (X-API-Key de LOPS_AI_API_KEY), então a chave nunca chega ao
   * navegador. Esse é o ÚNICO uso da chave do servidor: ao executar um nó, a chave usada é a que o
   * usuário colocou no próprio nó.
   */
  async listAgents(): Promise<LopsAiAgent[]> {
    let connection: LopsAiListingConnection;
    try {
      connection = resolveLopsAiListingConnection(this.configService);
    } catch (error) {
      throw new ServiceUnavailableException((error as Error).message);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), connection.timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${connection.baseUrl}/models`, {
        method: 'GET',
        headers: { 'X-API-Key': connection.apiKey, Accept: 'application/json' },
        signal: controller.signal,
      });
    } catch (error) {
      this.logger.warn(`Falha ao consultar a LOPS IA: ${(error as Error).message}`);
      throw new ServiceUnavailableException(
        `Não foi possível consultar a LOPS IA (${(error as Error).message}).`,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 401 || response.status === 403) {
      throw new ServiceUnavailableException(
        'A LOPS IA recusou a chave de API configurada em LOPS_AI_API_KEY.',
      );
    }
    if (!response.ok) {
      this.logger.warn(`LOPS IA respondeu ${response.status} em /models.`);
      throw new ServiceUnavailableException(`A LOPS IA respondeu com status ${response.status}.`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ServiceUnavailableException('A LOPS IA devolveu uma resposta inválida.');
    }
    return parseAgents(body);
  }
}
