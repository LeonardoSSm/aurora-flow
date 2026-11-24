import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UserEmailFieldService } from './user-email-field.service';
import { parseUserEmailSuggestions } from './user-email-suggestions';

const ANA = { id: '11111111-1111-4111-8111-111111111111', fullName: 'Ana Gestora', email: 'Ana@Tijuca.com' };
const BRUNO = { id: '22222222-2222-4222-8222-222222222222', fullName: 'Bruno Lima', email: 'bruno@tijuca.com' };
const CAIO = { id: '33333333-3333-4333-8333-333333333333', fullName: 'Caio Inativo', email: 'caio@tijuca.com' };
const ACTIVE = [ANA, BRUNO];

/** QueryBuilder falso: guarda os parâmetros e devolve `rows`. */
function fakeQueryBuilder(rows: unknown[]) {
  const calls: { where: Array<[string, Record<string, unknown> | undefined]>; limit?: number } = {
    where: [],
  };
  const qb: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn((sql: string, params?: Record<string, unknown>): unknown => {
      calls.where.push([sql, params]);
      return qb;
    }),
    andWhere: jest.fn((sql: string, params?: Record<string, unknown>): unknown => {
      calls.where.push([sql, params]);
      return qb;
    }),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn((n: number): unknown => {
      calls.limit = n;
      return qb;
    }),
    getMany: jest.fn().mockResolvedValue(rows),
  };
  return { qb, calls };
}

function makeService(options: { field?: unknown; qbRows?: unknown[] } = {}) {
  const { qb, calls } = fakeQueryBuilder(options.qbRows ?? []);
  const usersRepo = {
    find: jest.fn(({ where }: { where: { id: { value: string[] } } }) =>
      Promise.resolve(ACTIVE.filter((user) => where.id.value.includes(user.id))),
    ),
    createQueryBuilder: jest.fn(() => qb),
  };
  const versionsRepo = { findOne: jest.fn().mockResolvedValue({ id: 'v-1' }) };
  const fieldsRepo = { findOne: jest.fn().mockResolvedValue(options.field ?? null) };
  const service = new UserEmailFieldService(
    usersRepo as never,
    versionsRepo as never,
    fieldsRepo as never,
  );
  return { service, usersRepo, calls };
}

describe('parseUserEmailSuggestions', () => {
  it('campo E-mail comum: null', () => {
    expect(parseUserEmailSuggestions({})).toBeNull();
    expect(parseUserEmailSuggestions(null)).toBeNull();
    expect(parseUserEmailSuggestions({ userSuggestions: [] })).toBeNull();
  });

  it('ids inválidos e repetidos saem; onlySuggested só com true', () => {
    expect(
      parseUserEmailSuggestions({
        userSuggestions: { userIds: [ANA.id, ANA.id, 'x', 42], onlySuggested: 'sim' },
      }),
    ).toEqual({ userIds: [ANA.id], onlySuggested: false });
  });
});

describe('UserEmailFieldService.publicSettingsByField', () => {
  it('troca os ids por nome + e-mail das pessoas ativas, em ordem de nome', async () => {
    const { service } = makeService();
    const result = await service.publicSettingsByField([
      {
        id: 'f-1',
        fieldType: 'email',
        settingsJson: {
          placeholder: 'x',
          userSuggestions: { userIds: [BRUNO.id, CAIO.id, ANA.id], onlySuggested: true },
        },
      },
      { id: 'f-2', fieldType: 'email', settingsJson: { userSuggestions: { userIds: [] } } },
      { id: 'f-3', fieldType: 'email', settingsJson: {} },
      { id: 'f-4', fieldType: 'short_text', settingsJson: { userSuggestions: { userIds: [ANA.id] } } },
    ]);

    expect(result.get('f-1')).toEqual({
      placeholder: 'x',
      userSuggestions: {
        onlySuggested: true,
        users: [
          { name: 'Ana Gestora', email: 'Ana@Tijuca.com' },
          { name: 'Bruno Lima', email: 'bruno@tijuca.com' },
        ],
      },
    });
    // Sem pessoas escolhidas: sem lista (o navegador pesquisa entre todos).
    expect(result.get('f-2')).toEqual({ userSuggestions: { onlySuggested: false } });
    expect(result.has('f-3')).toBe(false);
    expect(result.has('f-4')).toBe(false);
  });
});

