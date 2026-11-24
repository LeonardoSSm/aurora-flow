import axios from 'axios';
import type { ErpConnectorEntity } from '../../../../database/entities/erp-connector.entity';
import type { ErpConnectorService } from '../erp-connector.service';
import { ErpLookupBadRequestError, ErpLookupUnavailableError } from './erp-lookup.errors';
import { ErpLookupService } from './erp-lookup.service';

jest.mock('axios');
const axiosGet = axios.get as jest.Mock;

const CONNECTOR = {
  id: 'conn-1',
  name: 'Consultas ERP',
  baseUrl: 'http://erp-lookup:3100/',
  isActive: true,
  timeoutMs: 15000,
} as ErpConnectorEntity;

function setup(connector: ErpConnectorEntity | null = CONNECTOR) {
  const connectorsRepo = {
    findOne: jest.fn().mockResolvedValue(connector),
    find: jest.fn().mockResolvedValue([{ id: 'conn-1', name: 'Consultas ERP', baseUrl: 'x' }]),
  };
  const erpConnectorService = {
    validateInternalUrl: jest.fn(),
    getValidToken: jest.fn().mockResolvedValue('token-123'),
  };
  const service = new ErpLookupService(
    connectorsRepo as never,
    erpConnectorService as unknown as ErpConnectorService,
  );
  return { service, connectorsRepo, erpConnectorService };
}

function reply(status: number, data: unknown) {
  axiosGet.mockResolvedValueOnce({ status, data });
}

