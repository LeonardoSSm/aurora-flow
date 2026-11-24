import { useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  clearSessionTokens,
  REFRESH_TOKEN_KEY,
  renewSession,
  setSessionListener,
  storeSessionTokens,
} from '../api/client';
import { login as apiLogin, logoutSession } from '../api/endpoints';
import type { AuthSession, AuthUser, PermissionScope, ProcessPermissionMap } from '../api/types';
import { canInProcess, hasPermission } from '../domain/permissions';

type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Acesso total aos processos pelo perfil (passa por cima de quem atua na fase). */
  processesFullAccess: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Permissão de sistema (`code`) ou, com `formId`, naquele processo — mesma regra do web. */
  can: (code: string, formId?: string | null) => boolean;
};

type SessionInfo = {
  user: AuthUser;
  permissions: Record<string, PermissionScope>;
  processPermissions: ProcessPermissionMap;
  processesFullAccess: boolean;
};

function toInfo(session: AuthSession): SessionInfo {
  return {
    user: session.user,
    permissions: session.permissions ?? {},
    processPermissions: session.processPermissions ?? {},
    processesFullAccess: session.processesFullAccess === true,
  };
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setSessionListener({
      onRefreshed: (next) => setSession(toInfo(next)),
      onExpired: () => {
        setSession(null);
        queryClient.clear();
      },
    });
    return () => setSessionListener(null);
  }, [queryClient]);

  // Ao abrir: renova com o refresh token guardado — volta logado e com as permissões de hoje.
  useEffect(() => {
    (async () => {
      try {
        const next = await renewSession();
        if (next) setSession(toInfo(next));
      } catch {
        // Sem rede ao abrir: a pessoa vê o login e tenta de novo quando tiver conexão.
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const next = await apiLogin(email.trim(), password);
    await storeSessionTokens(next);
    queryClient.clear();
    setSession(toInfo(next));
  }, [queryClient]);

  const logout = useCallback(async () => {
    const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    await logoutSession(refreshToken);
    await clearSessionTokens();
    setSession(null);
    queryClient.clear();
  }, [queryClient]);

  const can = useCallback(
    (code: string, formId?: string | null) =>
      session
        ? formId === undefined
          ? hasPermission(session.permissions, code)
          : canInProcess(session, code, formId)
        : false,
    [session],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      isAuthenticated: session !== null,
      isLoading,
      processesFullAccess: session?.processesFullAccess ?? false,
      login,
      logout,
      can,
    }),
    [session, isLoading, login, logout, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de AuthProvider');
  return ctx;
}
