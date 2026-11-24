import { api } from '../../../services/api';

export type GoogleWorkspaceConnectionStatus = {
  oauthConfigured: boolean;
  status: 'configured' | 'connected' | 'disconnected';
  domain: string;
  linkedAccountEmail: string | null;
  connectedAt: string | null;
  disconnectedAt: string | null;
  lastUsedAt: string | null;
};

export async function fetchGoogleLoginUrl() {
  const { data } = await api.get<{ url: string }>('/auth/google/login-url');
  return data.url;
}

export async function fetchGoogleConnectUrl(redirectPath?: string) {
  const { data } = await api.get<{ url: string }>('/auth/google/connect-url', {
    params: redirectPath ? { redirectPath } : undefined,
  });
  return data.url;
}

export async function fetchGoogleWorkspaceStatus() {
  const { data } = await api.get<GoogleWorkspaceConnectionStatus>('/auth/google/status');
  return data;
}

export async function disconnectGoogleWorkspace() {
  const { data } = await api.post<GoogleWorkspaceConnectionStatus>('/auth/google/disconnect');
  return data;
}
