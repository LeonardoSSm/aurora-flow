import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  LOPS_AI_DEFAULT_TIMEOUT_MS,
  resolveLopsAiEndpoint,
  resolveLopsAiListingConnection,
} from './lops-ai.config';
import { LopsAiService } from './lops-ai.service';

function makeConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

const ENV = {
  LOPS_AI_BASE_URL: 'https://lops.example.com/api/v1/',
  LOPS_AI_API_KEY: 'env-key',
  LOPS_AI_TIMEOUT_MS: '12000',
};

function makeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('resolveLopsAiEndpoint (URL e timeout, sem chave)', () => {
  it('usa a URL (sem barra final) e o timeout do servidor', () => {
    expect(resolveLopsAiEndpoint(makeConfig(ENV))).toEqual({
      baseUrl: 'https://lops.example.com/api/v1',
      timeoutMs: 12000,
    });
  });

  it('usa 30s quando LOPS_AI_TIMEOUT_MS está ausente ou inválido', () => {
    expect(resolveLopsAiEndpoint(makeConfig({ ...ENV, LOPS_AI_TIMEOUT_MS: undefined })).timeoutMs).toBe(
      LOPS_AI_DEFAULT_TIMEOUT_MS,
    );
    expect(resolveLopsAiEndpoint(makeConfig({ ...ENV, LOPS_AI_TIMEOUT_MS: 'abc' })).timeoutMs).toBe(
      LOPS_AI_DEFAULT_TIMEOUT_MS,
    );
    expect(resolveLopsAiEndpoint(makeConfig({ ...ENV, LOPS_AI_TIMEOUT_MS: '-5' })).timeoutMs).toBe(
      LOPS_AI_DEFAULT_TIMEOUT_MS,
    );
  });

  it('a URL e o timeout do nó têm precedência sobre os do servidor', () => {
    expect(
      resolveLopsAiEndpoint(makeConfig(ENV), { baseUrl: ' https://legado.example.com/ ', timeoutMs: 5000 }),
    ).toEqual({ baseUrl: 'https://legado.example.com', timeoutMs: 5000 });
  });

  it('avisa que falta a URL e não expõe nenhuma chave no resultado', () => {
    expect(() => resolveLopsAiEndpoint(makeConfig({ LOPS_AI_API_KEY: 'k' }))).toThrow(/LOPS_AI_BASE_URL/);
    expect(Object.keys(resolveLopsAiEndpoint(makeConfig(ENV)))).toEqual(['baseUrl', 'timeoutMs']);
  });
});

describe('resolveLopsAiListingConnection (chave do servidor, só para listar)', () => {
  it('junta URL, timeout e a chave do servidor', () => {
    expect(resolveLopsAiListingConnection(makeConfig(ENV))).toEqual({
      baseUrl: 'https://lops.example.com/api/v1',
      timeoutMs: 12000,
      apiKey: 'env-key',
    });
  });

  it('avisa qual variável falta', () => {
    expect(() => resolveLopsAiListingConnection(makeConfig({ LOPS_AI_API_KEY: 'k' }))).toThrow(
      /LOPS_AI_BASE_URL/,
    );
    expect(() => resolveLopsAiListingConnection(makeConfig({ LOPS_AI_BASE_URL: 'https://x' }))).toThrow(
      /LOPS_AI_API_KEY/,
    );
    expect(() =>
      resolveLopsAiListingConnection(makeConfig({ ...ENV, LOPS_AI_API_KEY: '   ' })),
    ).toThrow(/LOPS_AI_API_KEY/);
  });
});

describe('LopsAiService.listAgents', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('consulta /models com a chave do servidor no X-API-Key e devolve os agentes', async () => {
    fetchSpy.mockResolvedValue(
      makeResponse(200, {
        models: ['gemini-3.5-flash'],
        agents: [
          {
            slug: 'validador-de-etiquetas',
            name: 'WMS - Validador de Etiquetas',
            model: 'gemini-3.5-flash',
            source: 'agent',
            visionModel: 'gemini-3.5-flash',
          },
        ],
      }),
    );
    const service = new LopsAiService(makeConfig(ENV));

    const agents = await service.listAgents();

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://lops.example.com/api/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ 'X-API-Key': 'env-key' }),
      }),
    );
    expect(agents).toEqual([
      {
        slug: 'validador-de-etiquetas',
        name: 'WMS - Validador de Etiquetas',
        model: 'gemini-3.5-flash',
        visionModel: 'gemini-3.5-flash',
        source: 'agent',
      },
    ]);
  });

  it('ordena por nome, usa o slug quando falta o nome e ignora entradas sem slug', async () => {
    fetchSpy.mockResolvedValue(
      makeResponse(200, {
        agents: [
          { slug: 'zeta', name: 'Zeta' },
          { name: 'Sem slug' },
          'lixo',
          null,
          { slug: 'alfa' },
        ],
      }),
    );

    const agents = await new LopsAiService(makeConfig(ENV)).listAgents();

    expect(agents.map((agent) => agent.slug)).toEqual(['alfa', 'zeta']);
    expect(agents[0]).toEqual({
      slug: 'alfa',
      name: 'alfa',
      model: null,
      visionModel: null,
      source: null,
    });
  });

  it('devolve lista vazia quando a resposta não tem "agents"', async () => {
    fetchSpy.mockResolvedValue(makeResponse(200, { models: [] }));

    await expect(new LopsAiService(makeConfig(ENV)).listAgents()).resolves.toEqual([]);
  });

  it('responde 503 com o motivo quando o servidor não tem a chave configurada, sem chamar a LOPS IA', async () => {
    const service = new LopsAiService(makeConfig({ LOPS_AI_BASE_URL: 'https://x' }));

    await expect(service.listAgents()).rejects.toThrow(ServiceUnavailableException);
    await expect(service.listAgents()).rejects.toThrow(/LOPS_AI_API_KEY/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('explica quando a LOPS IA recusa a chave (401/403), sem vazar a chave', async () => {
    fetchSpy.mockResolvedValue(makeResponse(401, { message: 'unauthorized' }));
    const service = new LopsAiService(makeConfig(ENV));

    const error = await service.listAgents().catch((e: Error) => e);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as Error).message).toMatch(/recusou a chave/);
    expect((error as Error).message).not.toContain('env-key');
  });

  it('responde 503 quando a LOPS IA falha (status 5xx) ou fica fora do ar', async () => {
    const service = new LopsAiService(makeConfig(ENV));

    fetchSpy.mockResolvedValueOnce(makeResponse(500, {}));
    await expect(service.listAgents()).rejects.toThrow(/status 500/);

    fetchSpy.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    await expect(service.listAgents()).rejects.toThrow(/ECONNREFUSED/);
  });

  it('responde 503 quando o corpo não é JSON válido', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('Unexpected token <')),
    } as unknown as Response);

    await expect(new LopsAiService(makeConfig(ENV)).listAgents()).rejects.toThrow(
      /resposta inválida/,
    );
  });
});