describe('UserEmailFieldService.searchField', () => {
  it('campo inexistente ou sem sugestões: 404', async () => {
    await expect(makeService().service.searchField('form', 'gestor', 'ana')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const plain = makeService({ field: { settingsJson: {} } });
    await expect(plain.service.searchField('form', 'gestor', 'ana')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('com pessoas escolhidas: filtra só entre elas, sem acento e sem maiúscula', async () => {
    const { service, usersRepo } = makeService({
      field: { settingsJson: { userSuggestions: { userIds: [ANA.id, BRUNO.id] } } },
    });
    await expect(service.searchField('form', 'gestor', 'GESTÓRA')).resolves.toEqual({
      users: [{ name: 'Ana Gestora', email: 'Ana@Tijuca.com' }],
    });
    expect(usersRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('todos os usuários: exige 3 letras', async () => {
    const { service } = makeService({ field: { settingsJson: { userSuggestions: { userIds: [] } } } });
    await expect(service.searchField('form', 'gestor', ' an ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('todos os usuários: só ativos, termo sem acento e com curinga escapado, teto de 8', async () => {
    const { service, calls } = makeService({
      field: { settingsJson: { userSuggestions: { userIds: [] } } },
      qbRows: [BRUNO],
    });
    await expect(service.searchField('form', 'gestor', 'Lí%a')).resolves.toEqual({
      users: [{ name: 'Bruno Lima', email: 'bruno@tijuca.com' }],
    });
    expect(calls.where[0][0]).toContain('isActive = true');
    expect(calls.where[1][1]).toEqual(expect.objectContaining({ term: '%li\\%a%' }));
    expect(calls.limit).toBe(8);
  });
});

describe('UserEmailFieldService.findNotSuggested', () => {
  const onlyAnaAndBruno = { userSuggestions: { userIds: [ANA.id, BRUNO.id], onlySuggested: true } };
  const anyUser = { userSuggestions: { userIds: [], onlySuggested: true } };
  const free = { userSuggestions: { userIds: [ANA.id], onlySuggested: false } };

  it('aceita e-mail de pessoa escolhida (maiúscula/espaço não importam) e de qualquer ativo', async () => {
    const { service } = makeService({ qbRows: [ANA, BRUNO] });
    await expect(
      service.findNotSuggested([
        { key: 'gestor', fieldType: 'email', settingsJson: onlyAnaAndBruno, value: '  ana@tijuca.COM ' },
        { key: 'copia', fieldType: 'email', settingsJson: anyUser, value: 'bruno@tijuca.com' },
      ]),
    ).resolves.toEqual({});
  });

  it('recusa e-mail de fora, de usuário inativo e de ativo que não foi escolhido', async () => {
    const { service } = makeService({ qbRows: [BRUNO] });
    const onlyAna = { userSuggestions: { userIds: [ANA.id], onlySuggested: true } };
    await expect(
      service.findNotSuggested([
        { key: 'a', fieldType: 'email', settingsJson: anyUser, value: 'alguem@fora.com' },
        { key: 'b', fieldType: 'email', settingsJson: anyUser, value: 'caio@tijuca.com' },
        { key: 'c', fieldType: 'email', settingsJson: onlyAna, value: 'bruno@tijuca.com' },
      ]),
    ).resolves.toEqual({
      a: 'Escolha um dos e-mails sugeridos.',
      b: 'Escolha um dos e-mails sugeridos.',
      c: 'Escolha um dos e-mails sugeridos.',
    });
  });

  it('sem a trava, vazio ou campo comum: nem consulta o banco', async () => {
    const { service, usersRepo } = makeService();
    await expect(
      service.findNotSuggested([
        { key: 'a', fieldType: 'email', settingsJson: free, value: 'alguem@fora.com' },
        { key: 'b', fieldType: 'email', settingsJson: anyUser, value: '  ' },
        { key: 'c', fieldType: 'email', settingsJson: {}, value: 'x@y.com' },
      ]),
    ).resolves.toEqual({});
    expect(usersRepo.createQueryBuilder).not.toHaveBeenCalled();
  });
});
