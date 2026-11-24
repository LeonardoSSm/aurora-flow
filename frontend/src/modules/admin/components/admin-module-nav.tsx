import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { type KeyboardEvent, type RefObject, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../app/auth-context';
import { cn } from '../../../lib/cn';
import { filterByPermission } from '../../../lib/permission-nav';
import { SidebarIcon } from '../../layout/components/sidebar/sidebar-icon';
import { type AdminLinkState, useAdminBackground } from '../admin-route';
import {
  type AdminNavItem,
  adminNavGroups,
  adminPath,
  adminSectionOf,
  filterAdminNav,
} from '../constants';
import {
  resolveSettingsTab,
  SETTINGS_TAB_PARAM,
  type SettingsTabDef,
  useOptionalSettingsDraft,
} from '../views/admin-settings-view';

const itemBase =
  'flex h-[30px] w-full min-w-0 items-center gap-2 rounded-[7px] px-2 text-left text-[13px] transition-colors';
const subitemBase =
  'flex h-[26px] w-full min-w-0 items-center gap-1.5 rounded-md px-2 text-left text-[12.5px] transition-colors';
const stateActive = 'bg-primary/[.08] font-semibold text-primary hover:bg-primary/10';
const stateIdle = 'font-medium text-tx-secondary hover:bg-bg-s3';

type AdminSideNavProps = {
  query: string;
  onQueryChange: (value: string) => void;
  searchRef: RefObject<HTMLInputElement>;
};

/**
 * Navegacao lateral do modal de Administracao: grupos, Configuracoes expansivel
 * com as abas como subitens (pontos ambar/vermelho do rascunho) e busca que acha
 * secoes, campos de configuracao e artigos da documentacao.
 */
export function AdminSideNav({ query, onQueryChange, searchRef }: AdminSideNavProps) {
  const { hasPermission } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { background } = useAdminBackground();
  const draft = useOptionalSettingsDraft();

  const section = adminSectionOf(location.pathname);
  const isSettings = section === 'configuracoes';
  const activeTab = isSettings ? resolveSettingsTab(location.search) : null;
  const [settingsExpanded, setSettingsExpanded] = useState(true);

  useEffect(() => {
    if (isSettings) setSettingsExpanded(true);
  }, [isSettings]);

  const visibleGroups = useMemo(
    () =>
      adminNavGroups.map((group) => ({
        ...group,
        items: filterByPermission(group.items, hasPermission),
      })),
    [hasPermission],
  );
  const results = useMemo(() => filterAdminNav(visibleGroups, query), [visibleGroups, query]);
  const isSearching = query.trim().length > 0;

  const linkState: AdminLinkState = { backgroundLocation: background ?? undefined };
  const dirtyKeys = draft?.state.dirtyKeys;
  const errors = draft?.state.errors;
  const hasAnyDirty = (dirtyKeys?.size ?? 0) > 0;
  const tabDot = (tab: SettingsTabDef) => {
    if (tab.fields.some((f) => errors?.[f.key])) return 'bg-rose-500';
    if (tab.fields.some((f) => dirtyKeys?.has(f.key))) return 'bg-amber-400';
    return 'bg-transparent';
  };

  function goToTab(tab: SettingsTabDef) {
    navigate(
      { pathname: adminPath('configuracoes'), search: `?${SETTINGS_TAB_PARAM}=${tab.id}` },
      { state: linkState },
    );
  }

  function goToItem(item: AdminNavItem) {
    navigate(adminPath(item.to), { state: linkState });
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    const first = results[0]?.matches[0];
    if (!first) return;
    event.preventDefault();
    if (isSearching && first.children.length > 0) goToTab(first.children[0]);
    else goToItem(first.item);
    onQueryChange('');
  }

  return (
    <aside className="grid max-h-[40vh] w-full shrink-0 grid-cols-1 grid-rows-[auto_auto_1fr] border-b border-border-default bg-bg-s2 px-2.5 pb-2.5 pt-3.5 md:max-h-none md:w-[232px] md:border-b-0 md:border-r">
      <div className="flex items-center gap-2 px-1.5 pb-3 pt-0.5">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[7px] bg-primary/10 text-primary">
          <SidebarIcon name="admin" className="h-[15px] w-[15px]" />
        </span>
        <span className="text-sm font-bold text-tx-primary">Administração</span>
      </div>

      <label className="mx-0.5 mb-2.5 flex h-8 items-center gap-1.5 rounded-lg border border-border-default bg-bg-surface px-2 text-tx-ph transition-colors focus-within:border-primary">
        <Search className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <input
          ref={searchRef}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={onSearchKeyDown}
          placeholder="Buscar no admin"
          aria-label="Buscar no admin"
          className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-tx-primary outline-none placeholder:text-tx-ph"
        />
        <kbd className="rounded border border-border-default px-1 font-body text-[10.5px] font-semibold leading-4 text-tx-muted">
          /
        </kbd>
      </label>

      <nav
        aria-label="Seções da administração"
        className="admin-scroll grid min-h-0 grid-cols-1 content-start gap-3 overflow-y-auto overflow-x-hidden"
      >
        {results.map((group) => (
          <section key={group.title ?? 'inicio'} className="grid grid-cols-1 gap-0.5">
            {group.title ? (
              <h4 className="px-2 pb-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-tx-muted">
                {group.title}
              </h4>
            ) : null}

            {group.matches.map(({ item, children }) => {
              const Icon = item.icon;
              const isCurrent = section === item.to;

              if (!item.children) {
                return (
                  <Link
                    key={item.to}
                    to={adminPath(item.to)}
                    state={linkState}
                    aria-current={isCurrent ? 'page' : undefined}
                    className={cn(itemBase, isCurrent ? stateActive : stateIdle)}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="flex-1 truncate">{item.label}</span>
                  </Link>
                );
              }

              const showChildren = isSearching || settingsExpanded;
              const Chevron = showChildren ? ChevronDown : ChevronRight;

              return (
                <div key={item.to} className="grid grid-cols-1">
                  <button
                    type="button"
                    aria-expanded={showChildren}
                    onClick={() => {
                      if (isCurrent) {
                        setSettingsExpanded((open) => !open);
                      } else {
                        setSettingsExpanded(true);
                        goToItem(item);
                      }
                    }}
                    className={cn(itemBase, isCurrent && !showChildren ? stateActive : stateIdle)}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="flex-1 truncate">{item.label}</span>
                    {!showChildren && hasAnyDirty ? (
                      <span
                        title="Alterações não salvas"
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
                      />
                    ) : null}
                    <Chevron className="h-3.5 w-3.5 shrink-0 text-tx-muted" aria-hidden />
                  </button>

                  {showChildren ? (
                    <div className="mb-1 ml-[15px] mt-px grid grid-cols-1 gap-px border-l border-border-default pl-[9px]">
                      {children.map((tab) => {
                        const isActiveTab = activeTab?.id === tab.id;
                        return (
                          <Link
                            key={tab.id}
                            to={{
                              pathname: adminPath('configuracoes'),
                              search: `?${SETTINGS_TAB_PARAM}=${tab.id}`,
                            }}
                            state={linkState}
                            aria-current={isActiveTab ? 'page' : undefined}
                            className={cn(subitemBase, isActiveTab ? stateActive : stateIdle)}
                          >
                            <span className="flex-1 truncate">{tab.label}</span>
                            <span
                              className={cn('h-1.5 w-1.5 shrink-0 rounded-full', tabDot(tab))}
                            />
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </section>
        ))}

        {results.length === 0 ? (
          <p className="p-2 text-[12.5px] text-tx-muted">Nada encontrado para “{query.trim()}”.</p>
        ) : null}
      </nav>
    </aside>
  );
}
