import { Injectable } from '@nestjs/common';
import { Resolver } from 'node:dns/promises';
import { isIP, Socket } from 'node:net';

export type ProbeResponse = {
  status: number;
  latencyMs: number;
  /** Corpo já convertido de JSON, quando a resposta é JSON. */
  json?: unknown;
};

/** Nomes que só o /etc/hosts conhece (o resolvedor DNS não os acha). */
const HOSTS_FILE_NAMES = new Set(['localhost', 'host.docker.internal']);
const DNS_TIMEOUT_MS = 1_000;

/**
 * Chamadas de rede do Mapa de serviços, isoladas para os testes trocarem por
 * mocks. Toda chamada tem timeout próprio e lança em erro de rede ou timeout.
 */
@Injectable()
export class ServiceMapProbe {
  async httpGet(
    url: string,
    options: { timeoutMs: number; headers?: Record<string, string> },
  ): Promise<ProbeResponse> {
    const startedAt = Date.now();
    await this.ensureResolvable(new URL(url).hostname);
    const response = await fetch(url, {
      headers: options.headers,
      signal: AbortSignal.timeout(Math.max(1, options.timeoutMs - (Date.now() - startedAt))),
    });
    const latencyMs = Date.now() - startedAt;
    let json: unknown;
    if (response.headers.get('content-type')?.includes('application/json')) {
      try {
        json = await response.json();
      } catch {
        json = undefined;
      }
    } else {
      // Libera a conexão sem guardar o corpo.
      await response.body?.cancel().catch(() => undefined);
    }
    return { status: response.status, latencyMs, json };
  }

  /** Abre e fecha uma conexão TCP; devolve a latência. */
  async tcpConnect(host: string, port: number, timeoutMs: number): Promise<number> {
    const startedAt = Date.now();
    await this.ensureResolvable(host);
    return new Promise((resolve, reject) => {
      const socket = new Socket();
      const finish = (error?: Error): void => {
        socket.destroy();
        if (error) reject(error);
        else resolve(Date.now() - startedAt);
      };
      socket.setTimeout(Math.max(1, timeoutMs - (Date.now() - startedAt)));
      socket.once('connect', () => finish());
      socket.once('timeout', () => finish(new Error(`Sem resposta em ${timeoutMs} ms`)));
      socket.once('error', (error) => finish(error));
      socket.connect(port, host);
    });
  }

  /**
   * Resolve o nome antes da chamada, pelo resolvedor assíncrono (c-ares). Na rede do
   * docker-compose, o nome de um container parado (pgadmin, erp-mysql-dev…) demora
   * segundos para falhar no `getaddrinfo` do fetch — e cada espera dessas ocupa uma das
   * 4 threads do pool do Node, atrasando as outras checagens e o resto do backend
   * (bcrypt, arquivos). Aqui ela falha em até 1 s sem tocar no pool.
   */
  async ensureResolvable(host: string): Promise<void> {
    if (isIP(host) !== 0 || HOSTS_FILE_NAMES.has(host)) return;
    const resolver = new Resolver({ timeout: DNS_TIMEOUT_MS, tries: 1 });
    try {
      await resolver.resolve4(host);
    } catch (error) {
      const code = (error as { code?: string }).code;
      // Nome inexistente responde rápido também no lookup normal (ou está no /etc/hosts): segue.
      if (code === 'ENOTFOUND' || code === 'ENODATA') return;
      throw Object.assign(new Error(`O nome ${host} não resolveu (${code ?? 'erro de DNS'}).`), {
        code: 'ENOTFOUND',
      });
    }
  }
}
