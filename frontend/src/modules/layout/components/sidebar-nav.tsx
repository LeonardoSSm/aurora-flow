import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  X,
} from 'lucide-react';
import { useAuth } from '../../../app/auth-context';
import { ProductLogo } from '../../../brand/components/product-logo';
import { cn } from '../../../lib/cn';
import { filterByPermission } from '../../../lib/permission-nav';
import { type AdminLinkState, isAdminPath } from '../../admin/admin-route';
import { queryKeys } from '../../../lib/query-keys';
import { fetchAllFlows } from '../../flows/services/flows-api';
import { SidebarIcon } from './sidebar/sidebar-icon';
import { menuSections } from './sidebar/sidebar-menu';
import { sidebarTheme as t } from './sidebar/sidebar-theme';

/** Iniciais para o avatar do rodape: "Leonardo Silva" -> "LS". */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  return initials || '?';
}

type SidebarNavProps = {
  onCreateForm: () => void;
  onLogout: () => void;
  userName: string;
  userEmail: string;
  /** Desktop: barra aberta (rotulos) ou recolhida (60px, so icones). */
  isOpen: boolean;
  /** Alterna aberta/recolhida no desktop — o mesmo que Ctrl/Cmd+B. */
  onToggleCollapse: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  /** Gaveta aberta no mobile; no desktop a barra é sempre visível. */
  isMobileOpen: boolean;
  onCloseMobile: () => void;
};

