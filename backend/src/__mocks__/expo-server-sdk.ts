const Expo = jest.fn().mockImplementation(() => ({
  chunkPushNotifications: jest.fn().mockReturnValue([]),
  sendPushNotificationsAsync: jest.fn().mockResolvedValue([]),
})) as unknown as {
  new (): { chunkPushNotifications: jest.Mock; sendPushNotificationsAsync: jest.Mock };
  isExpoPushToken: jest.Mock;
};

(Expo as unknown as { isExpoPushToken: jest.Mock }).isExpoPushToken = jest
  .fn()
  .mockReturnValue(true);

export default Expo;
export type ExpoPushMessage = Record<string, unknown>;
export type ExpoPushTicket = { status: 'ok' | 'error'; message?: string; details?: { error?: string } };
