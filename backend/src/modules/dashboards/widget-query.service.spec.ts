import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FormFieldType } from '../../common/enums/form-field-type.enum';
import { WidgetQueryService } from './widget-query.service';
import { fakeProcessAccess, grantsFor } from '../access/testing/fake-process-access';
import {
  agregacoesDoTipo,
  tiposDeWidgetDoCampo,
  type WidgetConfig,
} from './widget-config.types';

/**
 * O motor de indicadores.
 *
 * O que estes testes protegem, em ordem de importância: que nada vindo do
 * cliente vire fragmento de SQL, que combinação sem significado seja recusada
 * antes de virar consulta, e que o acesso seja o mesmo do formulário.
 *
 * A validade do SQL em si foi conferida rodando cada uma das quatro consultas
 * contra o Postgres; aqui o banco é mockado para poder inspecionar exatamente
 * o texto e os parâmetros que o motor produz.
 */

const CAMPOS = [
  { code: 'valor_total', label: 'Valor total', fieldType: FormFieldType.CURRENCY },
  { code: 'quantidade', label: 'Quantidade', fieldType: FormFieldType.NUMBER },
  { code: 'categoria', label: 'Categoria', fieldType: FormFieldType.SINGLE_SELECT },
  { code: 'areas', label: 'Áreas', fieldType: FormFieldType.MULTI_SELECT },
  { code: 'cidade', label: 'Cidade', fieldType: FormFieldType.SHORT_TEXT },
  { code: 'secao', label: 'Seção', fieldType: FormFieldType.TITLE },
];

function makeService(options: { linhas?: unknown[]; role?: string; scope?: string; assignees?: Array<{ id: string }>; formAreaId?: string | null } = {}) {
  const query = jest.fn().mockResolvedValue(options.linhas ?? []);

  const service = new WidgetQueryService(
    {
      findOne: jest.fn().mockResolvedValue({
        id: 'form-id',
        createdBy: 'outro-usuario',
        areaId: options.formAreaId ?? null,
        assignees: options.assignees ?? [{ id: 'actor-id' }],
      }),
    } as never,
    {
      findOne: jest.fn().mockResolvedValue({ sections: [{ fields: CAMPOS }] }),
    } as never,
    { manager: { query } } as never,
    {
      findOne: jest.fn().mockResolvedValue({
        id: 'actor-id',
        role: options.role ?? 'admin',
        areaId: null,
      }),
    } as never,
    // 'all' = acesso total; senão vale o vínculo: quem está em `assignees` tem "ver o painel" no processo.
    fakeProcessAccess({
      resolve: (actor) =>
        grantsFor(
          actor.sub,
          (options.scope ?? 'all') === 'all',
          (options.assignees ?? [{ id: 'actor-id' }]).some((person) => person.id === actor.sub)
            ? { 'form-id': { 'analytics.view': 'all' } }
            : {},
        ),
    }),
  );

  return { service, query };
}

function ultimaConsulta(query: jest.Mock): { sql: string; params: unknown[] } {
  const call = query.mock.calls[query.mock.calls.length - 1] as [string, unknown[]];
  return { sql: call[0], params: call[1] };
}

function executar(service: WidgetQueryService, config: WidgetConfig) {
  return service.executar('form-id', config, 'actor-id');
}

