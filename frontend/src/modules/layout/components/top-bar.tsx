import { Menu } from 'lucide-react';
import type { FormEvent } from 'react';
import { Button, TextInput } from '../../../components/ui';
import { HelpButton } from '../../help/components/help-button';
import { NotificationBell } from '../../notifications/components/notification-bell';
import { sidebarTheme } from './sidebar/sidebar-theme';

type TopBarProps = {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClearSearch: () => void;
  onOpenMenu: () => void;
  isMenuOpen: boolean;
};

export function TopBar({
  searchTerm,
  onSearchChange,
  onSearchSubmit,
  onClearSearch,
  onOpenMenu,
  isMenuOpen,
}: TopBarProps) {
  return (
    <header
      className="sticky top-0 z-10 flex flex-col gap-3 border-b bg-bg-surface border-border-default px-4 py-3 md:px-6"
    >
      <div className="flex w-full min-w-0 items-center gap-3">
        <button
          type="button"
          aria-label="Abrir menu"
          aria-expanded={isMenuOpen}
          onClick={onOpenMenu}
          className={sidebarTheme.menuToggle}
        >
          <Menu className="h-5 w-5" />
        </button>

        <form className="flex w-full min-w-0 max-w-2xl items-center gap-2" onSubmit={onSearchSubmit}>
          <TextInput
            className="md:max-w-xl bg-bg-input border-border-default text-tx-primary placeholder:text-tx-ph"
            placeholder="Pesquisar processos, respostas ou métricas..."
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
          />
          <Button type="submit" size="sm">
            Buscar
          </Button>
          {searchTerm ? (
            <Button type="button" size="sm" variant="subtle" onClick={onClearSearch}>
              Limpar
            </Button>
          ) : null}
        </form>

        <div className="ml-auto flex items-center gap-2">
          <NotificationBell />
          <HelpButton />
        </div>
      </div>
    </header>
  );
}
