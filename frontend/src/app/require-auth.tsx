import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './auth-context';

type RequireAuthProps = {
  permissions?: readonly string[];
  children?: ReactNode;
};

export function RequireAuth({ permissions, children }: RequireAuthProps = {}) {
  const { isAuthenticated, isAuthHydrating, hasPermission } = useAuth();
  const location = useLocation();

  if (isAuthHydrating) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (permissions?.length && !permissions.some((code) => hasPermission(code))) {
    return <Navigate to="/inicio" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}
