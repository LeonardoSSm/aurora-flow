import axios from 'axios';
import { queryClient } from '../lib/query-client';
import { queryKeys } from '../lib/query-keys';
import type { PermissionScope } from '../lib/permissions';
import type { ProcessPermissionMap } from '../lib/process-permissions';

export const apiBaseUrl =
  import.meta.env.VITE_API_URL ?? `http://${window.location.hostname}:3000/api/v1`;

export const api = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
});

// Dedicated instance for refresh — no response interceptors so failures don't loop
const refreshClient = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
});

let refreshPromise: Promise<LoginResponse> | null = null;

export type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    // Role *code* — any perfil registrado em /roles, não só os 4 padrão.
    role: string;
    isActive: boolean;
    // false = conta criada pelo login Google que ainda não cadastrou senha local.
    hasPassword: boolean;
    googleAccountEmail: string | null;
    googleConnectionStatus: 'configured' | 'connected' | 'disconnected';
    areaId?: string | null;
    areaName?: string | null;
  };
  permissions: Record<string, PermissionScope>;
  /** Permissões em cada processo com que a pessoa tem vínculo (vazio com acesso total). */
  processPermissions?: ProcessPermissionMap;
  /** Acesso total aos processos pelo perfil. */
  processesFullAccess?: boolean;
};

export type AuthUser = LoginResponse['user'];

async function refreshSession(): Promise<LoginResponse> {
  const { data } = await refreshClient.post<LoginResponse>('/auth/refresh');
  setAccessToken(data.accessToken);
  queryClient.setQueryData(queryKeys.auth.me(), data);
  return data;
}

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) {
      return Promise.reject(error);
    }

    const originalRequest =
      (error.config as (typeof error.config & { _retry?: boolean }) | undefined) ?? undefined;
    const requestUrl = String(originalRequest?.url ?? '');
    const isAuthRoute =
      requestUrl.includes('/auth/login') ||
      requestUrl.includes('/auth/refresh') ||
      requestUrl.includes('/auth/google/login-url');

    if (
      error.response?.status === 401 &&
      !isAuthRoute &&
      originalRequest &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true;

      try {
        refreshPromise ??= refreshSession();
        const session = await refreshPromise;
        originalRequest.headers = originalRequest.headers ?? {};
        originalRequest.headers.Authorization = `Bearer ${session.accessToken}`;
        return api.request(originalRequest);
      } catch {
        queryClient.setQueryData(queryKeys.auth.me(), null);
      } finally {
        refreshPromise = null;
      }
    }

    if (error.response?.status === 401 && !isAuthRoute) {
      queryClient.setQueryData(queryKeys.auth.me(), null);
    }

    return Promise.reject(error);
  },
);

/** Token atual (o mesmo que o axios manda); para quem fala com a API sem o axios, como o SSE. */
export function currentAccessToken(): string | null {
  const header = api.defaults.headers.common.Authorization;
  return typeof header === 'string' ? header.replace(/^Bearer\s+/, '') : null;
}

/** Renova o token pelo cookie de refresh, na mesma fila do interceptor; `null` se a sessão caiu. */
export async function refreshAccessToken(): Promise<string | null> {
  try {
    refreshPromise ??= refreshSession();
    return (await refreshPromise).accessToken;
  } catch {
    return null;
  } finally {
    refreshPromise = null;
  }
}

export function setAccessToken(token: string | null): void {
  if (!token) {
    delete api.defaults.headers.common.Authorization;
    return;
  }
  api.defaults.headers.common.Authorization = `Bearer ${token}`;
}

// Attempt to restore session from the formhub_refresh cookie (called on app mount).
// Uses refreshClient so failures never trigger the 401 interceptor chain.
export async function tryHydrateSession(): Promise<LoginResponse | null> {
  try {
    const { data } = await refreshClient.post<LoginResponse>('/auth/refresh');
    setAccessToken(data.accessToken);
    return data;
  } catch {
    return null;
  }
}
