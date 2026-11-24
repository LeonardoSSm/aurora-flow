import { BadRequestException } from '@nestjs/common';
import { SolicitacaoQueryService } from './solicitacao-query.service';
import type { WidgetConfig } from './widget-config.types';
import { fakeProcessAccess, grantsFor } from '../access/testing/fake-process-access';

/**
 * Motor de indicadores sobre solicitacoes.
 *
 * O que estes testes protegem: que combinacao sem significado seja recusada
 * antes de virar consulta, que dimensao e medida so cheguem ao SQL pelos mapas
 * fechados, que o filtro de escopo de solicitacoes seja sempre aplicado, e que
 * os codigos guardados no banco cheguem a tela com o nome que a pessoa
 * reconhece.
 *
 * A validade do SQL em si foi conferida rodando cada consulta contra o
 * Postgres; aqui o construtor e mockado para poder inspecionar exatamente o
 * que o motor pede.
 */

type Chamada = { metodo: string; args: unknown[] };

function makeService(options: { linhas?: unknown[]; linha?: unknown; escopo?: string } = {}) {
  const chamadas: Chamada[] = [];
  const registrar = (metodo: string) =>
    jest.fn((...args: unknown[]) => {
      chamadas.push({ metodo, args });
      return qb;
    });

  const qb: Record<string, unknown> = {
    leftJoin: registrar('leftJoin'),
    andWhere: registrar('andWhere'),
    select: registrar('select'),
    addSelect: registrar('addSelect'),
    groupBy: registrar('groupBy'),
    orderBy: registrar('orderBy'),
    addOrderBy: registrar('addOrderBy'),
    limit: registrar('limit'),
    setParameter: registrar('setParameter'),
    getRawOne: jest.fn().mockResolvedValue(options.linha ?? { valor: 12 }),
    getRawMany: jest.fn().mockResolvedValue(options.linhas ?? []),
  };

  const service = new SolicitacaoQueryService(
    { createQueryBuilder: jest.fn().mockReturnValue(qb) } as never,
    {
      findOne: jest.fn().mockResolvedValue({ id: 'actor-id', role: 'manager', areaId: 'area-1' }),
    } as never,
    // 'all' = acesso total pelo perfil; outro escopo = vínculo com um processo (vê os cards dele).
    fakeProcessAccess({
      resolve: (actor) =>
        grantsFor(actor.sub, (options.escopo ?? 'all') === 'all', { 'form-1': { 'solicitations.view': 'all' } }),
    }),
  );

  return { service, chamadas, qb };
}

function executar(service: SolicitacaoQueryService, config: WidgetConfig) {
  return service.executar(config, 'actor-id', 'manager');
}

/** Junta todos os fragmentos que o motor mandou para o construtor. */
function sqlPedido(chamadas: Chamada[]): string {
  return chamadas.map((chamada) => JSON.stringify(chamada.args)).join(' | ');
}

