import { Maximize2, Minimize2, X } from 'lucide-react';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { cn } from '../../../lib/cn';
import { useAdminBackground } from '../admin-route';
import { type AdminHeader, AdminModalContext, useInert } from '../components/admin-modal-context';
import { AdminSideNav } from '../components/admin-module-nav';
import { adminSectionHeader, adminSectionOf } from '../constants';
import { SettingsDraftProvider } from './admin-settings-view';

const FULLSCREEN_KEY = 'tf.admin.fullscreen';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function readFullscreen(): boolean {
  try {
    return window.localStorage.getItem(FULLSCREEN_KEY) === '1';
  } catch {
    return false;
  }
}

function writeFullscreen(value: boolean) {
  try {
    window.localStorage.setItem(FULLSCREEN_KEY, value ? '1' : '0');
  } catch {
    // ignora: vale so nesta sessao
  }
}

function isTypingTarget(element: Element | null): boolean {
  if (!element) return false;
  const tag = element.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    (element instanceof HTMLElement && element.isContentEditable)
  );
}

/**
 * Administracao em modal sobre a pagina de tras (estilo Claude): nav lateral com
 * grupos e busca, cabecalho com titulo/descricao da secao e corpo rolavel.
 *
 * Teclado: Esc fecha, nesta ordem, um modal interno (diagrama ampliado, criar
 * usuario...), a busca com texto, o que a secao registrou em useAdminEscape
 * (ex.: selecao do Mapa de servicos) e por fim o proprio modal; "/" foca a busca.
 */