describe('WidgetQueryService — validação da configuração', () => {
  it('recusa tipo de widget desconhecido', async () => {
    const { service } = makeService();
    await expect(
      executar(service, { tipo: 'pizza' as never, campo: 'categoria' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recusa campo que não existe no formulário', async () => {
    const { service } = makeService();
    await expect(
      executar(service, { tipo: 'kpi', campo: 'campo_fantasma', agregacao: 'soma' }),
    ).rejects.toThrow(/não existe/);
  });

  it('recusa média sobre campo de texto', async () => {
    const { service } = makeService();
    await expect(
      executar(service, { tipo: 'kpi', campo: 'cidade', agregacao: 'media' }),
    ).rejects.toThrow(/não se aplica/);
  });

  it('recusa distribuição de categorias sobre campo de texto livre', async () => {
    const { service } = makeService();
    await expect(
      executar(service, { tipo: 'categorias', campo: 'cidade' }),
    ).rejects.toThrow(/não pode ser exibido/);
  });

  it('recusa ranking sobre campo numérico', async () => {
    const { service } = makeService();
    await expect(executar(service, { tipo: 'ranking', campo: 'quantidade' })).rejects.toThrow(
      /não pode ser exibido/,
    );
  });

  it('recusa widget de campo decorativo', async () => {
    const { service } = makeService();
    await expect(executar(service, { tipo: 'kpi', campo: 'secao' })).rejects.toThrow(
      /não pode ser exibido/,
    );
  });

  it('recusa categorias e ranking sem campo', async () => {
    const { service } = makeService();
    await expect(executar(service, { tipo: 'categorias' })).rejects.toThrow(/exige um campo/);
    await expect(executar(service, { tipo: 'ranking' })).rejects.toThrow(/exige um campo/);
  });

  it('recusa agregação sem sentido quando não há campo', async () => {
    const { service } = makeService();
    await expect(executar(service, { tipo: 'kpi', agregacao: 'soma' })).rejects.toThrow(
      /únicas agregações/,
    );
  });

  it('recusa a taxa em qualquer formato que não seja o número único', async () => {
    const { service } = makeService();
    await expect(executar(service, { tipo: 'serie', agregacao: 'taxa' })).rejects.toThrow(
      /indicador único/,
    );
    await expect(
      executar(service, { tipo: 'serie', campo: 'quantidade', agregacao: 'taxa' }),
    ).rejects.toThrow(/indicador único/);
  });

  it('recusa período não positivo', async () => {
    const { service } = makeService();
    await expect(
      executar(service, { tipo: 'kpi', periodoDias: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      executar(service, { tipo: 'kpi', periodoDias: -5 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('WidgetQueryService — nada do cliente vira SQL', () => {
  it('o código do campo viaja como parâmetro, nunca no texto da consulta', async () => {
    const { service, query } = makeService();
    await executar(service, { tipo: 'kpi', campo: 'valor_total', agregacao: 'soma' });

    const { sql, params } = ultimaConsulta(query);
    expect(sql).not.toContain('valor_total');
    expect(sql).toContain('si.field_code = $2');
    expect(params).toContain('valor_total');
  });

  it('limite e período também são parâmetros', async () => {
    const { service, query } = makeService();
    await executar(service, { tipo: 'ranking', campo: 'cidade', limite: 7, periodoDias: 30 });

    const { sql, params } = ultimaConsulta(query);
    expect(sql).toMatch(/LIMIT \$\d/);
    expect(params).toContain(7);
    expect(params.some((p) => p instanceof Date)).toBe(true);
  });

  it('limite é limitado ao teto, mesmo se o cliente pedir mais', async () => {
    const { service, query } = makeService();
    await executar(service, { tipo: 'ranking', campo: 'cidade', limite: 9999 });
    expect(ultimaConsulta(query).params).toContain(50);
  });

  it('período é limitado ao teto de dez anos', async () => {
    const { service, query } = makeService();
    await executar(service, { tipo: 'kpi', periodoDias: 999999 });

    const desde = ultimaConsulta(query).params.find((p): p is Date => p instanceof Date);
    const anos = (Date.now() - (desde as Date).getTime()) / (1000 * 60 * 60 * 24 * 365);
    expect(anos).toBeLessThan(11);
  });
});

describe('WidgetQueryService — consultas por formato', () => {
  it('KPI sem campo conta submissões, sem tocar em submission_items', async () => {
    const { service, query } = makeService({ linhas: [{ valor: 42 }] });
    const resultado = await executar(service, { tipo: 'kpi' });

    expect(resultado).toEqual({ tipo: 'kpi', valor: 42, pontos: [] });
    expect(ultimaConsulta(query).sql).not.toContain('submission_items');
  });

  it('KPI numérico usa a função de agregação escolhida', async () => {
    const { service, query } = makeService({ linhas: [{ valor: '1500.5' }] });
    const resultado = await executar(service, {
      tipo: 'kpi',
      campo: 'valor_total',
      agregacao: 'media',
    });

    expect(ultimaConsulta(query).sql).toContain('AVG(si.value_number)');
    expect(resultado.valor).toBe(1500.5);
  });

  it('campo monetário soma por value_number, não por texto', async () => {
    const { service, query } = makeService({ linhas: [{ valor: 3000 }] });
    await executar(service, { tipo: 'kpi', campo: 'valor_total', agregacao: 'soma' });

    const { sql } = ultimaConsulta(query);
    expect(sql).toContain('SUM(si.value_number)');
    expect(sql).not.toContain('value_text');
  });

  it('KPI sem nenhum valor devolve nulo, não zero', async () => {
    const { service } = makeService({ linhas: [{ valor: null }] });
    const resultado = await executar(service, {
      tipo: 'kpi',
      campo: 'quantidade',
      agregacao: 'soma',
    });

    expect(resultado.valor).toBeNull();
  });

  it('múltipla escolha conta cada opção marcada', async () => {
    const { service, query } = makeService({
      linhas: [
        { rotulo: 'rh', valor: 3 },
        { rotulo: 'ti', valor: 1 },
      ],
    });
    const resultado = await executar(service, { tipo: 'categorias', campo: 'areas' });

    expect(ultimaConsulta(query).sql).toContain('jsonb_array_elements_text');
    expect(resultado.pontos).toEqual([
      { rotulo: 'rh', valor: 3 },
      { rotulo: 'ti', valor: 1 },
    ]);
  });

  it('escolha única agrupa por value_text, sem LATERAL', async () => {
    const { service, query } = makeService({ linhas: [{ rotulo: 'insumos', valor: 2 }] });
    await executar(service, { tipo: 'categorias', campo: 'categoria' });

    expect(ultimaConsulta(query).sql).not.toContain('jsonb_array_elements_text');
    expect(ultimaConsulta(query).sql).toContain('si.value_text');
  });

  it('série sem campo agrupa submissões pelo intervalo escolhido', async () => {
    const { service, query } = makeService({
      linhas: [{ rotulo: new Date('2026-08-01T00:00:00Z'), valor: 5 }],
    });
    const resultado = await executar(service, { tipo: 'serie', intervalo: 'mes' });

    expect(ultimaConsulta(query).sql).toContain("DATE_TRUNC('month'");
    expect(resultado.pontos).toEqual([{ rotulo: '2026-08-01', valor: 5 }]);
  });

  it('série com campo numérico agrega o valor no período', async () => {
    const { service, query } = makeService({
      linhas: [{ rotulo: new Date('2026-08-01T00:00:00Z'), valor: '1200' }],
    });
    await executar(service, {
      tipo: 'serie',
      campo: 'valor_total',
      agregacao: 'soma',
      intervalo: 'mes',
    });

    const { sql } = ultimaConsulta(query);
    expect(sql).toContain('SUM(si.value_number)');
    expect(sql).toContain("DATE_TRUNC('month'");
  });

  it('série com campo não numérico é recusada', async () => {
    const { service } = makeService();
    await expect(
      executar(service, { tipo: 'serie', campo: 'cidade', intervalo: 'dia' }),
    ).rejects.toThrow(/não pode ser exibido/);
  });

  it('sem período informado a consulta não filtra data', async () => {
    const { service, query } = makeService({ linhas: [{ valor: 1 }] });
    await executar(service, { tipo: 'kpi' });

    expect(ultimaConsulta(query).sql).not.toContain('submitted_at >=');
  });
});

describe('WidgetQueryService — segunda métrica', () => {
  it('recusa segunda métrica em kpi — número único não tem o que combinar', async () => {
    const { service } = makeService();
    await expect(
      executar(service, {
        tipo: 'kpi',
        campo: 'valor_total',
        agregacao: 'soma',
        campo2: 'quantidade',
      }),
    ).rejects.toThrow(/não se aplica a um número único/);
  });

  it('recusa segunda métrica sobre campo não numérico', async () => {
    const { service } = makeService();
    await expect(
      executar(service, {
        tipo: 'serie',
        campo: 'valor_total',
        agregacao: 'soma',
        intervalo: 'dia',
        campo2: 'cidade',
      }),
    ).rejects.toThrow(/não é numérico/);
  });

  it('recusa contagem/distintos como agregação da segunda métrica', async () => {
    const { service } = makeService();
    await expect(
      executar(service, {
        tipo: 'serie',
        campo: 'valor_total',
        agregacao: 'soma',
        intervalo: 'dia',
        campo2: 'quantidade',
        agregacao2: 'contagem',
      }),
    ).rejects.toThrow(/só aceita soma, média, mínimo ou máximo/);
  });

  it('recusa segunda métrica de campo inexistente', async () => {
    const { service } = makeService();
    await expect(
      executar(service, {
        tipo: 'serie',
        campo: 'valor_total',
        agregacao: 'soma',
        intervalo: 'dia',
        campo2: 'campo_fantasma',
      }),
    ).rejects.toThrow(/não existe/);
  });

  it('série com segunda métrica junta submission_items pelo mesmo intervalo, sem agregação explícita cai em soma', async () => {
    const { service, query } = makeService({
      linhas: [{ rotulo: new Date('2026-08-01T00:00:00Z'), valor: '1200', valor2: '80' }],
    });
    const resultado = await executar(service, {
      tipo: 'serie',
      campo: 'valor_total',
      agregacao: 'soma',
      intervalo: 'dia',
      campo2: 'quantidade',
    });

    const { sql, params } = ultimaConsulta(query);
    expect(sql).toContain('LEFT JOIN submission_items si2');
    expect(sql).toContain('si2.field_code =');
    expect(sql).toContain('SUM(si2.value_number)');
    expect(params).toContain('quantidade');
    expect(resultado.pontos).toEqual([{ rotulo: '2026-08-01', valor: 1200, valor2: 80 }]);
  });

  it('série sem campo aceita segunda métrica por cima da contagem de submissões', async () => {
    const { service, query } = makeService({
      linhas: [{ rotulo: new Date('2026-08-01T00:00:00Z'), valor: 5, valor2: '9.5' }],
    });
    const resultado = await executar(service, {
      tipo: 'serie',
      intervalo: 'dia',
      campo2: 'quantidade',
      agregacao2: 'media',
    });

    expect(ultimaConsulta(query).sql).toContain('AVG(si2.value_number)');
    expect(resultado.pontos).toEqual([{ rotulo: '2026-08-01', valor: 5, valor2: 9.5 }]);
  });

  it('categorias com segunda métrica agrega por cima da mesma categoria', async () => {
    const { service, query } = makeService({
      linhas: [{ rotulo: 'insumos', valor: 2, valor2: '340' }],
    });
    const resultado = await executar(service, {
      tipo: 'categorias',
      campo: 'categoria',
      campo2: 'valor_total',
      agregacao2: 'soma',
    });

    const { sql } = ultimaConsulta(query);
    expect(sql).toContain('LEFT JOIN submission_items si2');
    expect(sql).toContain('SUM(si2.value_number)');
    expect(resultado.pontos).toEqual([{ rotulo: 'insumos', valor: 2, valor2: 340 }]);
  });

  it('múltipla escolha com segunda métrica não perde o LATERAL nem o join da segunda métrica', async () => {
    const { service, query } = makeService({
      linhas: [{ rotulo: 'rh', valor: 3, valor2: '12' }],
    });
    await executar(service, {
      tipo: 'categorias',
      campo: 'areas',
      campo2: 'quantidade',
      agregacao2: 'maximo',
    });

    const { sql } = ultimaConsulta(query);
    expect(sql).toContain('jsonb_array_elements_text');
    expect(sql).toContain('LEFT JOIN submission_items si2');
    expect(sql).toContain('MAX(si2.value_number)');
  });

  it('ranking com segunda métrica agrega por cima do mesmo valor de texto', async () => {
    const { service, query } = makeService({
      linhas: [{ rotulo: 'Fornecedor A', valor: 4, valor2: '10.5' }],
    });
    const resultado = await executar(service, {
      tipo: 'ranking',
      campo: 'cidade',
      campo2: 'quantidade',
      agregacao2: 'minimo',
    });

    const { sql } = ultimaConsulta(query);
    expect(sql).toContain('LEFT JOIN submission_items si2');
    expect(sql).toContain('MIN(si2.value_number)');
    expect(resultado.pontos).toEqual([{ rotulo: 'Fornecedor A', valor: 4, valor2: 10.5 }]);
  });

  it('sem segunda métrica, a consulta nunca menciona si2', async () => {
    const { service, query } = makeService({
      linhas: [{ rotulo: new Date('2026-08-01T00:00:00Z'), valor: 5 }],
    });
    const resultado = await executar(service, { tipo: 'serie', intervalo: 'dia' });

    expect(ultimaConsulta(query).sql).not.toContain('si2');
    expect(resultado.pontos).toEqual([{ rotulo: '2026-08-01', valor: 5 }]);
  });
});

describe('WidgetQueryService — taxa de conclusão', () => {
  it('sem campo, divide as submissões preenchidas pelo total do formulário', async () => {
    const { service, query } = makeService({ linhas: [{ total: 8, respondidas: 6 }] });
    const resultado = await executar(service, { tipo: 'kpi', agregacao: 'taxa' });

    const { sql } = ultimaConsulta(query);
    // O denominador é a tabela de submissões: contar só quem tem item daria
    // 100% sempre, que era exatamente o jeito errado de ler o indicador.
    expect(sql).toContain('FROM submissions s');
    expect(sql).toContain('EXISTS');
    expect(resultado).toEqual({ tipo: 'kpi', valor: 75, pontos: [], unidade: 'percentual' });
  });

  it('com campo, mede quantas submissões preencheram aquele campo', async () => {
    const { service, query } = makeService({ linhas: [{ total: 3, respondidas: 1 }] });
    const resultado = await executar(service, {
      tipo: 'kpi',
      campo: 'categoria',
      agregacao: 'taxa',
    });

    const { sql, params } = ultimaConsulta(query);
    expect(sql).toContain('si.field_code = $2');
    expect(params).toContain('categoria');
    expect(resultado.valor).toBe(33.33);
    expect(resultado.unidade).toBe('percentual');
  });

  it('sem nenhuma submissão não inventa 0%', async () => {
    const { service } = makeService({ linhas: [{ total: 0, respondidas: 0 }] });
    const resultado = await executar(service, { tipo: 'kpi', agregacao: 'taxa' });

    expect(resultado.valor).toBeNull();
  });

  it('respeita o período escolhido nos dois lados da fração', async () => {
    const { service, query } = makeService({ linhas: [{ total: 2, respondidas: 2 }] });
    await executar(service, { tipo: 'kpi', agregacao: 'taxa', periodoDias: 30 });

    const { sql } = ultimaConsulta(query);
    // Um único filtro, na tabela de submissões — numerador e denominador saem
    // da mesma varredura, então não há como ficarem em janelas diferentes.
    expect(sql.split('submitted_at >= $2')).toHaveLength(2);
  });

  it('a taxa nunca vira função de agregação no SQL', async () => {
    const { service, query } = makeService({ linhas: [{ total: 1, respondidas: 1 }] });
    await executar(service, { tipo: 'kpi', campo: 'quantidade', agregacao: 'taxa' });

    expect(ultimaConsulta(query).sql).not.toMatch(/TAXA/i);
  });
});

describe('WidgetQueryService — filtro global de área', () => {
  it('formulário fora da área escolhida devolve vazio, sem consultar o banco', async () => {
    const { service, query } = makeService({ formAreaId: 'area-rh' });
    const resultado = await executar(service, { tipo: 'kpi', areaId: 'area-financeiro' });

    expect(resultado).toEqual({ tipo: 'kpi', valor: null, pontos: [] });
    expect(query).not.toHaveBeenCalled();
  });

  it('formulário dentro da área escolhida executa normalmente', async () => {
    const { service, query } = makeService({ formAreaId: 'area-rh', linhas: [{ valor: 3 }] });
    const resultado = await executar(service, { tipo: 'kpi', areaId: 'area-rh' });

    expect(resultado.valor).toBe(3);
    expect(query).toHaveBeenCalled();
  });

  it('sem filtro de área, formulário sem área também executa', async () => {
    const { service, query } = makeService({ formAreaId: null, linhas: [{ valor: 1 }] });
    const resultado = await executar(service, { tipo: 'kpi' });

    expect(resultado.valor).toBe(1);
    expect(query).toHaveBeenCalled();
  });
});

describe('WidgetQueryService — acesso', () => {
  it('quem tem "ver o painel" no vínculo com o processo acessa', async () => {
    const { service } = makeService({
      linhas: [{ valor: 1 }],
      role: 'viewer',
      scope: 'none',
      assignees: [{ id: 'actor-id' }],
    });

    await expect(executar(service, { tipo: 'kpi' })).resolves.toBeDefined();
  });

  it('sem vínculo com o processo, é bloqueado', async () => {
    const { service } = makeService({
      role: 'viewer',
      scope: 'none',
      assignees: [{ id: 'outra-pessoa' }],
    });

    await expect(executar(service, { tipo: 'kpi' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('formulário inexistente devolve 404 antes de qualquer consulta', async () => {
    const query = jest.fn();
    const service = new WidgetQueryService(
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      { findOne: jest.fn() } as never,
      { manager: { query } } as never,
      { findOne: jest.fn().mockResolvedValue({ id: 'actor-id', role: 'admin' }) } as never,
      fakeProcessAccess({ everyoneFullAccess: true }),
    );

    await expect(executar(service, { tipo: 'kpi' })).rejects.toBeInstanceOf(NotFoundException);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('WidgetQueryService — catálogo para a tela', () => {
  it('lista só campos que produzem indicador, com formatos e agregações', async () => {
    const { service } = makeService();
    const campos = await service.listarCamposDisponiveis('form-id', 'actor-id');

    expect(campos.map((c) => c.code)).toEqual([
      'valor_total',
      'quantidade',
      'categoria',
      'areas',
      'cidade',
    ]);
    expect(campos.find((c) => c.code === 'secao')).toBeUndefined();
  });

  it('campo monetário oferece soma, média e série', async () => {
    const { service } = makeService();
    const campos = await service.listarCamposDisponiveis('form-id', 'actor-id');
    const valor = campos.find((c) => c.code === 'valor_total');

    expect(valor?.agregacoes).toContain('soma');
    expect(valor?.tiposDeWidget).toEqual(['kpi', 'serie']);
  });
});

describe('catálogo de tipos de campo', () => {
  it('todo formato oferecido pelo catálogo é aceito pelo motor', () => {
    // Guarda contra divergência entre o que a tela mostra e o que a API aceita.
    for (const { fieldType } of CAMPOS) {
      for (const tipo of tiposDeWidgetDoCampo(fieldType)) {
        expect(['kpi', 'categorias', 'serie', 'ranking']).toContain(tipo);
      }
    }
  });

  it('campo decorativo não oferece nada', () => {
    expect(tiposDeWidgetDoCampo(FormFieldType.DIVIDER)).toEqual([]);
    expect(agregacoesDoTipo(FormFieldType.DIVIDER)).toEqual([]);
  });
});
