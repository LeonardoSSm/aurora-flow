import { useMutation, useQuery } from '@tanstack/react-query';
import { queryClient } from '../../../lib/query-client';
import { queryKeys } from '../../../lib/query-keys';
import { api, setAccessToken, tryHydrateSession, type LoginResponse } from '../../../services/api';
import { clearExperienceMode } from '../../experience-mode/experience-mode-store';

export function useMeQuery() {
  return useQuery({
    queryKey: queryKeys.auth.me(),
    queryFn: () => tryHydrateSession(),
    staleTime: Infinity,
    retry: 0,
  });
}

export function useLoginMutation() {
  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const { data } = await api.post<LoginResponse>('/auth/login', { email, password });
      setAccessToken(data.accessToken);
      return data;
    },
    onSuccess: (data) => {
      // Cada entrada no sistema pergunta de novo (simplificado ou avançado), a menos que a
      // pessoa tenha marcado "lembrar minha escolha" — ver experience-mode-store.
      clearExperienceMode();
      queryClient.setQueryData(queryKeys.auth.me(), data);
    },
  });
}

export function useSetPasswordMutation() {
  return useMutation({
    mutationFn: async (payload: { password: string; currentPassword?: string }) => {
      const { data } = await api.post<LoginResponse>('/auth/password', payload);
      setAccessToken(data.accessToken);
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.auth.me(), data);
    },
  });
}

export function useLogoutMutation() {
  return useMutation({
    mutationFn: async () => {
      await api.post('/auth/logout').catch(() => {});
      setAccessToken(null);
    },
    onSuccess: () => {
      clearExperienceMode();
      queryClient.setQueryData(queryKeys.auth.me(), null);
      // Nada do usuário anterior fica no cache (sino, aprovações, solicitações…): quem entrar
      // em seguida no mesmo navegador não pode ver — nem por alguns segundos — o que era dele.
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
    },
  });
}
