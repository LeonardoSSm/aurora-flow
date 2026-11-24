import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationEntity } from '../../../database/entities/notification.entity';
import { UserEntity } from '../../../database/entities/user.entity';
import { ExpoPushService } from '../../notifications/expo-push.service';
import { ErpAuthFailedEvent } from './erp-auth-failed.event';
import { ErpAuthFailedListener } from './erp-auth-failed.listener';

describe('ErpAuthFailedListener', () => {
  let listener: ErpAuthFailedListener;
  const usersRepo = { find: jest.fn() };
  const notificationsRepo = { create: jest.fn(), save: jest.fn() };
  const expoPushService = { sendToUsers: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));

    usersRepo.find.mockResolvedValue([{ id: 'admin-1' }, { id: 'admin-2' }]);
    notificationsRepo.create.mockImplementation((d: Partial<NotificationEntity>) => d);
    notificationsRepo.save.mockResolvedValue(undefined);
    expoPushService.sendToUsers.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ErpAuthFailedListener,
        { provide: getRepositoryToken(UserEntity), useValue: usersRepo },
        { provide: getRepositoryToken(NotificationEntity), useValue: notificationsRepo },
        { provide: ExpoPushService, useValue: expoPushService },
      ],
    }).compile();

    listener = module.get(ErpAuthFailedListener);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('notifies all active admins on the first failure for a connector', async () => {
    await listener.handleErpAuthFailed(new ErpAuthFailedEvent('conn-1', 'SAP'));

    expect(usersRepo.find).toHaveBeenCalledWith({
      where: { role: 'admin', isActive: true },
      select: ['id'],
    });
    expect(expoPushService.sendToUsers).toHaveBeenCalledWith(
      ['admin-1', 'admin-2'],
      expect.objectContaining({ data: { connectorId: 'conn-1', connectorName: 'SAP' } }),
    );
    expect(notificationsRepo.save).toHaveBeenCalledWith([
      { userId: 'admin-1', message: expect.stringContaining('SAP'), isRead: false },
      { userId: 'admin-2', message: expect.stringContaining('SAP'), isRead: false },
    ]);
  });

  it('suppresses a repeated failure for the same connector within the cooldown window', async () => {
    await listener.handleErpAuthFailed(new ErpAuthFailedEvent('conn-1', 'SAP'));
    jest.advanceTimersByTime(5 * 60 * 1000); // +5min, still within the 1h cooldown

    await listener.handleErpAuthFailed(new ErpAuthFailedEvent('conn-1', 'SAP'));

    expect(expoPushService.sendToUsers).toHaveBeenCalledTimes(1);
    expect(notificationsRepo.save).toHaveBeenCalledTimes(1);
  });

  it('notifies again for the same connector once the cooldown has elapsed', async () => {
    await listener.handleErpAuthFailed(new ErpAuthFailedEvent('conn-1', 'SAP'));
    jest.advanceTimersByTime(61 * 60 * 1000); // +61min, past the 1h cooldown

    await listener.handleErpAuthFailed(new ErpAuthFailedEvent('conn-1', 'SAP'));

    expect(expoPushService.sendToUsers).toHaveBeenCalledTimes(2);
  });

  it('does not throttle across different connectors', async () => {
    await listener.handleErpAuthFailed(new ErpAuthFailedEvent('conn-1', 'SAP'));
    await listener.handleErpAuthFailed(new ErpAuthFailedEvent('conn-2', 'Protheus'));

    expect(expoPushService.sendToUsers).toHaveBeenCalledTimes(2);
  });

  it('swallows errors from the notification pipeline instead of throwing', async () => {
    usersRepo.find.mockRejectedValue(new Error('db down'));

    await expect(
      listener.handleErpAuthFailed(new ErpAuthFailedEvent('conn-1', 'SAP')),
    ).resolves.toBeUndefined();
  });
});
