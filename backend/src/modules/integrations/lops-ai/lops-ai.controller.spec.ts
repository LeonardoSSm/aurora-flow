import { LopsAiController } from './lops-ai.controller';
import type { LopsAiService } from './lops-ai.service';

describe('LopsAiController', () => {
  it('GET /integrations/lops-ai/agents devolve { agents } vindos do serviço', async () => {
    const agents = [
      { slug: 'validador-de-etiquetas', name: 'WMS - Validador de Etiquetas', model: null, visionModel: null, source: 'agent' },
    ];
    const service = { listAgents: jest.fn().mockResolvedValue(agents) } as unknown as LopsAiService;

    const result = await new LopsAiController(service).listAgents();

    expect(result).toEqual({ agents });
  });

  it('propaga o erro do serviço (ex.: 503 com o motivo) em vez de engolir', async () => {
    const service = {
      listAgents: jest.fn().mockRejectedValue(new Error('LOPS_AI_API_KEY não está configurada no servidor.')),
    } as unknown as LopsAiService;

    await expect(new LopsAiController(service).listAgents()).rejects.toThrow(/LOPS_AI_API_KEY/);
  });
});
