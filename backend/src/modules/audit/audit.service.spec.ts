import { AuditService } from './audit.service';

function makeService(events: Array<{ id: string; actorId: string | null }>, users: unknown[]) {
  const qb = {
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([events, events.length]),
  };
  const auditRepository = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
  const usersRepository = { find: jest.fn().mockResolvedValue(users) };
  const service = new AuditService(auditRepository as never, usersRepository as never);
  return { service, usersRepository };
}

describe('AuditService.findAll — nome de quem fez', () => {
  it('troca o id do autor pelo nome, uma consulta só para a página inteira', async () => {
    const { service, usersRepository } = makeService(
      [
        { id: 'e1', actorId: 'u1' },
        { id: 'e2', actorId: 'u1' },
        { id: 'e3', actorId: 'u2' },
      ],
      [
        { id: 'u1', fullName: 'Ana Souza' },
        { id: 'u2', fullName: 'Bruno Lima' },
      ],
    );

    const result = await service.findAll({ page: 1, limit: 25 } as never);

    expect(usersRepository.find).toHaveBeenCalledTimes(1);
    expect(result.data.map((e) => e.actorName)).toEqual(['Ana Souza', 'Ana Souza', 'Bruno Lima']);
  });

  it('evento do sistema ou de usuário apagado fica sem nome, sem consultar à toa', async () => {
    const { service, usersRepository } = makeService(
      [
        { id: 'e1', actorId: null },
        { id: 'e2', actorId: 'apagado' },
      ],
      [],
    );

    const result = await service.findAll({ page: 1, limit: 25 } as never);

    expect(result.data.map((e) => e.actorName)).toEqual([null, null]);
    expect(usersRepository.find).toHaveBeenCalledTimes(1);

    const empty = makeService([{ id: 'e1', actorId: null }], []);
    await empty.service.findAll({ page: 1, limit: 25 } as never);
    expect(empty.usersRepository.find).not.toHaveBeenCalled();
  });
});
