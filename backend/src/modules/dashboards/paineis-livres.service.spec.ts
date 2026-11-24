import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { PaineisLivresService } from './paineis-livres.service';
import type { SolicitacaoQueryService } from './solicitacao-query.service';
import type { WidgetQueryService } from './widget-query.service';
import type { UpsertPainelLivreDto } from './dto/painel-livre.dto';

/**
 * Paineis livres.
 *
 * O que so este servico decide, em ordem de importancia: que publicar um painel
 * nao publica os dados dele, que um painel privado alheio nao existe para quem
 * nao e dono, e que um bloco quebrado nao derruba o painel. A traducao de
 * configuracao em SQL e do motor, coberta em `widget-query.service.spec.ts`.
 */

const DONO = 'dono-id';
const OUTRO = 'outro-id';

function fazerPainel(over: Record<string, unknown> = {}) {
  return {
    id: 'painel-id',
    formId: null,
    name: 'Compras e RH',
    description: null,
    createdBy: DONO,
    publishedAt: null,
    updatedAt: new Date('2026-09-01T12:00:00Z'),
    widgets: [
      {
        id: 'w1',
        title: 'Total de compras',
        kind: 'kpi',
        configJson: { formId: 'form-compras', agregacao: 'contagem' } as Record<string, unknown>,
        position: 0,
        w: 6,
        h: 3,
      },
    ],
    ...over,
  };
}

function makeService(
  options: {
    painel?: ReturnType<typeof fazerPainel> | null;
    lista?: Array<ReturnType<typeof fazerPainel>>;
    executar?: jest.Mock;
    executarSolicitacao?: jest.Mock;
    podeGerenciar?: boolean;
    escopo?: string;
  } = {},
) {
  const executar =
    options.executar ?? jest.fn().mockResolvedValue({ tipo: 'kpi', valor: 7, pontos: [] });
  const widgetQuery = { executar } as unknown as WidgetQueryService;

  const executarSolicitacao =
    options.executarSolicitacao ??
    jest.fn().mockResolvedValue({ tipo: 'kpi', valor: 3, pontos: [] });
  const solicitacaoQuery = {
    executar: executarSolicitacao,
  } as unknown as SolicitacaoQueryService;

  const painel = options.painel === undefined ? fazerPainel() : options.painel;
  const dashboardsRepo = {
    find: jest.fn().mockResolvedValue(options.lista ?? []),
    findOne: jest.fn().mockResolvedValue(painel),
    save: jest.fn().mockImplementation((dados: unknown) => Promise.resolve(dados)),
    create: jest.fn().mockImplementation((dados: unknown) => ({ id: 'novo-id', ...(dados as object) })),
    delete: jest.fn().mockResolvedValue(undefined),
  };

  const widgetsRepo = {
    createQueryBuilder: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([{ dashboardId: 'painel-id', total: 3 }]),
    }),
  };

  const managerWidgetsRepo = {
    find: jest.fn().mockResolvedValue(painel?.widgets ?? []),
    delete: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockImplementation((dados: unknown) => Promise.resolve(dados)),
    create: jest.fn().mockImplementation((dados: unknown) => dados),
  };
  const manager = {
    getRepository: jest.fn().mockImplementation((entity: { name: string }) =>
      entity.name === 'DashboardEntity' ? dashboardsRepo : managerWidgetsRepo,
    ),
  };
  const dataSource = {
    transaction: jest
      .fn()
      .mockImplementation((cb: (m: typeof manager) => Promise<unknown>) => cb(manager)),
  } as unknown as DataSource;

  const permissionsService = {
    hasAny: jest.fn().mockResolvedValue(options.podeGerenciar ?? true),
    getScope: jest.fn().mockResolvedValue(options.escopo ?? 'own'),
  };

  const service = new PaineisLivresService(
    dataSource,
    widgetQuery,
    solicitacaoQuery,
    permissionsService as never,
    dashboardsRepo as never,
    widgetsRepo as never,
  );

  return {
    service,
    executar,
    executarSolicitacao,
    dashboardsRepo,
    managerWidgetsRepo,
    permissionsService,
  };
}