export function SidebarNav({
  onCreateForm,
  onLogout,
  userName,
  userEmail,
  isOpen,
  onToggleCollapse,
  isDark,
  onToggleTheme,
  isMobileOpen,
  onCloseMobile,
}: SidebarNavProps) {
  const { hasPermission } = useAuth();
  // Sem flows.view em processo nenhum, o menu de fluxos some e a lista nem é pedida (a API responderia 403).
  const canViewFlows = hasPermission('flows.view');
  const canCreateProcess = hasPermission('flows.manage');
  const location = useLocation();
  const isFlowsRoute = location.pathname.startsWith('/flows');
  const [isFlowsSubmenuOpen, setIsFlowsSubmenuOpen] = useState(isFlowsRoute);
  const { data: flowsPage, isLoading: isLoadingFlows } = useQuery({
    queryKey: queryKeys.flows.list({ limit: 20 }),
    queryFn: () => fetchAllFlows({ limit: 20 }),
    enabled: isOpen && canViewFlows,
    staleTime: 30_000,
  });
  const userFlows = flowsPage?.data ?? [];
  const visibleMenuSections = menuSections.map((section) => ({
    ...section,
    items: filterByPermission(section.items, hasPermission),
  }));
  const initials = getInitials(userName);
  // A Administracao abre em modal sobre a pagina atual: o link leva onde voltar.
  const linkState = (to: string): AdminLinkState | undefined =>
    isAdminPath(to) ? { backgroundLocation: location } : undefined;
  const themeLabel = isDark ? 'Alternar para modo claro' : 'Alternar para modo escuro';
  const logoutLabel = `Sair (${userEmail})`;
  const toggleLabel = isOpen ? 'Fechar menu lateral (Ctrl+B)' : 'Abrir menu lateral (Ctrl+B)';

  useEffect(() => {
    if (isFlowsRoute) {
      setIsFlowsSubmenuOpen(true);
    }
  }, [isFlowsRoute]);

  // Os grids da barra levam `grid-cols-1` (= minmax(0,1fr)) em toda a cadeia. Sem
  // esse teto a trilha automatica e dimensionada pelo min-content dos itens: o
  // `truncate` dos rotulos nunca entra em acao, a coluna fica mais larga que a
  // barra e aparece scroll horizontal — pior ainda com o submenu de fluxos aberto,
  // cujos nomes sao longos.
  return (
    <aside
      className={cn(
        t.aside,
        isMobileOpen ? t.asideMobileOpen : t.asideMobileClosed,
        isOpen ? t.asideOpen : t.asideCollapsed,
      )}
    >
      {isOpen ? (
        <div className="grid h-full min-h-0 grid-cols-1 grid-rows-[auto_1fr_auto]">
          <div className={t.header}>
            <ProductLogo markClassName="h-7 w-7" wordmarkClassName="!text-[17px]" />
            <button
              type="button"
              aria-label={toggleLabel}
              title={toggleLabel}
              aria-expanded
              onClick={onToggleCollapse}
              className={cn('ml-auto hidden md:grid', t.toggleButton)}
            >
              <PanelLeftClose className="h-[18px] w-[18px]" />
            </button>
            <button
              type="button"
              aria-label="Fechar menu"
              onClick={onCloseMobile}
              className={t.closeButton}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className={t.nav}>
            {visibleMenuSections.map((section) => (
              <section key={section.title} className="grid grid-cols-1 gap-1">
                <h4 className={t.sectionTitle}>{section.title}</h4>
                <ul className="grid grid-cols-1 gap-px">
                  {section.items.map((item) => {
                    const isFlowsItem = item.icon === 'flows';

                    return (
                      <li key={item.to} className="min-w-0">
                        <div className="grid grid-cols-1 gap-1">
                          <div className="flex items-center gap-1">
                            <NavLink
                              to={item.to}
                              state={linkState(item.to)}
                              className={({ isActive }) =>
                                cn(t.item, isActive ? t.itemActive : t.itemIdle)
                              }
                            >
                              <SidebarIcon name={item.icon} className="h-[16px] w-[16px] shrink-0" />
                              <span className="truncate">{item.label}</span>
                            </NavLink>

                            {isFlowsItem ? (
                              <button
                                type="button"
                                aria-expanded={isFlowsSubmenuOpen}
                                title={isFlowsSubmenuOpen ? 'Recolher fluxos' : 'Expandir fluxos'}
                                onClick={() => setIsFlowsSubmenuOpen((open) => !open)}
                                className={cn(
                                  t.submenuToggle,
                                  isFlowsRoute && t.submenuToggleActive,
                                )}
                              >
                                {isFlowsSubmenuOpen ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </button>
                            ) : null}
                          </div>

                          {isFlowsItem && isFlowsSubmenuOpen ? (
                            <ul className={t.submenuList}>
                              <li className="min-w-0">
                                <NavLink
                                  to="/flows/new"
                                  className={({ isActive }) =>
                                    cn(
                                      t.submenuItem,
                                      isActive ? t.submenuItemActive : t.submenuItemIdle,
                                    )
                                  }
                                >
                                  Novo fluxo
                                </NavLink>
                              </li>

                              {isLoadingFlows ? (
                                <li className={t.submenuHint}>Carregando...</li>
                              ) : null}

                              {!isLoadingFlows && userFlows.length === 0 ? (
                                <li className={t.submenuHint}>Nenhum fluxo</li>
                              ) : null}

                              {!isLoadingFlows
                                ? userFlows.map((flow) => (
                                    <li key={flow.id} className="min-w-0">
                                      <NavLink
                                        to={`/flows/${flow.id}`}
                                        title={flow.name}
                                        className={({ isActive }) =>
                                          cn(
                                            t.submenuItem,
                                            isActive ? t.submenuItemActive : t.submenuItemIdle,
                                          )
                                        }
                                      >
                                        {flow.name}
                                      </NavLink>
                                    </li>
                                  ))
                                : null}
                            </ul>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </nav>

          <div className={t.footer}>
            {canCreateProcess ? (
              <button type="button" className={t.cta} onClick={onCreateForm}>
                <SidebarIcon name="plus" className="h-[16px] w-[16px]" />
                <span>Novo fluxo</span>
              </button>
            ) : null}

            <div className={t.userRow}>
              <span className={t.avatar} aria-hidden>
                {initials}
              </span>

              <span className={t.userIdentity}>
                <span className={t.userName} title={userName}>
                  {userName}
                </span>
                <span className={t.userEmail} title={userEmail}>
                  {userEmail}
                </span>
              </span>

              <button
                type="button"
                aria-label={themeLabel}
                title={themeLabel}
                onClick={onToggleTheme}
                className={t.iconButton}
              >
                {isDark ? <Sun className="h-[15px] w-[15px]" /> : <Moon className="h-[15px] w-[15px]" />}
              </button>

              <button
                type="button"
                aria-label={logoutLabel}
                title={logoutLabel}
                onClick={onLogout}
                className={t.iconButton}
              >
                <SidebarIcon name="logout" className="h-[16px] w-[16px]" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="hidden h-full min-h-0 md:grid md:grid-rows-[auto_1fr_auto]">
          <div className={t.headerCollapsed}>
            <button
              type="button"
              aria-label={toggleLabel}
              title={toggleLabel}
              aria-expanded={false}
              onClick={onToggleCollapse}
              className={t.toggleButton}
            >
              <PanelLeftOpen className="h-[18px] w-[18px]" />
            </button>
          </div>

          <nav className={t.navCollapsed}>
            {visibleMenuSections.map((section, index) => (
              <ul
                key={section.title}
                className={cn('grid grid-cols-1 gap-px', index > 0 && t.sectionDivider)}
              >
                {section.items.map((item) => (
                  <li key={item.to} className="min-w-0">
                    <NavLink
                      to={item.to}
                      state={linkState(item.to)}
                      title={item.label}
                      className={({ isActive }) =>
                        cn(t.railItem, isActive ? t.railItemActive : t.railItemIdle)
                      }
                    >
                      <SidebarIcon name={item.icon} className="h-[16px] w-[16px]" />
                    </NavLink>
                  </li>
                ))}
              </ul>
            ))}
          </nav>

          <div className={t.footerCollapsed}>
            {canCreateProcess ? (
              <button
                type="button"
                aria-label="Novo fluxo"
                title="Novo fluxo"
                className={t.railCta}
                onClick={onCreateForm}
              >
                <SidebarIcon name="plus" className="h-[16px] w-[16px]" />
              </button>
            ) : null}

            <div className={t.userRowCollapsed}>
              <span className={t.avatar} title={userName}>
                {initials}
              </span>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