describe('ErpLookupService', () => {
  beforeEach(() => {
    axiosGet.mockReset();
  });

  it('pesquisa com o token do conector, timeout de no máximo 5s e devolve só value/label', async () => {
    const { service, erpConnectorService } = setup();
    reply(200, {
      items: [
        { value: '001', label: 'ACME', extra: 'ignorado' },
        { value: 2, label: 'Numérico' },
        { value: null, label: 'inválido' },
      ],
    });

    const items = await service.search('conn-1', 'clientes', 'ac', 20);

    expect(items).toEqual([
      { value: '001', label: 'ACME' },
      { value: '2', label: 'Numérico' },
    ]);
    expect(erpConnectorService.validateInternalUrl).toHaveBeenCalledWith(
      'http://erp-lookup:3100/fontes/clientes',
    );
    expect(axiosGet).toHaveBeenCalledWith('http://erp-lookup:3100/fontes/clientes', {
      params: { q: 'ac', limit: 20 },
      headers: { Authorization: 'Bearer token-123', Accept: 'application/json' },
      timeout: 5000,
      validateStatus: expect.any(Function),
    });
  });

  it('codifica o nome da lista na URL', async () => {
    const { service } = setup();
    reply(200, { items: [] });

    await service.search('conn-1', 'a/b', 'xx');

    expect(axiosGet.mock.calls[0][0]).toBe('http://erp-lookup:3100/fontes/a%2Fb');
  });

  it('modo lista (sem texto) vai para o cache; pesquisa com texto não', async () => {
    const { service } = setup();
    reply(200, { items: [{ value: '1', label: 'Filial 1' }] });
    reply(200, { items: [] });
    reply(200, { items: [] });

    await service.search('conn-1', 'filiais', '');
    await service.search('conn-1', 'filiais', '');
    expect(axiosGet).toHaveBeenCalledTimes(1);

    await service.search('conn-1', 'filiais', 'fi');
    await service.search('conn-1', 'filiais', 'fi');
    expect(axiosGet).toHaveBeenCalledTimes(3);
  });

  it('resolve: 404 ITEM_NAO_ENCONTRADO → null (e guarda no cache)', async () => {
    const { service } = setup();
    reply(404, { code: 'ITEM_NAO_ENCONTRADO', message: 'Item não encontrado nesta lista.' });

    await expect(service.resolve('conn-1', 'clientes', '999')).resolves.toBeNull();
    await expect(service.resolve('conn-1', 'clientes', '999')).resolves.toBeNull();
    expect(axiosGet).toHaveBeenCalledTimes(1);
    expect(axiosGet.mock.calls[0][1].params).toEqual({ value: '999' });
  });

  it('resolve: lista inexistente (404 LISTA_NAO_EXISTE) é configuração errada → indisponível', async () => {
    const { service } = setup();
    reply(404, { code: 'LISTA_NAO_EXISTE', message: 'Lista "x" não existe.' });

    await expect(service.resolve('conn-1', 'x', '1')).rejects.toBeInstanceOf(
      ErpLookupUnavailableError,
    );
  });

  describe('details', () => {
    const FICHA = {
      value: '3240310',
      label: 'Pedido 3240310',
      titulo: 'Pedido 3240310',
      alertas: [
        { tipo: 'perigo', texto: 'Pedido cancelado.' },
        { tipo: 'outro', texto: 'x' },
      ],
      resumo: [{ label: 'Cliente', valor: 'ACME' }, { label: 'sem valor' }],
      secoes: [
        { titulo: 'Cliente', campos: [{ label: 'Endereço', valor: 'Rua A', largo: true }] },
        { titulo: 'Vazia', campos: [] },
      ],
      tabelas: [
        {
          titulo: 'Itens',
          colunas: [
            { chave: 'produto', label: 'Produto' },
            { chave: 'total', label: 'Total', numerica: true },
          ],
          linhas: [{ produto: 'OVO', total: 'R$ 1,00', extra: 'some' }],
          total: { total: 'R$ 1,00' },
        },
        { titulo: 'Sem linhas', colunas: [{ chave: 'a', label: 'A' }], linhas: [] },
      ],
    };

    it('busca a ficha e só deixa passar o formato esperado', async () => {
      const { service } = setup();
      reply(200, FICHA);

      await expect(service.details('conn-1', 'pedidos', '3240310')).resolves.toEqual({
        value: '3240310',
        titulo: 'Pedido 3240310',
        alertas: [
          { tipo: 'perigo', texto: 'Pedido cancelado.' },
          { tipo: 'aviso', texto: 'x' },
        ],
        resumo: [{ label: 'Cliente', valor: 'ACME' }],
        secoes: [
          { titulo: 'Cliente', campos: [{ label: 'Endereço', valor: 'Rua A', largo: true }] },
        ],
        tabelas: [
          {
            titulo: 'Itens',
            colunas: [
              { chave: 'produto', label: 'Produto' },
              { chave: 'total', label: 'Total', numerica: true },
            ],
            linhas: [{ produto: 'OVO', total: 'R$ 1,00' }],
            total: { produto: '', total: 'R$ 1,00' },
          },
        ],
      });
      expect(axiosGet.mock.calls[0][0]).toBe('http://erp-lookup:3100/fontes/pedidos/detalhes');
      expect(axiosGet.mock.calls[0][1].params).toEqual({ value: '3240310' });
    });

    it.each([
      ['item inexistente', { code: 'ITEM_NAO_ENCONTRADO' }],
      ['lista sem ficha', { code: 'SEM_DETALHES' }],
      ['API anterior às fichas', { statusCode: 404, message: 'Cannot GET /fontes/x/detalhes' }],
    ])('%s (404) → null, guardado no cache', async (_caso, data) => {
      const { service } = setup();
      reply(404, data);

      await expect(service.details('conn-1', 'pedidos', '1')).resolves.toBeNull();
      await expect(service.details('conn-1', 'pedidos', '1')).resolves.toBeNull();
      expect(axiosGet).toHaveBeenCalledTimes(1);
    });

    it('lista inexistente ou resposta fora do formato → indisponível', async () => {
      const { service } = setup();
      reply(404, { code: 'LISTA_NAO_EXISTE' });
      await expect(service.details('conn-1', 'x', '1')).rejects.toBeInstanceOf(
        ErpLookupUnavailableError,
      );

      reply(200, { value: '1' });
      await expect(service.details('conn-1', 'pedidos', '2')).rejects.toBeInstanceOf(
        ErpLookupUnavailableError,
      );
    });
  });

  it('resolve devolve o item encontrado', async () => {
    const { service } = setup();
    reply(200, { value: '001', label: 'ACME' });

    await expect(service.resolve('conn-1', 'clientes', '001')).resolves.toEqual({
      value: '001',
      label: 'ACME',
    });
  });

  it.each([
    ['banco do ERP fora', 503, { code: 'BANCO_INDISPONIVEL' }],
    ['token recusado', 401, { message: 'Token inválido.' }],
    ['erro interno', 500, {}],
  ])('%s → indisponível', async (_caso, status, data) => {
    const { service } = setup();
    reply(status, data);

    await expect(service.search('conn-1', 'clientes', 'ac')).rejects.toBeInstanceOf(
      ErpLookupUnavailableError,
    );
  });

  it('API fora do ar (erro de rede) → indisponível', async () => {
    const { service } = setup();
    axiosGet.mockRejectedValueOnce(Object.assign(new Error('connect'), { code: 'ECONNREFUSED' }));

    await expect(service.search('conn-1', 'clientes', 'ac')).rejects.toBeInstanceOf(
      ErpLookupUnavailableError,
    );
  });

  it('400 da API vira erro de pesquisa com a mensagem dela', async () => {
    const { service } = setup();
    reply(400, { message: 'Digite pelo menos 2 caracteres.' });

    await expect(service.search('conn-1', 'clientes', 'a')).rejects.toEqual(
      new ErpLookupBadRequestError('Digite pelo menos 2 caracteres.'),
    );
  });

  it('conector inativo ou inexistente → indisponível, sem chamar a API', async () => {
    const inativo = setup({ ...CONNECTOR, isActive: false } as ErpConnectorEntity);
    await expect(inativo.service.search('conn-1', 'clientes', 'ac')).rejects.toBeInstanceOf(
      ErpLookupUnavailableError,
    );
    const inexistente = setup(null);
    await expect(inexistente.service.resolve('conn-1', 'clientes', '1')).rejects.toBeInstanceOf(
      ErpLookupUnavailableError,
    );
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('URL fora da rede interna → indisponível, sem chamar a API', async () => {
    const { service, erpConnectorService } = setup();
    erpConnectorService.validateInternalUrl.mockImplementation(() => {
      throw new Error('URL do ERP não permitida');
    });

    await expect(service.search('conn-1', 'clientes', 'ac')).rejects.toBeInstanceOf(
      ErpLookupUnavailableError,
    );
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('resposta fora do formato → indisponível', async () => {
    const { service } = setup();
    reply(200, '<html>proxy</html>');

    await expect(service.search('conn-1', 'clientes', 'ac')).rejects.toBeInstanceOf(
      ErpLookupUnavailableError,
    );
  });

  it('lista as fontes normalizando o modo', async () => {
    const { service } = setup();
    reply(200, [
      { id: 'clientes', label: 'Clientes', modo: 'pesquisa' },
      { id: 'filiais', label: 'Filiais', modo: 'lista' },
      { id: 'estranha', label: 'Estranha', modo: 'outro' },
      { label: 'sem id' },
    ]);

    await expect(service.listSources('conn-1')).resolves.toEqual([
      { id: 'clientes', label: 'Clientes', modo: 'pesquisa' },
      { id: 'filiais', label: 'Filiais', modo: 'lista' },
      { id: 'estranha', label: 'Estranha', modo: 'pesquisa' },
    ]);
  });

  it('conectores para o construtor: só id e nome', async () => {
    const { service } = setup();
    await expect(service.listActiveConnectors()).resolves.toEqual([
      { id: 'conn-1', name: 'Consultas ERP' },
    ]);
  });
});
