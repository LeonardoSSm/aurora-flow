import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { type Location, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../app/auth-context';

const SIDEBAR_COLLAPSED_KEY = 'tf.sidebar.collapsed';

// localStorage pode lancar (modo privado, cota, storage bloqueado): nesse caso a
// barra so nao lembra a escolha entre recargas.
function readStoredFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeStoredFlag(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // ignora: o estado continua valendo nesta sessao
  }
}

/**
 * `pageLocation`: a pagina exibida no <main>. Com a Administracao aberta em modal
 * ela e a pagina de tras, nao a URL atual — barra superior e busca seguem ela.
 */
export function useShellControls(pageLocation?: Location) {
  const navigate = useNavigate();
  const currentLocation = useLocation();
  const location = pageLocation ?? currentLocation;
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const { user, logout } = useAuth();
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('q') ?? '');
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return true;
    }
    return window.matchMedia('(min-width: 768px)').matches;
  });
  // Gaveta do mobile: independente de `isSidebarCollapsed`, que controla apenas
  // se a barra mostra rotulos (aberta) ou so icones (recolhida) no desktop.
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  // Recolher e uma escolha explicita (botao no topo da barra ou Ctrl/Cmd+B),
  // persistida entre sessoes — no lugar do antigo abre-no-hover.
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() =>
    readStoredFlag(SIDEBAR_COLLAPSED_KEY),
  );
  // No mobile a barra e gaveta e sempre mostra rotulos.
  const isSidebarOpen = !isDesktop || !isSidebarCollapsed;

  const currentQuery = searchParams.get('q') ?? '';
  const isBuilderRoute =
    location.pathname.startsWith('/builder') ||
    location.pathname === '/flows/new' ||
    /^\/flows\/[^/]+$/.test(location.pathname);

  useEffect(() => {
    setSearchTerm(currentQuery);
  }, [currentQuery]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const media = window.matchMedia('(min-width: 768px)');
    const onChange = (event: MediaQueryListEvent) => {
      setIsDesktop(event.matches);
    };

    setIsDesktop(media.matches);

    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const toggleSidebar = useCallback(() => {
    setIsSidebarCollapsed((collapsed) => {
      writeStoredFlag(SIDEBAR_COLLAPSED_KEY, !collapsed);
      return !collapsed;
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleSidebar]);

  const openMobileNav = useCallback(() => setIsMobileNavOpen(true), []);
  const closeMobileNav = useCallback(() => setIsMobileNavOpen(false), []);

  // Navegar fecha a gaveta — senao ela cobre a pagina que acabou de abrir.
  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (isDesktop) {
      setIsMobileNavOpen(false);
    }
  }, [isDesktop]);

  useEffect(() => {
    if (!isMobileNavOpen || typeof window === 'undefined') {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileNavOpen(false);
      }
    };

    // Trava a rolagem do conteudo enquanto a gaveta esta por cima dele.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isMobileNavOpen]);

  const onSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
  }, []);

  const applySearch = useCallback(
    (term: string) => {
      const nextQuery = term.trim();
      const nextSearch = new URLSearchParams(location.search);

      if (nextQuery) {
        nextSearch.set('q', nextQuery);
      } else {
        nextSearch.delete('q');
      }

      navigate(
        {
          pathname: location.pathname,
          search: nextSearch.toString(),
        },
        { replace: false },
      );
    },
    [location.pathname, location.search, navigate],
  );

  const onSearchSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      applySearch(searchTerm);
    },
    [applySearch, searchTerm],
  );

  const clearSearch = useCallback(() => {
    setSearchTerm('');
    applySearch('');
  }, [applySearch]);

  const goToBuilder = useCallback(() => {
    navigate('/flows/new');
  }, [navigate]);

  const uiUser = useMemo(
    () => ({
      name: user?.fullName ?? 'Usuário',
      email: user?.email ?? 'sem-email',
    }),
    [user?.email, user?.fullName],
  );

  return {
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
  };
}
