import type { Repository } from 'typeorm';
import type { ExpoPushMessage } from 'expo-server-sdk';
import type { PushTokenEntity } from '../../database/entities/push-token.entity';
import { ANDROID_CHANNEL_ID, ExpoPushService } from './expo-push.service';

describe('ExpoPushService', () => {
  function setup(tokens: Array<{ id: string; token: string }>) {
    const repo = {
      find: jest.fn().mockResolvedValue(tokens),
      update: jest.fn(),
    } as unknown as Repository<PushTokenEntity>;
    const service = new ExpoPushService(repo);
    // O expo-server-sdk é trocado por __mocks__/expo-server-sdk.ts: aqui o lote é a lista toda.
    const expo = (
      service as unknown as {
        expo: { chunkPushNotifications: jest.Mock; sendPushNotificationsAsync: jest.Mock };
      }
    ).expo;
    expo.chunkPushNotifications.mockImplementation((messages: ExpoPushMessage[]) => [messages]);
    const send = jest
      .spyOn(expo, 'sendPushNotificationsAsync')
      .mockImplementation(async (chunk: ExpoPushMessage[]) =>
        chunk.map(() => ({ status: 'ok' as const, id: 'x' })),
      );
    return { service, send };
  }

  it('manda pelo canal "Tijuca Flow" do app e com prioridade alta (banner no Android)', async () => {
    const { service, send } = setup([{ id: 't1', token: 'ExponentPushToken[abc123]' }]);

    await service.sendToUser('u1', {
      title: 'Aprovação pendente',
      body: 'X aguarda',
      data: { approvalId: 'a1' },
    });

    expect(send).toHaveBeenCalledTimes(1);
    const [message] = send.mock.calls[0][0] as ExpoPushMessage[];
    expect(message).toMatchObject({
      to: 'ExponentPushToken[abc123]',
      title: 'Aprovação pendente',
      channelId: ANDROID_CHANNEL_ID,
      priority: 'high',
      sound: 'default',
      data: { approvalId: 'a1' },
    });
  });

  it('não chama a Expo para token de emulador (mock)', async () => {
    const { service, send } = setup([
      { id: 't1', token: 'ExponentPushToken[MOCK-EMULATOR-ANDROID]' },
    ]);

    await service.sendToUser('u1', { title: 'T', body: 'B' });

    expect(send).not.toHaveBeenCalled();
  });
});