export function AdminModal() {
  const location = useLocation();
  const { close } = useAdminBackground();

  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const escapeHandlers = useRef<Array<{ current: () => void }>>([]);
  const [query, setQuery] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(readFullscreen);
  const [actionsSlot, setActionsSlot] = useState<HTMLDivElement | null>(null);
  const [footerSlot, setFooterSlot] = useState<HTMLDivElement | null>(null);
  const [overlaySlot, setOverlaySlot] = useState<HTMLDivElement | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const sectionLayerRef = useRef<HTMLDivElement>(null);
  useInert(sectionLayerRef, overlayOpen);
  const [override, setOverride] = useState<{
    path: string;
    header: Partial<AdminHeader>;
  } | null>(null);

  const isSettings = adminSectionOf(location.pathname) === 'configuracoes';
  const [settingsVisited, setSettingsVisited] = useState(isSettings);
  useEffect(() => {
    if (isSettings) setSettingsVisited(true);
  }, [isSettings]);

  const header: AdminHeader = {
    ...adminSectionHeader(location.pathname, location.search),
    ...(override?.path === location.pathname ? override.header : {}),
  };

  const setHeaderOverride = useCallback((path: string, next: Partial<AdminHeader> | null) => {
    setOverride((current) => {
      if (next) return { path, header: next };
      return current?.path === path ? null : current;
    });
  }, []);

  const contextValue = useMemo(
    () => ({
      scrollRef,
      setHeaderOverride,
      actionsSlot,
      footerSlot,
      overlaySlot,
      setOverlayOpen,
      escapeHandlers,
    }),
    [setHeaderOverride, actionsSlot, footerSlot, overlaySlot],
  );

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((value) => {
      writeFullscreen(!value);
      return !value;
    });
  }, []);

  // Cada secao comeca do topo.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [location.pathname, location.search]);

  // Foco: entra no painel e, ao fechar, volta para quem abriu (link da sidebar).
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  // A pagina de tras nao rola enquanto o modal esta aberto.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const panel = panelRef.current;
      if (!panel) return;

      if (event.key === 'Escape') {
        // Modal interno aberto: ele trata o proprio Esc (useEscapeKey / DocDiagram).
        if (panel.querySelector('[aria-modal="true"]')) return;
        event.preventDefault();
        if (searchRef.current?.value) {
          setQuery('');
          return;
        }
        const sectionHandler = escapeHandlers.current[escapeHandlers.current.length - 1];
        if (sectionHandler) {
          sectionHandler.current();
          return;
        }
        close();
        return;
      }

      if (
        event.key === '/' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !isTypingTarget(document.activeElement) &&
        !panel.querySelector('[aria-modal="true"]')
      ) {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }

      // Foco preso no painel.
      if (event.key === 'Tab') {
        const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
          (el) =>
            !el.closest('[inert]') && (el.offsetParent !== null || el === document.activeElement),
        );
        if (focusables.length === 0) {
          event.preventDefault();
          panel.focus();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (!panel.contains(active)) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && (active === first || active === panel)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close]);

  return (
    <AdminModalContext.Provider value={contextValue}>
      <SettingsDraftProvider enabled={settingsVisited}>
        <div
          aria-hidden
          onClick={close}
          className="fixed inset-0 z-50 animate-fade bg-black/40 motion-reduce:animate-none"
        />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Administração"
          tabIndex={-1}
          className={cn(
            'fixed inset-0 z-[51] flex animate-admin-in flex-col overflow-hidden bg-bg-surface shadow-[0_24px_64px_rgba(13,29,41,.22)] outline-none motion-reduce:animate-none md:flex-row',
            isFullscreen
              ? 'md:inset-0'
              : 'md:inset-[max(24px,calc((100vh_-_760px)/2))_max(24px,calc((100vw_-_1120px)/2))] md:rounded-2xl',
          )}
        >
          <AdminSideNav query={query} onQueryChange={setQuery} searchRef={searchRef} />

          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {/* Camada da secao: sai para a esquerda quando um painel ocupa o overlay. */}
            <div
              ref={sectionLayerRef}
              aria-hidden={overlayOpen || undefined}
              className={cn(
                'flex min-h-0 flex-1 flex-col [transition:transform_520ms_cubic-bezier(.22,1,.36,1),opacity_520ms_ease] motion-reduce:transition-none',
                overlayOpen && 'pointer-events-none -translate-x-[18%] opacity-0',
              )}
            >
              <div className="flex items-start gap-4 px-4 pb-4 pt-5 md:pl-8 md:pr-5">
                <div className="grid min-w-0 flex-1 gap-1">
                  {header.kicker ? (
                    <span className="text-xs font-semibold text-tx-muted">{header.kicker}</span>
                  ) : null}
                  <h2 className="text-xl font-extrabold tracking-[-0.01em] text-tx-primary">
                    {header.title}
                  </h2>
                  {header.description ? (
                    <p className="max-w-[620px] text-[13px] text-tx-muted">{header.description}</p>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <div
                    ref={setActionsSlot}
                    className="mr-1.5 flex flex-wrap items-center justify-end gap-2 empty:hidden"
                  />
                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    aria-label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
                    title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
                    className="hidden h-8 w-8 place-items-center rounded-lg text-tx-secondary transition-colors hover:bg-bg-s3 md:grid"
                  >
                    {isFullscreen ? (
                      <Minimize2 className="h-4 w-4" aria-hidden />
                    ) : (
                      <Maximize2 className="h-4 w-4" aria-hidden />
                    )}
                  </button>
                  <kbd className="hidden rounded-[5px] border border-border-default px-1.5 py-px font-body text-[11px] font-semibold text-tx-muted md:inline-block">
                    Esc
                  </kbd>
                  <button
                    type="button"
                    onClick={close}
                    aria-label="Fechar"
                    className="grid h-8 w-8 place-items-center rounded-lg text-tx-secondary transition-colors hover:bg-bg-s3"
                  >
                    <X className="h-[18px] w-[18px]" aria-hidden />
                  </button>
                </div>
              </div>

              <div
                ref={scrollRef}
                className="admin-scroll relative min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-1 md:px-8"
              >
                <Suspense fallback={<p className="text-[13px] text-tx-muted">Carregando…</p>}>
                  <Outlet />
                </Suspense>
              </div>

              <div ref={setFooterSlot} />
            </div>

            <div ref={setOverlaySlot} className="pointer-events-none absolute inset-0 z-10" />
          </div>
        </div>
      </SettingsDraftProvider>
    </AdminModalContext.Provider>
  );
}
