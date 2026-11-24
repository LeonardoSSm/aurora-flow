import { NotFoundException } from '@nestjs/common';
import type { QueryInboxDto } from './dto/query-inbox.dto';
import { NotificationInboxService } from './notification-inbox.service';

function makeService() {
  const repo = {
    findAndCount: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  };
  return { service: new NotificationInboxService(repo as never), repo };
}

const query = (overrides: Partial<QueryInboxDto> = {}): QueryInboxDto =>
  ({ page: 1, limit: 20, ...overrides }) as QueryInboxDto;

describe('NotificationInboxService', () => {
  it('lista SEMPRE só as notificações do usuário autenticado, mais novas primeiro', async () => {
    const { service, repo } = makeService();
    const createdAt = new Date('2026-10-05T12:00:00Z');
    repo.findAndCount.mockResolvedValue([
      [{ id: 'n1', userId: 'u1', title: 'T', message: 'M', link: '/x', isRead: false, createdAt, extra: 'x' }],
      41,
    ]);

    const page = await service.list('u1', query({ page: 2, limit: 20 }));

    expect(repo.findAndCount).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      order: { createdAt: 'DESC' },
      skip: 20,
      take: 20,
    });
    expect(page).toMatchObject({ total: 41, page: 2, limit: 20, totalPages: 3 });
    // projeção: só os campos públicos (nada de userId/relacionamentos)
    expect(page.data).toEqual([{ id: 'n1', title: 'T', message: 'M', link: '/x', isRead: false, createdAt }]);
  });

  it('unreadOnly filtra por não lidas', async () => {
    const { service, repo } = makeService();
    repo.findAndCount.mockResolvedValue([[], 0]);
    await service.list('u1', query({ unreadOnly: true }));
    expect(repo.findAndCount.mock.calls[0][0].where).toEqual({ userId: 'u1', isRead: false });
  });

  it('conta as não lidas do usuário', async () => {
    const { service, repo } = makeService();
    repo.count.mockResolvedValue(3);
    await expect(service.unreadCount('u1')).resolves.toEqual({ count: 3 });
    expect(repo.count).toHaveBeenCalledWith({ where: { userId: 'u1', isRead: false } });
  });

  it('marcar como lida só atinge a notificação DO usuário (id + userId)', async () => {
    const { service, repo } = makeService();
    repo.update.mockResolvedValue({ affected: 1 });
    await expect(service.markRead('u1', 'n1')).resolves.toEqual({ read: true });
    expect(repo.update).toHaveBeenCalledWith({ id: 'n1', userId: 'u1' }, { isRead: true });
  });

  it('marcar notificação de outro usuário (ou inexistente) responde 404', async () => {
    const { service, repo } = makeService();
    repo.update.mockResolvedValue({ affected: 0 });
    await expect(service.markRead('u1', 'n-de-outro')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('marcar todas como lidas só atinge as não lidas do usuário', async () => {
    const { service, repo } = makeService();
    repo.update.mockResolvedValue({ affected: 4 });
    await expect(service.markAllRead('u1')).resolves.toEqual({ updated: 4 });
    expect(repo.update).toHaveBeenCalledWith({ userId: 'u1', isRead: false }, { isRead: true });
  });

  it('markAllRead tolera affected indefinido', async () => {
    const { service, repo } = makeService();
    repo.update.mockResolvedValue({});
    await expect(service.markAllRead('u1')).resolves.toEqual({ updated: 0 });
  });
});
