import { ForbiddenException } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { fakeProcessAccess, grantsFor } from '../access/testing/fake-process-access';

/**
 * "Ver o painel do processo" vem do vínculo: `members` são as pessoas com a permissão no
 * processo "form-id".
 */
function makeService(form: Record<string, unknown> | null, actor: Record<string, unknown> | null, members: string[] = []) {
  const formsRepository = { findOne: jest.fn().mockResolvedValue(form) };
  const usersRepository = { findOne: jest.fn().mockResolvedValue(actor) };
  const formVersionsRepository = { findOne: jest.fn().mockResolvedValue(null) };
  const processAccess = fakeProcessAccess({
    resolve: (who) => grantsFor(who.sub, false, members.includes(who.sub) ? { 'form-id': { 'analytics.view': 'all' } } : {}),
  });

  const trendQb = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([]),
  };
  const submissionsRepository = {
    createQueryBuilder: jest.fn().mockReturnValue(trendQb),
    count: jest.fn().mockResolvedValue(0),
    manager: { query: jest.fn().mockResolvedValue([]) },
  };

  const service = new AnalyticsService(
    formsRepository as never,
    formVersionsRepository as never,
    submissionsRepository as never,
    usersRepository as never,
    processAccess,
  );
  return { service, formsRepository, usersRepository };
}