function dto(over: Partial<UpsertPainelLivreDto> = {}): UpsertPainelLivreDto {
  return {
    name: 'Compras e RH',
    description: null,
    widgets: [
      {
        title: 'Total de compras',
        kind: 'kpi',
        configJson: { formId: 'form-compras', agregacao: 'contagem' },
      },
    ],
    ...over,
  } as UpsertPainelLivreDto;
}

describe('PaineisLivresService — lista', () => {
  it('traz os próprios e os publicados por outros, marcando quem é de quem', async () => {
    const { service } = makeService({
      lista: [
        fazerPainel({ id: 'meu', createdBy: DONO }),
        fazerPainel({ id: 'alheio', createdBy: OUTRO, publishedAt: new Date() }),
      ],
    });

    const lista = await service.listar(DONO);

    expect(lista.map((item) => [item.id, item.ehDono, item.publicado])).toEqual([
      ['meu', true, false],
      ['alheio', false, true],
    ]);
  });

  it('conta os blocos sem carregar nenhum', async () => {
    const { service } = makeService({ lista: [fazerPainel()] });
    const lista = await service.listar(DONO);
    expect(lista[0].totalWidgets).toBe(3);
  });
});

describe('PaineisLivresService — quem abre', () => {
  it('painel privado de outra pessoa não existe — 404, não 403', async () => {
    // 403 confirmaria que o painel existe, que é justamente o que não se quer
    // contar para quem não deveria saber dele.
    const { service } = makeService({ painel: fazerPainel({ createdBy: OUTRO }) });
    await expect(service.obter('painel-id', DONO, 'editor')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('painel publicado abre para quem não é dono, mas sem poder editar', async () => {
    const { service } = makeService({
      painel: fazerPainel({ createdBy: OUTRO, publishedAt: new Date() }),
      escopo: 'own',
    });

    const painel = await service.obter('painel-id', DONO, 'manager');

    expect(painel.ehDono).toBe(false);
    expect(painel.podeEditar).toBe(false);
  });

  it('quem tem gestão com escopo total edita painel alheio', async () => {
    // Senão um painel publicado por alguém que saiu da empresa ficaria órfão.
    const { service } = makeService({
      painel: fazerPainel({ createdBy: OUTRO, publishedAt: new Date() }),
      escopo: 'all',
    });

    const painel = await service.obter('painel-id', DONO, 'admin');
    expect(painel.podeEditar).toBe(true);
  });
});

describe('PaineisLivresService — cálculo dos blocos', () => {
  it('cada bloco é calculado com o formulário que ele próprio declara', async () => {
    const { service, executar } = makeService({
      painel: fazerPainel({
        widgets: [
          { id: 'a', title: 'A', kind: 'kpi', configJson: { formId: 'form-a' }, position: 0, w: 6, h: 3 },
          { id: 'b', title: 'B', kind: 'kpi', configJson: { formId: 'form-b' }, position: 1, w: 6, h: 3 },
        ],
      }),
    });

    await service.obter('painel-id', DONO, 'admin');

    expect(executar.mock.calls.map((chamada) => chamada[0])).toEqual(['form-a', 'form-b']);
  });

  it('o acesso é conferido bloco a bloco, com a identidade de quem abre', async () => {
    // É isto que faz publicar não vazar dado: quem abre um painel alheio é
    // quem paga o pedágio de acesso em cada formulário.
    const { service, executar } = makeService({
      painel: fazerPainel({ createdBy: OUTRO, publishedAt: new Date() }),
    });

    await service.obter('painel-id', DONO, 'admin');

    expect(executar).toHaveBeenCalledWith(expect.anything(), expect.anything(), DONO);
  });

  it('bloco sobre formulário invisível falha sozinho, o resto do painel fica', async () => {
    const executar = jest
      .fn()
      .mockResolvedValueOnce({ tipo: 'kpi', valor: 5, pontos: [] })
      .mockRejectedValueOnce(new ForbiddenException('Acesso negado.'));
    const { service } = makeService({
      executar,
      painel: fazerPainel({
        widgets: [
          { id: 'a', title: 'A', kind: 'kpi', configJson: { formId: 'form-a' }, position: 0, w: 6, h: 3 },
          { id: 'b', title: 'B', kind: 'kpi', configJson: { formId: 'form-b' }, position: 1, w: 6, h: 3 },
        ],
      }),
    });

    const painel = await service.obter('painel-id', DONO, 'editor');

    expect(painel.widgets[0].resultado).toEqual({ tipo: 'kpi', valor: 5, pontos: [] });
    expect(painel.widgets[1].resultado).toBeNull();
    expect(painel.widgets[1].erro).toBe('Acesso negado.');
  });

  it('bloco sem formulário nem chega ao motor', async () => {
    const { service, executar } = makeService({
      painel: fazerPainel({
        widgets: [{ id: 'a', title: 'A', kind: 'kpi', configJson: {}, position: 0, w: 6, h: 3 }],
      }),
    });

    const painel = await service.obter('painel-id', DONO, 'admin');

    expect(executar).not.toHaveBeenCalled();
    expect(painel.widgets[0].erro).toMatch(/de qual formulário/);
  });

  it('o período do topo sobrepõe o de cada bloco', async () => {
    const { service, executar } = makeService({
      painel: fazerPainel({
        widgets: [
          {
            id: 'a',
            title: 'A',
            kind: 'kpi',
            configJson: { formId: 'form-a', periodoDias: 7 },
            position: 0,
            w: 6,
            h: 3,
          },
        ],
      }),
    });

    await service.obter('painel-id', DONO, 'admin', 90);

    expect(executar).toHaveBeenCalledWith(
      'form-a',
      expect.objectContaining({ periodoDias: 90 }),
      DONO,
    );
  });

  it('sem período no topo, cada bloco mantém o seu', async () => {
    const { service, executar } = makeService({
      painel: fazerPainel({
        widgets: [
          {
            id: 'a',
            title: 'A',
            kind: 'kpi',
            configJson: { formId: 'form-a', periodoDias: 7 },
            position: 0,
            w: 6,
            h: 3,
          },
        ],
      }),
    });

    await service.obter('painel-id', DONO, 'admin');

    expect(executar).toHaveBeenCalledWith(
      'form-a',
      expect.objectContaining({ periodoDias: 7 }),
      DONO,
    );
  });
});

describe('PaineisLivresService — filtros globais', () => {
  it('área e status do topo chegam a todo bloco, mesmo que o bloco não os tenha', async () => {
    const { service, executar } = makeService({
      painel: fazerPainel({
        widgets: [
          { id: 'a', title: 'A', kind: 'kpi', configJson: { formId: 'form-a' }, position: 0, w: 6, h: 3 },
        ],
      }),
    });

    await service.obter('painel-id', DONO, 'admin', undefined, 'area-rh', 'in_analysis');

    expect(executar).toHaveBeenCalledWith(
      'form-a',
      expect.objectContaining({ areaId: 'area-rh', statusSolicitacao: 'in_analysis' }),
      DONO,
    );
  });

  it('sem filtro global, nenhum dos dois é passado ao motor', async () => {
    const { service, executar } = makeService();
    await service.obter('painel-id', DONO, 'admin');

    expect(executar).toHaveBeenCalledWith(
      'form-compras',
      expect.objectContaining({ areaId: undefined, statusSolicitacao: undefined }),
      DONO,
    );
  });
});

describe('PaineisLivresService — fonte do bloco', () => {
  it('bloco de solicitações vai para o motor de solicitações, sem formulário', async () => {
    const { service, executar, executarSolicitacao } = makeService({
      painel: fazerPainel({
        widgets: [
          {
            id: 'a',
            title: 'Fila por status',
            kind: 'categorias',
            configJson: { fonte: 'solicitacoes', dimensao: 'status' },
            position: 0,
            w: 6,
            h: 3,
          },
        ],
      }),
    });

    const painel = await service.obter('painel-id', DONO, 'admin');

    expect(executar).not.toHaveBeenCalled();
    expect(executarSolicitacao).toHaveBeenCalledWith(
      expect.objectContaining({ fonte: 'solicitacoes', dimensao: 'status' }),
      DONO,
      'admin',
    );
    expect(painel.widgets[0].erro).toBeNull();
  });

  it('bloco de solicitações não exige formulário para ser salvo', async () => {
    const { service, managerWidgetsRepo } = makeService();
    const comSolicitacao = dto({
      widgets: [
        {
          title: 'Fila por status',
          kind: 'categorias',
          configJson: { fonte: 'solicitacoes', dimensao: 'status' },
        },
      ] as never,
    });

    await service.salvar('painel-id', comSolicitacao, DONO, 'admin');

    expect(managerWidgetsRepo.save).toHaveBeenCalled();
  });

  it('um painel mistura as duas fontes, cada bloco no seu motor', async () => {
    const { service, executar, executarSolicitacao } = makeService({
      painel: fazerPainel({
        widgets: [
          { id: 'a', title: 'A', kind: 'kpi', configJson: { formId: 'form-a' }, position: 0, w: 6, h: 3 },
          {
            id: 'b',
            title: 'B',
            kind: 'kpi',
            configJson: { fonte: 'solicitacoes' },
            position: 1,
            w: 6,
            h: 3,
          },
        ],
      }),
    });

    const painel = await service.obter('painel-id', DONO, 'admin');

    expect(executar).toHaveBeenCalledTimes(1);
    expect(executarSolicitacao).toHaveBeenCalledTimes(1);
    expect(painel.widgets.map((w) => w.resultado?.valor)).toEqual([7, 3]);
  });
});

describe('PaineisLivresService — escrita', () => {
  it('recusa montar quem não tem permissão de gestão', async () => {
    const { service } = makeService({ podeGerenciar: false });
    await expect(service.criar(dto(), DONO, 'editor')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('recusa salvar quem não é dono nem tem escopo total', async () => {
    const { service } = makeService({
      painel: fazerPainel({ createdBy: OUTRO, publishedAt: new Date() }),
      escopo: 'own',
    });
    await expect(service.salvar('painel-id', dto(), DONO, 'manager')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('valida cada bloco contra o formulário real antes de gravar', async () => {
    // Guardar configuração que já nasce inválida só adia o erro para a leitura.
    const executar = jest.fn().mockRejectedValue(new BadRequestException('Campo não existe.'));
    const { service, managerWidgetsRepo } = makeService({ executar });

    await expect(service.salvar('painel-id', dto(), DONO, 'admin')).rejects.toThrow(
      /Campo não existe/,
    );
    expect(managerWidgetsRepo.save).not.toHaveBeenCalled();
  });

  it('recusa bloco que não diz de qual formulário lê', async () => {
    const { service } = makeService();
    const semForm = dto({
      widgets: [{ title: 'Solto', kind: 'kpi', configJson: { agregacao: 'contagem' } }] as never,
    });

    await expect(service.salvar('painel-id', semForm, DONO, 'admin')).rejects.toThrow(
      /precisa de um formulário/,
    );
  });

  it('o que não vier na lista é removido', async () => {
    const { service, managerWidgetsRepo } = makeService();
    await service.salvar('painel-id', dto({ widgets: [] }), DONO, 'admin');
    expect(managerWidgetsRepo.delete).toHaveBeenCalledWith({
      id: expect.objectContaining({ _type: 'in', _value: ['w1'] }),
    });
  });

  it('recusa painel acima do teto de blocos', async () => {
    const { service } = makeService();
    const muitos = dto({
      widgets: Array.from({ length: 25 }, (_, i) => ({
        title: `Bloco ${i}`,
        kind: 'kpi',
        configJson: { formId: 'form-a' },
      })) as never,
    });

    await expect(service.salvar('painel-id', muitos, DONO, 'admin')).rejects.toThrow(/até 24/);
  });
});

describe('PaineisLivresService — publicação', () => {
  it('publicar carimba a data; despublicar limpa', async () => {
    const { service, dashboardsRepo } = makeService();

    await service.publicar('painel-id', true, DONO, 'admin');
    expect(dashboardsRepo.save.mock.calls[0][0].publishedAt).toBeInstanceOf(Date);

    await service.publicar('painel-id', false, DONO, 'admin');
    expect(dashboardsRepo.save.mock.calls[1][0].publishedAt).toBeNull();
  });

  it('quem não é dono não publica painel alheio', async () => {
    const { service } = makeService({
      painel: fazerPainel({ createdBy: OUTRO, publishedAt: new Date() }),
      escopo: 'own',
    });
    await expect(service.publicar('painel-id', false, DONO, 'manager')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
