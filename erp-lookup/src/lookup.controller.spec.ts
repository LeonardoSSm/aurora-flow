import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from './app.module';
import { APP_CONFIG, type AppConfig } from './config/app-config';
import { configurarApp } from './configurar-app';
import { BancoIndisponivelError, BancoNaoConfiguradoError } from './db/mysql.service';
import type { DefinicaoTabela, Fonte, ResultadoTabela } from './fontes/fonte.types';
import { FontesRegistry } from './fontes/fontes.registry';
import { TabelaInvalidaError } from './fontes/tabela';

const TOKEN = 'a'.repeat(64);
const AUTH = { Authorization: `Bearer ${TOKEN}` };

function fonte(id: string, modo: Fonte['modo']): jest.Mocked<Fonte> {
  return {
    id,
    label: id.toUpperCase(),
    modo,
    pesquisar: jest.fn().mockResolvedValue([{ value: '001', label: 'Item 001' }]),
    resolver: jest.fn().mockResolvedValue(null),
  };
}

describe('API erp-lookup (HTTP)', () => {
  let app: INestApplication;
  const pesquisa = fonte('clientes', 'pesquisa');
  const lista = fonte('filiais', 'lista');
  // Só a lista de pesquisa tem ficha.
  const detalhar = jest.fn();
  pesquisa.detalhar = detalhar;

  beforeAll(async () => {
    const config: AppConfig = {
      porta: 0,
      token: TOKEN,
      queryTimeoutMs: 5000,
      fonteExemploHabilitada: false,
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CONFIG)
      .useValue(config)
      .overrideProvider(FontesRegistry)
      .useValue({
        listar: () => [pesquisa, lista],
        obter: (id: string) => [pesquisa, lista].find((f) => f.id === id),
      })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configurarApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('/health responde sem token', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200, { status: 'ok', db: 'nao_configurado' });
  });

  it('raiz exige o token (é o "Testar conexão" do conector)', async () => {
    await request(app.getHttpServer()).get('/').expect(401);
    await request(app.getHttpServer())
      .get('/')
      .set(AUTH)
      .expect(200, { status: 'ok', servico: 'erp-lookup' });
  });

  it('recusa consulta sem token ou com token errado', async () => {
    await request(app.getHttpServer()).get('/fontes').expect(401);
    await request(app.getHttpServer())
      .get('/fontes')
      .set('Authorization', `Bearer ${'b'.repeat(64)}`)
      .expect(401);
  });

  it('lista as fontes só com id, label e modo', async () => {
    await request(app.getHttpServer())
      .get('/fontes')
      .set(AUTH)
      .expect(200, [
        { id: 'clientes', label: 'CLIENTES', modo: 'pesquisa' },
        { id: 'filiais', label: 'FILIAIS', modo: 'lista' },
      ]);
  });

  it('modo pesquisa exige pelo menos 2 caracteres', async () => {
    await request(app.getHttpServer()).get('/fontes/clientes?q=a').set(AUTH).expect(400);
    await request(app.getHttpServer()).get('/fontes/clientes').set(AUTH).expect(400);
    expect(pesquisa.pesquisar).not.toHaveBeenCalled();
  });

  it('pesquisa com limite padrão 20 e teto 50', async () => {
    const res = await request(app.getHttpServer())
      .get('/fontes/clientes?q=%20ab%20')
      .set(AUTH)
      .expect(200);
    expect(res.body).toEqual({ items: [{ value: '001', label: 'Item 001' }] });
    expect(pesquisa.pesquisar).toHaveBeenLastCalledWith('ab', 20);

    await request(app.getHttpServer()).get('/fontes/clientes?q=ab&limit=999').set(AUTH).expect(200);
    expect(pesquisa.pesquisar).toHaveBeenLastCalledWith('ab', 50);
  });

  it('modo lista carrega sem texto, até 500 itens', async () => {
    await request(app.getHttpServer()).get('/fontes/filiais').set(AUTH).expect(200);
    expect(lista.pesquisar).toHaveBeenLastCalledWith('', 500);
  });

  it('recusa limite inválido e parâmetro desconhecido', async () => {
    await request(app.getHttpServer()).get('/fontes/clientes?q=ab&limit=0').set(AUTH).expect(400);
    await request(app.getHttpServer()).get('/fontes/clientes?q=ab&limit=x').set(AUTH).expect(400);
    await request(app.getHttpServer()).get('/fontes/clientes?q=ab&sql=1').set(AUTH).expect(400);
  });

  it('lista inexistente → 404 LISTA_NAO_EXISTE', async () => {
    const pesquisa = await request(app.getHttpServer())
      .get('/fontes/nao-existe?q=ab')
      .set(AUTH)
      .expect(404);
    expect(pesquisa.body).toMatchObject({ code: 'LISTA_NAO_EXISTE' });
    const item = await request(app.getHttpServer())
      .get('/fontes/nao-existe/item?value=1')
      .set(AUTH)
      .expect(404);
    expect(item.body).toMatchObject({ code: 'LISTA_NAO_EXISTE' });
  });

  it('resolve um código: 200 quando existe, 404 quando não, 400 sem value', async () => {
    pesquisa.resolver.mockResolvedValueOnce({ value: '001', label: 'Item 001' });
    await request(app.getHttpServer())
      .get('/fontes/clientes/item?value=001')
      .set(AUTH)
      .expect(200, { value: '001', label: 'Item 001' });
    expect(pesquisa.resolver).toHaveBeenLastCalledWith('001');

    const naoAchou = await request(app.getHttpServer())
      .get('/fontes/clientes/item?value=999')
      .set(AUTH)
      .expect(404);
    expect(naoAchou.body).toMatchObject({ code: 'ITEM_NAO_ENCONTRADO' });
    await request(app.getHttpServer()).get('/fontes/clientes/item').set(AUTH).expect(400);
  });

  it('ficha do item: 200, 404 ITEM_NAO_ENCONTRADO, 404 SEM_DETALHES, 400 sem value', async () => {
    const ficha = {
      value: '001',
      label: 'Item 001',
      titulo: 'Item 001',
      alertas: [],
      resumo: [{ label: 'Cliente', valor: 'Mercado' }],
      secoes: [],
      tabelas: [],
    };
    detalhar.mockResolvedValueOnce(ficha);
    await request(app.getHttpServer())
      .get('/fontes/clientes/detalhes?value=%20001%20')
      .set(AUTH)
      .expect(200, ficha);
    expect(detalhar).toHaveBeenLastCalledWith('001');

    detalhar.mockResolvedValueOnce(null);
    const naoAchou = await request(app.getHttpServer())
      .get('/fontes/clientes/detalhes?value=999')
      .set(AUTH)
      .expect(404);
    expect(naoAchou.body).toMatchObject({ code: 'ITEM_NAO_ENCONTRADO' });

    const semFicha = await request(app.getHttpServer())
      .get('/fontes/filiais/detalhes?value=1')
      .set(AUTH)
      .expect(404);
    expect(semFicha.body).toMatchObject({ code: 'SEM_DETALHES' });

    await request(app.getHttpServer()).get('/fontes/clientes/detalhes').set(AUTH).expect(400);
    await request(app.getHttpServer()).get('/fontes/clientes/detalhes?value=1').expect(401);
  });

  it('banco fora → 503 BANCO_INDISPONIVEL', async () => {
    pesquisa.pesquisar.mockRejectedValueOnce(new BancoIndisponivelError({ code: 'ECONNREFUSED' }));
    const res = await request(app.getHttpServer())
      .get('/fontes/clientes?q=ab')
      .set(AUTH)
      .expect(503);
    expect(res.body).toMatchObject({ statusCode: 503, code: 'BANCO_INDISPONIVEL' });
  });

  it('banco não configurado → 503 BANCO_NAO_CONFIGURADO', async () => {
    pesquisa.resolver.mockRejectedValueOnce(new BancoNaoConfiguradoError());
    const res = await request(app.getHttpServer())
      .get('/fontes/clientes/item?value=001')
      .set(AUTH)
      .expect(503);
    expect(res.body).toMatchObject({ statusCode: 503, code: 'BANCO_NAO_CONFIGURADO' });
  });

  describe('tabelas', () => {
    const definicao: DefinicaoTabela = {
      id: 'itens',
      label: 'Itens',
      parametros: [
        { nome: 'pedidoId', tipo: 'numero', obrigatorio: true },
        { nome: 'filial', tipo: 'texto', obrigatorio: false },
      ],
      colunas: [{ chave: 'produto', label: 'Produto', tipo: 'texto' }],
      chaveLinha: 'id',
      maxLinhas: 500,
    };
    const resultado: ResultadoTabela = {
      versao: 1,
      tabela: 'itens',
      consultadoEm: '2026-10-08T15:30:00.000Z',
      linhas: [{ chave: '1', valores: { produto: 'Ovos' } }],
    };
    const consultarTabela = jest.fn();

    beforeAll(() => {
      pesquisa.tabelas = () => [definicao];
      pesquisa.consultarTabela = consultarTabela;
    });

    it('lista as tabelas da fonte; fonte sem tabelas → lista vazia', async () => {
      await request(app.getHttpServer())
        .get('/fontes/clientes/tabelas')
        .set(AUTH)
        .expect(200, [definicao]);
      await request(app.getHttpServer()).get('/fontes/filiais/tabelas').set(AUTH).expect(200, []);
      await request(app.getHttpServer()).get('/fontes/clientes/tabelas').expect(401);
    });

    it('consulta com os parâmetros declarados, já aparados', async () => {
      consultarTabela.mockResolvedValueOnce(resultado);

      await request(app.getHttpServer())
        .get('/fontes/clientes/tabelas/itens?pedidoId=%20123%20')
        .set(AUTH)
        .expect(200, resultado);
      expect(consultarTabela).toHaveBeenLastCalledWith('itens', { pedidoId: '123' });
    });

    it('parâmetro obrigatório ausente, não numérico, repetido, longo ou desconhecido → 400', async () => {
      const server = app.getHttpServer();
      await request(server).get('/fontes/clientes/tabelas/itens').set(AUTH).expect(400);
      await request(server)
        .get('/fontes/clientes/tabelas/itens?pedidoId=abc')
        .set(AUTH)
        .expect(400);
      await request(server)
        .get('/fontes/clientes/tabelas/itens?pedidoId=1&pedidoId=2')
        .set(AUTH)
        .expect(400);
      await request(server)
        .get('/fontes/clientes/tabelas/itens?pedidoId=1&sql=1')
        .set(AUTH)
        .expect(400);
      await request(server)
        .get(`/fontes/clientes/tabelas/itens?pedidoId=1&filial=${'x'.repeat(101)}`)
        .set(AUTH)
        .expect(400);
      expect(consultarTabela).not.toHaveBeenCalled();
    });

    it('tabela inexistente → 404 TABELA_NAO_EXISTE; registro pai inexistente → 404 ITEM_NAO_ENCONTRADO', async () => {
      const semTabela = await request(app.getHttpServer())
        .get('/fontes/filiais/tabelas/itens?pedidoId=1')
        .set(AUTH)
        .expect(404);
      expect(semTabela.body).toMatchObject({ code: 'TABELA_NAO_EXISTE' });

      consultarTabela.mockResolvedValueOnce(null);
      const naoAchou = await request(app.getHttpServer())
        .get('/fontes/clientes/tabelas/itens?pedidoId=999')
        .set(AUTH)
        .expect(404);
      expect(naoAchou.body).toMatchObject({ code: 'ITEM_NAO_ENCONTRADO' });
    });

    it('chave inválida no ERP → 502 TABELA_INVALIDA; banco fora → 503', async () => {
      consultarTabela.mockRejectedValueOnce(new TabelaInvalidaError('chave repetida'));
      const invalida = await request(app.getHttpServer())
        .get('/fontes/clientes/tabelas/itens?pedidoId=1')
        .set(AUTH)
        .expect(502);
      expect(invalida.body).toMatchObject({ code: 'TABELA_INVALIDA' });

      consultarTabela.mockRejectedValueOnce(new BancoIndisponivelError({ code: 'ETIMEDOUT' }));
      await request(app.getHttpServer())
        .get('/fontes/clientes/tabelas/itens?pedidoId=1')
        .set(AUTH)
        .expect(503);
    });
  });
});
