import { Home, LayoutGrid, LogOut } from 'lucide-react';
import { ProductLogo } from '../../../brand/components/product-logo';

type SimpleTopBarProps = {
  /** Fora da tela inicial (ex.: no Criador) aparece o botão "Início". */
  showHome: boolean;
  onGoHome: () => void;
  onSwitchToAdvanced: () => void;
  onLogout: () => void;
};

const buttonClass =
  'inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-bold text-tx-primary transition-colors hover:bg-bg-hover';

/** Barra do modo simplificado: no lugar do menu lateral, só início, troca de modo e sair. */
export function SimpleTopBar({ showHome, onGoHome, onSwitchToAdvanced, onLogout }: SimpleTopBarProps) {
  return (
    <header className="flex h-[53px] shrink-0 items-center gap-2 border-b border-border-default bg-bg-surface px-4">
      <ProductLogo className="text-tx-primary" markClassName="h-7 w-7" wordmarkClassName="hidden sm:inline" />

      <div className="flex-1" />

      {showHome ? (
        <button type="button" onClick={onGoHome} className={buttonClass}>
          <Home className="h-4 w-4" />
          <span className="hidden sm:inline">Início</span>
        </button>
      ) : null}
      <button type="button" onClick={onSwitchToAdvanced} className={buttonClass} title="Ir para o modo avançado">
        <LayoutGrid className="h-4 w-4" />
        <span className="hidden sm:inline">Modo avançado</span>
      </button>
      <button type="button" onClick={onLogout} className={buttonClass} title="Sair">
        <LogOut className="h-4 w-4" />
        <span className="hidden sm:inline">Sair</span>
      </button>
    </header>
  );
}