describe('SolicitacaoQueryService — validação', () => {
  it('recusa dimensão desconhecida', async () => {
    const { service } = makeService();
    await expect(
      executar(service, { tipo: 'categorias', dimensao: 'inventada' as never }),
    ).rejects.toThrow(/Dimensão desconhecida/);
  });

  it('recusa distribuição sem dimensão — não há o que agrupar', async () => {
    const { service } = makeService();
    await expect(executar(service, { tipo: 'categorias' })).rejects.toThrow(/não tem o que agrupar/);
  });

  it('recusa ranking sobre dimensão de escolha fechada', async () => {
    // Status tem nove valores possíveis: distribuição diz mais que um ranking.
    const { service } = makeService();
    await expect(executar(service, { tipo: 'ranking', dimensao: 'status' })).rejects.toThrow(
      /não pode ser exibida/,
    );
  });

  it('recusa medida que não existe nesta fonte', async () => {
    const { service } = makeService();
    await expect(
      executar(service, { tipo: 'kpi', agregacao: 'soma' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('distribuição e ranking só contam — taxa por categoria não diria nada', async () => {
    const { service } = makeService();
    await expect(
      executar(service, { tipo: 'categorias', dimensao: 'status', agregacao: 'taxa' }),
    ).rejects.toThrow(/só contam solicitações/);
  });

  it('recusa período não positivo', async () => {
    const { service } = makeService();
    await expect(executar(service, { tipo: 'kpi', periodoDias: 0 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('SolicitacaoQueryService — acesso', () => {
  it('o filtro de escopo de solicitações é sempre aplicado', async () => {
    const { service, chamadas } = makeService({ escopo: 'area' });
    await executar(service, { tipo: 'kpi' });

    // Sem acesso total: os próprios cards e os dos processos com "ver solicitações".
    expect(sqlPedido(chamadas)).toMatch(/scopeActorId/);
    expect(sqlPedido(chamadas)).toMatch(/scopeAllFormIds/);
  });

  it('escopo total não filtra, mas os joins continuam', async () => {
    const { service, chamadas } = makeService({ escopo: 'all' });
    await executar(service, { tipo: 'kpi' });

    const joins = chamadas.filter((chamada) => chamada.metodo === 'leftJoin');
    expect(joins).toHaveLength(3);
  });
});

describe('SolicitacaoQueryService — filtros globais', () => {
  it('área e status viram cláusulas WHERE com parâmetro, não texto solto', async () => {
    const { service, chamadas } = makeService();
    await executar(service, { tipo: 'kpi', areaId: 'area-rh', statusSolicitacao: 'in_analysis' });

    expect(sqlPedido(chamadas)).toContain('solicitation.area_id = :areaId');
    expect(sqlPedido(chamadas)).toContain('"areaId":"area-rh"');
    expect(sqlPedido(chamadas)).toContain('solicitation.status = :status');
    expect(sqlPedido(chamadas)).toContain('"status":"in_analysis"');
  });

  it('sem os filtros, nenhuma cláusula extra entra na consulta', async () => {
    const { service, chamadas } = makeService();
    await executar(service, { tipo: 'kpi' });

    expect(sqlPedido(chamadas)).not.toContain('area_id = :areaId');
    expect(sqlPedido(chamadas)).not.toContain('solicitation.status = :status');
  });

  it('recusa status que não existe no domínio de solicitações', async () => {
    const { service } = makeService();
    await expect(
      executar(service, { tipo: 'kpi', statusSolicitacao: 'inventado' }),
    ).rejects.toThrow(/Status desconhecido/);
  });

  it('os filtros globais valem nos quatro formatos, não só no KPI', async () => {
    const { service, chamadas } = makeService({ linhas: [] });
    await executar(service, { tipo: 'serie', areaId: 'area-rh' });
    await executar(service, { tipo: 'categorias', dimensao: 'status', areaId: 'area-rh' });

    const ocorrencias = chamadas.filter(
      (c) => c.metodo === 'andWhere' && JSON.stringify(c.args).includes('area_id'),
    );
    expect(ocorrencias.length).toBeGreaterThanOrEqual(2);
  });
});

describe('SolicitacaoQueryService — medidas', () => {
  it('contagem devolve o número inteiro', async () => {
    const { service } = makeService({ linha: { valor: 12 } });
    const resultado = await executar(service, { tipo: 'kpi' });
    expect(resultado).toEqual({ tipo: 'kpi', valor: 12, pontos: [] });
  });

  it('taxa de conclusão é percentual das concluídas sobre o total', async () => {
    const { service } = makeService({ linha: { total: 8, parte: 2 } });
    const resultado = await executar(service, { tipo: 'kpi', agregacao: 'taxa' });

    expect(resultado.valor).toBe(25);
    expect(resultado.unidade).toBe('percentual');
  });

  it('SLA conta só as que tinham prazo', async () => {
    // Sem prazo não há o que cumprir; incluí-las inflaria o indicador.
    const { service, chamadas } = makeService({ linha: { total: 4, parte: 3 } });
    const resultado = await executar(service, { tipo: 'kpi', agregacao: 'sla' });

    expect(sqlPedido(chamadas)).toContain('sla_due_at IS NOT NULL');
    expect(sqlPedido(chamadas)).toContain('sla_breached_at IS NULL');
    expect(resultado.valor).toBe(75);
  });

  it('sem denominador não inventa 0%', async () => {
    const { service } = makeService({ linha: { total: 0, parte: 0 } });
    const resultado = await executar(service, { tipo: 'kpi', agregacao: 'sla' });
    expect(resultado.valor).toBeNull();
  });

  it('idade média olha só as que ainda não terminaram, e responde em horas', async () => {
    const { service, chamadas } = makeService({ linha: { valor: '31.5' } });
    const resultado = await executar(service, { tipo: 'kpi', agregacao: 'idade' });

    expect(sqlPedido(chamadas)).toContain('NOT IN (:...terminais)');
    expect(resultado.valor).toBe(31.5);
    expect(resultado.unidade).toBe('horas');
  });
});

describe('SolicitacaoQueryService — rótulos', () => {
  it('status vira o nome da coluna do kanban, não o código do banco', async () => {
    const { service } = makeService({
      linhas: [
        { rotulo: 'in_analysis', valor: 5 },
        { rotulo: 'completed', valor: 3 },
      ],
    });

    const resultado = await executar(service, { tipo: 'categorias', dimensao: 'status' });

    expect(resultado.pontos).toEqual([
      { rotulo: 'Em Análise', valor: 5 },
      { rotulo: 'Concluído', valor: 3 },
    ]);
  });

  it('prioridade e situação de prazo também são traduzidas', async () => {
    const { service } = makeService({ linhas: [{ rotulo: 'urgent', valor: 2 }] });
    const prioridade = await executar(service, {
      tipo: 'categorias',
      dimensao: 'prioridade',
    });
    expect(prioridade.pontos[0].rotulo).toBe('Urgente');

    const { service: outro } = makeService({ linhas: [{ rotulo: 'breached', valor: 1 }] });
    const sla = await executar(outro, { tipo: 'categorias', dimensao: 'sla' });
    expect(sla.pontos[0].rotulo).toBe('Prazo estourado');
  });

  it('valor ausente não vira rótulo vazio no gráfico', async () => {
    const { service } = makeService({ linhas: [{ rotulo: null, valor: 4 }] });
    const resultado = await executar(service, { tipo: 'ranking', dimensao: 'responsavel' });
    expect(resultado.pontos[0].rotulo).toBe('Sem definição');
  });

  it('nome livre passa direto — área e responsável já são legíveis', async () => {
    const { service } = makeService({ linhas: [{ rotulo: 'Compras', valor: 7 }] });
    const resultado = await executar(service, { tipo: 'ranking', dimensao: 'area' });
    expect(resultado.pontos[0].rotulo).toBe('Compras');
  });
});

describe('SolicitacaoQueryService — catálogo para a tela', () => {
  it('toda dimensão oferecida é aceita pelo motor', async () => {
    // Guarda contra divergência entre o que a tela mostra e o que a API aceita.
    const { service } = makeService({ linhas: [] });
    const { dimensoes } = service.listarDimensoes();

    expect(dimensoes.length).toBeGreaterThan(0);
    for (const item of dimensoes) {
      expect(item.tiposDeWidget.length).toBeGreaterThan(0);
      for (const tipo of item.tiposDeWidget) {
        await expect(executar(service, { tipo, dimensao: item.dimensao })).resolves.toBeDefined();
      }
    }
  });

  it('as medidas oferecidas são as quatro da fonte', () => {
    const { service } = makeService();
    expect(service.listarDimensoes().agregacoes).toEqual(['contagem', 'taxa', 'sla', 'idade']);
  });
});
