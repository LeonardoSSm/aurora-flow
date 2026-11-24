import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { DashboardsService } from './dashboards.service';
import type { WidgetQueryService } from './widget-query.service';
import type { UpsertDashboardDto } from './dto/dashboard.dto';
import { fakeProcessAccess, grantsFor } from '../access/testing/fake-process-access';

/**
 * Persistencia do painel.
 *
 * O foco aqui e o que so este servico decide: quem pode montar, como o painel
 * e substituido, e o que acontece quando um widget guardado deixa de fazer
 * sentido porque o formulario mudou. A traducao de configuracao em SQL e do
 * motor, coberta em `widget-query.service.spec.ts`.
 */

const PAINEL_SALVO = {
  id: 'dash-id',
  formId: 'form-id',
  name: 'Painel de compras',
  description: null,
  widgets: [
    {
      id: 'w1',
      title: 'Total',
      kind: 'kpi',
      configJson: { agregacao: 'contagem' } as Record<string, unknown>,
      position: 0,
      x: 0,
      y: 0,
      w: 6,
      h: 3,
    },
  ],
};

function makeService(options: {
  podeGerenciar?: boolean;
  painel?: typeof PAINEL_SALVO | null;
  executar?: jest.Mock;
  campos?: unknown[];
} = {}) {
  const executar = options.executar ?? jest.fn().mockResolvedValue({ tipo: 'kpi', valor: 7, pontos: [] });

  const widgetQuery = {
    listarCamposDisponiveis: jest.fn().mockResolvedValue(options.campos ?? []),
    executar,
  } as unknown as WidgetQueryService;

  const painel = options.painel === undefined ? PAINEL_SALVO : options.painel;
  const dashboardsRepo = {
    findOne: jest.fn().mockResolvedValue(painel),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const widgetsRepo = { find: jest.fn().mockResolvedValue([]) };

  const managerWidgetsRepo = {
    find: jest.fn().mockResolvedValue(painel?.widgets ?? []),
    delete: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockImplementation((data: unknown) => Promise.resolve(data)),
    create: jest.fn().mockImplementation((data: unknown) => data),
  };
  const managerDashboardsRepo = {
    findOne: jest.fn().mockResolvedValue(painel),
    save: jest.fn().mockImplementation((data: unknown) => Promise.resolve({ id: 'dash-id', ...(data as object) })),
    create: jest.fn().mockImplementation((data: unknown) => data),
  };

  const manager = {
    getRepository: jest.fn().mockImplementation((entity: { name: string }) =>
      entity.name === 'DashboardEntity' ? managerDashboardsRepo : managerWidgetsRepo,
    ),
  };
  const dataSource = {
    transaction: jest.fn().mockImplementation((cb: (m: typeof manager) => Promise<unknown>) => cb(manager)),
  } as unknown as DataSource;

  // "Montar o painel do processo": com a permissão, acesso total; sem, nenhum vínculo.
  const permissionsService = fakeProcessAccess({
    resolve: (actor) => grantsFor(actor.sub, options.podeGerenciar ?? true),
  });

  const service = new DashboardsService(
    dataSource,
    widgetQuery,
    permissionsService as never,
    dashboardsRepo as never,
    widgetsRepo as never,
  );

  return { service, widgetQuery, executar, dashboardsRepo, managerWidgetsRepo, permissionsService };
}

const DTO: UpsertDashboardDto = {
  name: 'Painel de compras',
  description: null,
  widgets: [
    { title: 'Total', kind: 'kpi', configJson: { agregacao: 'contagem' }, position: 0, w: 6, h: 3 },
  ],
};

describe('DashboardsService — permissão de gestão', () => {
  it('quem não tem dashboards.manage não salva', async () => {
    const { service } = makeService({ podeGerenciar: false });
    await expect(service.salvarPainel('form-id', DTO, 'actor', 'viewer')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('quem não tem dashboards.manage não remove', async () => {
    const { service } = makeService({ podeGerenciar: false });
    await expect(service.removerPainel('form-id', 'actor', 'viewer')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('quem não tem dashboards.manage não pré-visualiza', async () => {
    const { service } = makeService({ podeGerenciar: false });
    await expect(
      service.previsualizar('form-id', { tipo: 'kpi' }, 'actor', 'viewer'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('quem só lê continua vendo o painel, marcado como não editável', async () => {
    const { service } = makeService({ podeGerenciar: false });
    const painel = await service.obterPainel('form-id', 'actor', 'viewer');

    expect(painel?.podeEditar).toBe(false);
    expect(painel?.widgets).toHaveLength(1);
  });

  it('quem tem a permissão recebe o painel como editável', async () => {
    const { service } = makeService({ podeGerenciar: true });
    const painel = await service.obterPainel('form-id', 'actor', 'manager');
    expect(painel?.podeEditar).toBe(true);
  });
});

describe('DashboardsService — leitura', () => {
  it('formulário sem painel devolve uma sugestão, não vazio', async () => {
    const { service } = makeService({ painel: null });
    const painel = await service.obterPainel('form-id', 'actor', 'admin');

    expect(painel.gerado).toBe(true);
    expect(painel.id).toBe('');
    expect(painel.widgets.length).toBeGreaterThan(0);
    // O que a aba Analytics entregava precisa continuar de pé.
    expect(painel.widgets.map((w) => w.title)).toEqual(
      expect.arrayContaining(['Total de respostas', 'Últimos 30 dias', 'Volume de respostas']),
    );
  });

  it('painel salvo não é marcado como gerado', async () => {
    const { service } = makeService();
    const painel = await service.obterPainel('form-id', 'actor', 'admin');
    expect(painel.gerado).toBe(false);
  });

  it('a sugestão inclui os campos do formulário, respeitando o teto de blocos', async () => {
    const muitosCampos = Array.from({ length: 20 }, (_, i) => ({
      code: `campo_${i}`,
      label: `Campo ${i}`,
      fieldType: 'single_select',
      tiposDeWidget: ['kpi', 'categorias'],
      agregacoes: ['contagem'],
    }));
    const { service } = makeService({ painel: null, campos: muitosCampos });

    const painel = await service.obterPainel('form-id', 'actor', 'admin');

    expect(painel.widgets.length).toBeLessThanOrEqual(8);
    expect(painel.widgets.some((w) => w.kind === 'categorias')).toBe(true);
  });

  it('a sugestão já vem com layout — nasce pronta para a grade livre', async () => {
    // Sem posição salva nenhuma, o próprio backend empacota os blocos antes
    // de devolver: a tela nunca recebe x/y/w/h zerados e sobrepostos.
    const { service } = makeService({ painel: null });
    const painel = await service.obterPainel('form-id', 'actor', 'admin');

    for (const widget of painel.widgets) {
      expect(widget.w).toBeGreaterThan(0);
      expect(widget.h).toBeGreaterThan(0);
      expect(widget.x + widget.w).toBeLessThanOrEqual(12);
    }
    // Dois blocos não podem começar no mesmo lugar.
    const posicoes = painel.widgets.map((w) => `${w.x},${w.y}`);
    expect(new Set(posicoes).size).toBe(posicoes.length);
  });

  it('período do topo sobrepõe o de cada bloco', async () => {
    const { service, executar } = makeService();
    await service.obterPainel('form-id', 'actor', 'admin', 7);

    expect(executar).toHaveBeenCalledWith(
      'form-id',
      expect.objectContaining({ periodoDias: 7 }),
      'actor',
    );
  });

  it('sem período no topo, cada bloco mantém o seu', async () => {
    const { service, executar } = makeService({
      painel: {
        ...PAINEL_SALVO,
        widgets: [{ ...PAINEL_SALVO.widgets[0], configJson: { agregacao: 'contagem', periodoDias: 90 } }],
      },
    });
    await service.obterPainel('form-id', 'actor', 'admin');

    expect(executar).toHaveBeenCalledWith(
      'form-id',
      expect.objectContaining({ periodoDias: 90 }),
      'actor',
    );
  });

  it('calcula cada widget ao vivo na leitura', async () => {
    const { service, executar } = makeService();
    const painel = await service.obterPainel('form-id', 'actor', 'admin');

    expect(executar).toHaveBeenCalledTimes(1);
    expect(painel?.widgets[0].resultado).toEqual({ tipo: 'kpi', valor: 7, pontos: [] });
    expect(painel?.widgets[0].erro).toBeNull();
  });

  it('widget quebrado não derruba o painel — o erro fica contido no bloco', async () => {
    const executar = jest.fn().mockRejectedValue(new Error('Campo "removido" não existe neste formulário.'));
    const { service } = makeService({ executar });

    const painel = await service.obterPainel('form-id', 'actor', 'admin');

    expect(painel?.widgets[0].resultado).toBeNull();
    expect(painel?.widgets[0].erro).toContain('não existe');
  });

  it('respeita a ordem de posição dos widgets', async () => {
    const { service } = makeService({
      painel: {
        ...PAINEL_SALVO,
        widgets: [
          { ...PAINEL_SALVO.widgets[0], id: 'b', title: 'Segundo', position: 2 },
          { ...PAINEL_SALVO.widgets[0], id: 'a', title: 'Primeiro', position: 1 },
        ],
      },
    });

    const painel = await service.obterPainel('form-id', 'actor', 'admin');
    expect(painel?.widgets.map((w) => w.title)).toEqual(['Primeiro', 'Segundo']);
  });

  it('acesso ao formulário é conferido antes de tocar no painel', async () => {
    const { service, widgetQuery } = makeService();
    await service.obterPainel('form-id', 'actor', 'admin');
    expect(widgetQuery.listarCamposDisponiveis).toHaveBeenCalledWith('form-id', 'actor');
  });
});

describe('DashboardsService — escrita', () => {
  it('valida todo widget contra o formulário antes de gravar', async () => {
    const executar = jest.fn().mockRejectedValue(new Error('A agregação "media" não se aplica.'));
    const { service, managerWidgetsRepo } = makeService({ executar });

    await expect(service.salvarPainel('form-id', DTO, 'actor', 'admin')).rejects.toThrow(
      /não se aplica/,
    );
    expect(managerWidgetsRepo.save).not.toHaveBeenCalled();
  });

  it('remove os widgets que não vieram no envio', async () => {
    const { service, managerWidgetsRepo } = makeService();
    // O painel guardado tem 'w1'; o DTO envia um widget novo, sem id.
    await service.salvarPainel('form-id', DTO, 'actor', 'admin');

    expect(managerWidgetsRepo.delete).toHaveBeenCalledWith(
      expect.objectContaining({ id: expect.anything() }),
    );
  });

  it('usa o índice do array quando a posição não vem informada', async () => {
    const { service, managerWidgetsRepo } = makeService();
    await service.salvarPainel(
      'form-id',
      {
        ...DTO,
        widgets: [
          { title: 'A', kind: 'kpi', configJson: {} },
          { title: 'B', kind: 'kpi', configJson: {} },
        ],
      },
      'actor',
      'admin',
    );

    const posicoes = managerWidgetsRepo.save.mock.calls.map(
      (call) => (call[0] as { position: number }).position,
    );
    expect(posicoes).toEqual([0, 1]);
  });

  it('remover painel inexistente devolve 404', async () => {
    const { service } = makeService({ painel: null });
    await expect(service.removerPainel('form-id', 'actor', 'admin')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('remover apaga o painel — os widgets caem por cascade', async () => {
    const { service, dashboardsRepo } = makeService();
    await service.removerPainel('form-id', 'actor', 'admin');
    expect(dashboardsRepo.delete).toHaveBeenCalledWith({ id: 'dash-id' });
  });
});
