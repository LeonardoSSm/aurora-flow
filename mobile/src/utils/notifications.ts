import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const MOCK_PUSH_TOKEN_PREFIX = 'MOCK-EMULATOR';

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    if (__DEV__) {
      const mockToken = `ExponentPushToken[${MOCK_PUSH_TOKEN_PREFIX}-${Platform.OS.toUpperCase()}]`;
      console.info(`[DEV] Emulador detectado — usando token mock: ${mockToken}`);
      return mockToken;
    }
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Tijuca Flow',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1A3C8F',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('Push notification permission not granted.');
    return null;
  }

  const projectId =
    (Constants.expoConfig?.extra?.eas?.projectId as string | undefined) ||
    (Constants.easConfig?.projectId as string | undefined);

  if (!projectId) {
    console.warn(
      'EAS projectId não configurado. Push notifications desabilitadas. Execute: eas init',
    );
    return null;
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    return tokenData.data;
  } catch (error) {
    console.warn('Could not get push token:', error);
    return null;
  }
}
