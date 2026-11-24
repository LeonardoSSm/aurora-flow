import axios from 'axios';
import type { ConfigService } from '@nestjs/config';
import { EvolutionApiProvider } from './evolution-api.provider';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
  },
}));

type ConfigMap = Record<string, string | undefined>;

const DEFAULT_CONFIG: ConfigMap = {
  WHATSAPP_PROVIDER: 'evolution',
  WHATSAPP_EVOLUTION_BASE_URL: 'https://evolution.test',
  WHATSAPP_EVOLUTION_API_KEY: 'api-key',
  WHATSAPP_EVOLUTION_INSTANCE: 'formhub',
  WHATSAPP_TIMEOUT_MS: '12345',
};

function makeProvider(config: ConfigMap = DEFAULT_CONFIG): EvolutionApiProvider {
  const configService = {
    get: jest.fn((key: string, fallback?: string) => config[key] ?? fallback),
  };
  return new EvolutionApiProvider(configService as unknown as ConfigService);
}

describe('EvolutionApiProvider', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sendMessage constrói URL e body corretos', async () => {
    const provider = makeProvider();
    mockedAxios.post.mockResolvedValue({
      data: {
        key: { id: 'evolution-message-id' },
        status: 'sent',
      },
    });

    await expect(
      provider.sendMessage({ to: '5585999999999', message: 'Olá FormHub' }),
    ).resolves.toEqual({
      messageId: 'evolution-message-id',
      status: 'sent',
      rawResponse: {
        key: { id: 'evolution-message-id' },
        status: 'sent',
      },
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://evolution.test/message/sendText/formhub',
      {
        number: '5585999999999',
        text: 'Olá FormHub',
      },
      {
        headers: {
          apikey: 'api-key',
        },
        timeout: 12345,
      },
    );
  });

  it('isConfigured retorna false se variáveis obrigatórias ausentes', () => {
    const provider = makeProvider({
      WHATSAPP_PROVIDER: 'evolution',
      WHATSAPP_EVOLUTION_BASE_URL: 'https://evolution.test',
      WHATSAPP_EVOLUTION_API_KEY: '',
      WHATSAPP_EVOLUTION_INSTANCE: 'formhub',
    });

    expect(provider.isConfigured()).toBe(false);
  });

  it('isConfigured retorna false quando provider é mock', () => {
    const provider = makeProvider({
      ...DEFAULT_CONFIG,
      WHATSAPP_PROVIDER: 'mock',
    });

    expect(provider.isConfigured()).toBe(false);
  });

  it('listGroups busca os grupos sem participantes e devolve só JIDs de grupo, por nome', async () => {
    const provider = makeProvider();
    mockedAxios.get.mockResolvedValue({
      data: [
        { id: '120363000000000002@g.us', subject: 'Logística', size: 12 },
        { id: '5585999999999@s.whatsapp.net', subject: 'Contato' },
        { id: '120363000000000001@g.us', subject: '  Cancelamentos  ', size: 'x' },
        { id: '120363000000000003@g.us', subject: '' },
      ],
    });

    await expect(provider.listGroups()).resolves.toEqual([
      { id: '120363000000000003@g.us', subject: '120363000000000003@g.us', size: null },
      { id: '120363000000000001@g.us', subject: 'Cancelamentos', size: null },
      { id: '120363000000000002@g.us', subject: 'Logística', size: 12 },
    ]);
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://evolution.test/group/fetchAllGroups/formhub',
      { params: { getParticipants: 'false' }, headers: { apikey: 'api-key' }, timeout: 12345 },
    );
  });
});
