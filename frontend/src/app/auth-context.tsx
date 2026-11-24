import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import type { ReactNode } from 'react';
import { useToast } from '../components/ui';
import { queryClient } from '../lib/query-client';
import { queryKeys } from '../lib/query-keys';
import { hasPermission as checkPermission, type PermissionScope } from '../lib/permissions';
import { canInProcess as checkInProcess, type ProcessPermissionMap } from '../lib/process-permissions';
import {
  useLoginMutation,
  useLogoutMutation,
  useMeQuery,
} from '../modules/auth/queries/auth.queries';
import { setAccessToken, type AuthUser, type LoginResponse } from '../services/api';

type AuthContextType = {
  user: AuthUser | null;
  token: string | null;
  permissions: Record<string, PermissionScope>;
  hasPermission: (code: string, minScope?: PermissionScope) => boolean;
  /**
   * Pode `code` NAQUELE processo (o que o backend confere). Sem `formId`, em algum processo — para
   * menus e telas que não são de um processo só. Permissão de sistema ignora o processo.
   */
  can: (code: string, formId?: string | null) => boolean;
  /** Acesso total aos processos pelo perfil (passa por cima de quem atua na fase, por exemplo). */
  processesFullAccess: boolean;
  isAuthenticated: boolean;
  isAuthHydrating: boolean;
  login: (email: string, password: string) => Promise<void>;
  applySession: (
    session: Pick<LoginResponse, 'accessToken' | 'user' | 'permissions' | 'processPermissions' | 'processesFullAccess'>,
  ) => void;
  logout: () => void;
};

const EMPTY_PERMISSIONS: Record<string, PermissionScope> = {};
const EMPTY_PROCESS_PERMISSIONS: ProcessPermissionMap = {};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { showToast } = useToast();
  const lastUnauthorizedToastRef = useRef(0);
  const prevUserRef = useRef<AuthUser | null>(null);

  const meQuery = useMeQuery();
  const loginMutation = useLoginMutation();
  const logoutMutation = useLogoutMutation();

  const session = meQuery.data ?? null;
  const token = session?.accessToken ?? null;
  const user = session?.user ?? null;
  const permissions = session?.permissions ?? EMPTY_PERMISSIONS;
  const processPermissions = session?.processPermissions ?? EMPTY_PROCESS_PERMISSIONS;
  const processesFullAccess = session?.processesFullAccess ?? false;
  const isAuthHydrating = meQuery.isLoading;

  // Keep axios Authorization header in sync with token from query data
  useLayoutEffect(() => {
    setAccessToken(token);
  }, [token]);

  // Show toast when an authenticated session becomes null due to 401 (not on logout or initial load)
  useEffect(() => {
    const wasAuthenticated = prevUserRef.current !== null;
    const isNowUnauthenticated = user === null;
    if (wasAuthenticated && isNowUnauthenticated && !isAuthHydrating) {
      const now = Date.now();
      if (now - lastUnauthorizedToastRef.current > 2500) {
        showToast({
          title: 'Sessão expirada',
          description: 'Faça login novamente para continuar.',
          variant: 'warning',
        });
        lastUnauthorizedToastRef.current = now;
      }
    }
    prevUserRef.current = user;
  }, [user, isAuthHydrating, showToast]);

  const login = useCallback(
    async (email: string, password: string) => {
      await loginMutation.mutateAsync({ email, password });
    },
    [loginMutation],
  );

  const applySession = useCallback(
    (
      session: Pick<
        LoginResponse,
        'accessToken' | 'user' | 'permissions' | 'processPermissions' | 'processesFullAccess'
      >,
    ) => {
      setAccessToken(session.accessToken);
      queryClient.setQueryData(queryKeys.auth.me(), session as LoginResponse);
    },
    [],
  );

  const logout = useCallback(() => {
    logoutMutation.mutate();
  }, [logoutMutation]);

  const hasPermission = useCallback(
    (code: string, minScope?: PermissionScope) => checkPermission(permissions, code, minScope),
    [permissions],
  );

  const can = useCallback(
    (code: string, formId?: string | null) =>
      checkInProcess({ permissions, processPermissions, processesFullAccess }, code, formId),
    [permissions, processPermissions, processesFullAccess],
  );

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      token,
      permissions,
      hasPermission,
      can,
      processesFullAccess,
      isAuthenticated: Boolean(user),
      isAuthHydrating,
      login,
      applySession,
      logout,
    }),
    [
      user,
      token,
      permissions,
      hasPermission,
      can,
      processesFullAccess,
      isAuthHydrating,
      login,
      applySession,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Para telas públicas que só aproveitam a sessão quando há: `null` fora do `AuthProvider`. */
export function useOptionalAuth() {
  return useContext(AuthContext);
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return context;
}
