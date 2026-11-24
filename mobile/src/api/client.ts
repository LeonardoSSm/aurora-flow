import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from '../config/environment';
import type { AuthSession } from './types';

export const ACCESS_TOKEN_KEY = 'fh_access_token';
export const REFRESH_TOKEN_KEY = 'fh_refresh_token';

type SessionListener = {
  onRefreshed: (session: AuthSession) => void;
  onExpired: () => void;
};

let listener: SessionListener | null = null;

/** O contexto de login escuta: sessão renovada (permissões novas) ou expirada (volta ao login). */
export function setSessionListener(next: SessionListener | null): void {
  listener = next;
}

const client = axios.create({ baseURL: API_BASE_URL, timeout: 20_000 });

client.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export async function storeSessionTokens(session: Pick<AuthSession, 'accessToken' | 'refreshToken'>): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, session.accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, session.refreshToken);
}

export async function clearSessionTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

/**
 * Uma renovação por vez: várias telas recebendo 401 juntas esperam a mesma. O refresh token é de
 * uso único (o backend gira a cada troca) — duas renovações em paralelo derrubavam a sessão.
 */
let refreshing: Promise<AuthSession | null> | null = null;

export function renewSession(): Promise<AuthSession | null> {
  if (!refreshing) {
    refreshing = (async () => {
      const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
      if (!refreshToken) return null;
      try {
        const { data } = await axios.post<AuthSession>(
          `${API_BASE_URL}/auth/refresh`,
          { refreshToken },
          { timeout: 15_000 },
        );
        await storeSessionTokens(data);
        listener?.onRefreshed(data);
        return data;
      } catch (error) {
        // Sem rede não é sessão vencida: mantém os tokens e deixa a tela mostrar o erro.
        if (axios.isAxiosError(error) && !error.response) throw error;
        return null;
      }
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

client.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retry && !original.url?.includes('/auth/')) {
      original._retry = true;
      const session = await renewSession().catch(() => undefined);
      if (session) {
        original.headers.Authorization = `Bearer ${session.accessToken}`;
        return client(original);
      }
      if (session === null) {
        await clearSessionTokens();
        listener?.onExpired();
      }
    }
    return Promise.reject(error);
  },
);

/** Mensagem do backend (NestJS manda `message` texto ou lista) ou a padrão. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
    const data = error.response.data as { message?: unknown } | undefined;
    const message = data?.message;
    if (typeof message === 'string' && message.trim()) return message;
    if (Array.isArray(message) && message.length > 0) return message.filter((m) => typeof m === 'string').join('\n');
    if (error.response.status === 403) return 'Você não tem permissão para isso.';
    if (error.response.status === 429) return 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.';
    if (error.response.status === 404) return 'Não encontrado — pode ter sido removido.';
  }
  return fallback;
}

export function isForbidden(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 403;
}

export default client;
