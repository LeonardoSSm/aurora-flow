import { Menu } from 'lucide-react';
import { Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  type Location,
  type RouteObject,
  useLocation,
  useNavigate,
  useRoutes,
} from 'react-router-dom';
import { useTheme } from '../hooks/use-theme';
import { ProductLogo } from '../brand/components/product-logo';
import {
  ADMIN_FALLBACK_BACKGROUND,
  AdminBackgroundContext,
  isAdminPath,
  readBackgroundLocation,
} from '../modules/admin/admin-route';
import { SidebarNav } from '../modules/layout/components/sidebar-nav';
import { sidebarTheme } from '../modules/layout/components/sidebar/sidebar-theme';
import { TopBar } from '../modules/layout/components/top-bar';
import { useShellControls } from '../modules/layout/hooks/use-shell-controls';
import { PageSkeleton } from './page-skeleton';

type AppShellProps = {
  /** Paginas do app; sempre renderizadas no <main>. */
  pageRoutes: RouteObject[];
  /** Administracao; renderizada como modal sobre a pagina de tras. */
  adminRoutes: RouteObject[];
};

export function AppShell({ pageRoutes, adminRoutes }: AppShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const isAdminOpen = isAdminPath(location.pathname);

  // Navegar dentro do modal por um link sem `state` (ex.: links internos da
  // documentacao) nao pode trocar a pagina de tras: guardamos a ultima.
  const lastBackgroundRef = useRef<Location | null>(null);
  const background = useMemo<Location | null>(() => {
    if (!isAdminOpen) return null;
    return (
      readBackgroundLocation(location) ??
      lastBackgroundRef.current ?? {
        pathname: ADMIN_FALLBACK_BACKGROUND,
        search: '',
        hash: '',
        state: null,
        key: 'admin-fallback',
      }
    );
  }, [isAdminOpen, location]);

  useEffect(() => {
    lastBackgroundRef.current = background;
  }, [background]);

  const pageLocation = background ?? location;
  // A mesma chamada de useRoutes renderiza a pagina com e sem o modal aberto:
  // abrir a Administracao nao remonta a pagina de tras (nem perde o que ha nela).
  const page = useRoutes(pageRoutes, pageLocation);
  const admin = useRoutes(adminRoutes);

  const closeAdmin = useCallback(() => {
    const target = background ?? lastBackgroundRef.current;
    if (target) {
      navigate(
        { pathname: target.pathname, search: target.search, hash: target.hash },
        { state: target.state },
      );
    } else {
      navigate(ADMIN_FALLBACK_BACKGROUND);
    }
  }, [background, navigate]);

  const adminBackgroundValue = useMemo(
    () => ({ background, close: closeAdmin }),
    [background, closeAdmin],
  );

  const { isDark, toggleTheme } = useTheme();
  const {
    searchTerm,
    onSearchChange,
    onSearchSubmit,
    clearSearch,
    isBuilderRoute,
    goToBuilder,
    logout,
    uiUser,
    isSidebarOpen,
    toggleSidebar,
    isMobileNavOpen,
    openMobileNav,
    closeMobileNav,
  } = useShellControls(pageLocation);
  return (
    <div className="min-h-screen md:flex">
      {isMobileNavOpen ? (
        <button
          type="button"
          aria-label="Fechar menu"
          tabIndex={-1}
          onClick={closeMobileNav}
          className={sidebarTheme.backdrop}
        />
      ) : null}

      <SidebarNav
        onCreateForm={goToBuilder}
        onLogout={logout}
        userName={uiUser.name}
        userEmail={uiUser.email}
        isOpen={isSidebarOpen}
        onToggleCollapse={toggleSidebar}
        isDark={isDark}
        onToggleTheme={toggleTheme}
        isMobileOpen={isMobileNavOpen}
        onCloseMobile={closeMobileNav}
      />

      <div className="flex min-w-0 flex-1 flex-col bg-bg-base">
        {isBuilderRoute ? (
          // O builder não tem barra superior; sem esta faixa o mobile ficaria
          // sem nenhuma forma de abrir o menu.
          <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border-default bg-bg-surface px-4 py-2 md:hidden">
            <button
              type="button"
              aria-label="Abrir menu"
              aria-expanded={isMobileNavOpen}
              onClick={openMobileNav}
              className={sidebarTheme.menuToggle}
            >
              <Menu className="h-5 w-5" />
            </button>
            <ProductLogo markClassName="h-7 w-7" />
          </div>
        ) : (
          <TopBar
            searchTerm={searchTerm}
            onSearchChange={onSearchChange}
            onSearchSubmit={onSearchSubmit}
            onClearSearch={clearSearch}
            onOpenMenu={openMobileNav}
            isMenuOpen={isMobileNavOpen}
          />
        )}

        <main className="min-w-0 flex-1 px-4 py-4 md:px-6 md:py-6">
          <Suspense fallback={<PageSkeleton />}>{page}</Suspense>
        </main>
      </div>

      {isAdminOpen ? (
        <AdminBackgroundContext.Provider value={adminBackgroundValue}>
          {/* O chunk do admin carrega sob demanda; o modal aparece quando chega. */}
          <Suspense fallback={null}>{admin}</Suspense>
        </AdminBackgroundContext.Provider>
      ) : null}
    </div>
  );
}
