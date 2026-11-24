import axios from 'axios';
import type { LoginResponse } from '../../../services/api';

const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

// Instância própria, sem os interceptors de sessão: a página do convite é pública. withCredentials
// porque aceitar o convite já abre a sessão e o backend grava o cookie de refresh na resposta.
const publicApi = axios.create({ baseURL: apiBaseUrl, withCredentials: true });

export type UserInviteView = {
  fullName: string;
  email: string;
  expiresAt: string;
};

export async function fetchUserInvite(token: string): Promise<UserInviteView> {
  const { data } = await publicApi.get<UserInviteView>(`/auth/invite/${encodeURIComponent(token)}`);
  return data;
}

export async function acceptUserInvite(token: string, password: string): Promise<LoginResponse> {
  const { data } = await publicApi.post<LoginResponse>(`/auth/invite/${encodeURIComponent(token)}`, {
    password,
  });
  return data;
}

/** 404 = convite inexistente, expirado ou já usado (o backend não distingue de propósito). */
export function isInvalidInviteError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 404;
}

export function inviteErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 429) return 'Muitas tentativas. Aguarde um minuto e tente de novo.';
    const message = (error.response?.data as { message?: unknown } | undefined)?.message;
    if (typeof message === 'string' && message.trim()) return message;
    if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
    if (!error.response) return 'Não foi possível conectar ao servidor.';
  }
  return fallback;
}
