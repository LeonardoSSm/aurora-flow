import Constants from 'expo-constants';

const DEVELOPMENT_API_URL = 'http://10.0.2.2:3000/api/v1';

const configuredApiUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ||
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined)?.trim();

const resolvedApiUrl = configuredApiUrl || (__DEV__ ? DEVELOPMENT_API_URL : '');

if (!resolvedApiUrl) {
  throw new Error(
    'EXPO_PUBLIC_API_BASE_URL deve ser definida ao gerar uma versão de produção.',
  );
}

if (!/^https?:\/\//i.test(resolvedApiUrl)) {
  throw new Error('EXPO_PUBLIC_API_BASE_URL deve começar com http:// ou https://.');
}

export const API_BASE_URL = resolvedApiUrl.replace(/\/+$/, '');