describe('AnalyticsService.getFormAnalytics — vínculo com o processo', () => {
  const form = { id: 'form-id', createdBy: 'someone-else' };

  it('com "ver o painel" no processo, acessa (de qualquer perfil)', async () => {
    const { service } = makeService(form, { id: 'viewer-id', role: 'viewer' }, ['viewer-id']);
    await expect(service.getFormAnalytics('form-id', 'viewer-id')).resolves.toBeDefined();
  });

  it('sem a permissão no processo, 403 — mesmo o perfil antigo dando escopo total', async () => {
    const { service } = makeService(form, { id: 'manager-id', role: 'manager' });
    await expect(service.getFormAnalytics('form-id', 'manager-id')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

// ─── Agregação por campo ──────────────────────────────────────────────────────
//
// A agregação passou de JavaScript sobre itens crus (com teto de 50.000, que
// tornava o número silenciosamente errado acima disso) para quatro consultas
// SQL. Estes testes cobrem a camada que transforma as linhas agregadas no
// contrato que a tela consome — a validade do SQL em si foi conferida rodando
// as consultas contra o Postgres, não aqui.

describe('AnalyticsService.getFormAnalytics — estatísticas por campo', () => {
  type QueryRow = Record<string, unknown>;

  function makeAnalyticsService(rows: {
    answered?: QueryRow[];
    counts?: QueryRow[];
    numeric?: QueryRow[];
    choice?: QueryRow[];
    multi?: QueryRow[];
    text?: QueryRow[];
    fields: Array<{ code: string; label: string; fieldType: string }>;
  }) {
    const query = jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('COUNT(DISTINCT si.submission_id)')) {
        return Promise.resolve(rows.answered ?? [{ answered: 0 }]);
      }
      if (sql.includes('empty_count')) return Promise.resolve(rows.counts ?? []);
      if (sql.includes('AVG(si.value_number)')) return Promise.resolve(rows.numeric ?? []);
      if (sql.includes('jsonb_array_elements_text')) return Promise.resolve(rows.multi ?? []);
      if (sql.includes('ROW_NUMBER()')) return Promise.resolve(rows.text ?? []);
      return Promise.resolve(rows.choice ?? []);
    });

    const trendQb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };

    const service = new AnalyticsService(
      { findOne: jest.fn().mockResolvedValue({ id: 'form-id', createdBy: 'actor-id' }) } as never,
      {
        findOne: jest.fn().mockResolvedValue({ sections: [{ fields: rows.fields }] }),
      } as never,
      {
        createQueryBuilder: jest.fn().mockReturnValue(trendQb),
        count: jest.fn().mockResolvedValue(4),
        manager: { query },
      } as never,
      { findOne: jest.fn().mockResolvedValue({ id: 'actor-id', role: 'admin' }) } as never,
      fakeProcessAccess({ everyoneFullAccess: true }),
    );

    return { service, query };
  }

  it('monta distribuição com percentual para campo de escolha', async () => {
    const { service } = makeAnalyticsService({
      fields: [{ code: 'origem', label: 'Origem', fieldType: 'single_select' }],
      counts: [{ field_code: 'origem', response_count: 4, empty_count: 0 }],
      choice: [
        { field_code: 'origem', value: 'site', count: 3 },
        { field_code: 'origem', value: 'indicacao', count: 1 },
      ],
    });

    const result = await service.getFormAnalytics('form-id', 'actor-id');
    const stat = result.fieldStats[0];

    expect(stat.responseCount).toBe(4);
    expect(stat.distribution).toEqual([
      { value: 'site', count: 3, percentage: 75 },
      { value: 'indicacao', count: 1, percentage: 25 },
    ]);
  });

  it('conta cada opção marcada de múltipla escolha', async () => {
    const { service } = makeAnalyticsService({
      fields: [{ code: 'areas', label: 'Áreas', fieldType: 'multi_select' }],
      counts: [{ field_code: 'areas', response_count: 2, empty_count: 0 }],
      multi: [
        { field_code: 'areas', value: 'rh', count: 2 },
        { field_code: 'areas', value: 'ti', count: 1 },
      ],
    });

    const result = await service.getFormAnalytics('form-id', 'actor-id');

    expect(result.fieldStats[0].distribution).toEqual([
      { value: 'rh', count: 2, percentage: 67 },
      { value: 'ti', count: 1, percentage: 33 },
    ]);
  });

  it('arredonda a média numérica em duas casas', async () => {
    const { service } = makeAnalyticsService({
      fields: [{ code: 'valor', label: 'Valor', fieldType: 'currency' }],
      counts: [{ field_code: 'valor', response_count: 3, empty_count: 0 }],
      numeric: [{ field_code: 'valor', min: 10, max: 20.5, avg: 15.16666666 }],
    });

    const result = await service.getFormAnalytics('form-id', 'actor-id');

    expect(result.fieldStats[0].numericStats).toEqual({ min: 10, max: 20.5, avg: 15.17 });
  });

  it('não devolve estatística numérica quando nenhum valor foi respondido', async () => {
    const { service } = makeAnalyticsService({
      fields: [{ code: 'valor', label: 'Valor', fieldType: 'number' }],
      counts: [{ field_code: 'valor', response_count: 0, empty_count: 0 }],
      numeric: [],
    });

    const result = await service.getFormAnalytics('form-id', 'actor-id');

    expect(result.fieldStats[0].numericStats).toBeUndefined();
  });

  it('ordena os valores mais frequentes de campo de texto', async () => {
    const { service } = makeAnalyticsService({
      fields: [{ code: 'cidade', label: 'Cidade', fieldType: 'short_text' }],
      counts: [{ field_code: 'cidade', response_count: 5, empty_count: 0 }],
      text: [
        { field_code: 'cidade', value: 'Fortaleza', count: 2 },
        { field_code: 'cidade', value: 'Recife', count: 3 },
      ],
    });

    const result = await service.getFormAnalytics('form-id', 'actor-id');

    expect(result.fieldStats[0].topValues).toEqual([
      { value: 'Recife', count: 3 },
      { value: 'Fortaleza', count: 2 },
    ]);
  });

  it('devolve campo sem nenhuma resposta com contagem zero, sem sumir da lista', async () => {
    const { service } = makeAnalyticsService({
      fields: [{ code: 'observacao', label: 'Observação', fieldType: 'long_text' }],
      counts: [],
    });

    const result = await service.getFormAnalytics('form-id', 'actor-id');

    expect(result.fieldStats).toHaveLength(1);
    expect(result.fieldStats[0]).toMatchObject({
      fieldCode: 'observacao',
      responseCount: 0,
      emptyCount: 0,
    });
  });

  it('taxa de preenchimento vem da contagem distinta no banco', async () => {
    const { service } = makeAnalyticsService({
      fields: [{ code: 'nome', label: 'Nome', fieldType: 'short_text' }],
      answered: [{ answered: 3 }],
    });

    // O total de submissões está mockado em 4 — 3 de 4 dá 75%.
    const result = await service.getFormAnalytics('form-id', 'actor-id');
    expect(result.completionRate).toBe(75);
  });

  it('não consulta agregação de tipo que o formulário não tem', async () => {
    const { service, query } = makeAnalyticsService({
      fields: [{ code: 'nome', label: 'Nome', fieldType: 'short_text' }],
    });

    await service.getFormAnalytics('form-id', 'actor-id');
    const executadas = query.mock.calls.map((call: unknown[]) => String(call[0]));

    expect(executadas.some((sql: string) => sql.includes('AVG(si.value_number)'))).toBe(false);
    expect(executadas.some((sql: string) => sql.includes('jsonb_array_elements_text'))).toBe(false);
  });

  it('nenhuma consulta carrega itens crus com teto fixo', async () => {
    const { service, query } = makeAnalyticsService({
      fields: [{ code: 'nome', label: 'Nome', fieldType: 'short_text' }],
    });

    await service.getFormAnalytics('form-id', 'actor-id');

    for (const call of query.mock.calls) {
      expect(String(call[0])).not.toContain('LIMIT 50000');
    }
  });
});
