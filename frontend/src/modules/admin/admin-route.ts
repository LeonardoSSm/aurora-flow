import { createContext, useContext } from 'react';
import type { Location } from 'react-router-dom';

/**
 * A Administracao abre como modal sobre a pagina de onde veio (padrao
 * "background location" do react-router): os links para `/administracao/*`
 * levam `state.backgroundLocation`, o AppShell continua renderizando a pagina
 * de tras com essa location e o modal por cima. Sem ela (URL aberta direto),
 * o fundo e o Inicio.
 */
export const ADMIN_BASE = '/administracao';
export const ADMIN_FALLBACK_BACKGROUND = '/inicio';

export type AdminLinkState = { backgroundLocation?: Location };

export function isAdminPath(pathname: string): boolean {
  return pathname === ADMIN_BASE || pathname.startsWith(`${ADMIN_BASE}/`);
}

export function readBackgroundLocation(location: Location): Location | null {
  const state = location.state as AdminLinkState | null;
  return state?.backgroundLocation ?? null;
}

type AdminBackgroundValue = {
  /** Pagina que fica por tras do modal. */
  background: Location | null;
  /** Fecha o modal voltando para a pagina de tras (ou o Inicio). */
  close: () => void;
};

export const AdminBackgroundContext = createContext<AdminBackgroundValue>({
  background: null,
  close: () => {},
});

export function useAdminBackground() {
  return useContext(AdminBackgroundContext);
}
