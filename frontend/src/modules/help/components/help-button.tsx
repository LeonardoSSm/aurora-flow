import { Link, useLocation } from 'react-router-dom';
import { HelpCircle } from 'lucide-react';
import { helpLinkForRoute } from '../help-routes';

/**
 * Ajuda contextual: leva ao artigo da tela atual, não ao índice genérico. Fica na
 * barra superior, presente em todas as telas internas exceto o construtor (que
 * esconde a barra inteira por falta de espaço).
 */
export function HelpButton() {
  const { pathname } = useLocation();
  const to = helpLinkForRoute(pathname);

  return (
    <Link
      to={to}
      title="Ajuda sobre esta tela"
      aria-label="Ajuda sobre esta tela"
      className="flex shrink-0 items-center gap-1.5 rounded-xl bg-surface-container-low px-3 py-2 text-sm font-semibold text-tx-secondary transition-colors hover:bg-surface-container-high hover:text-tx-primary"
    >
      <HelpCircle className="h-4 w-4" />
      <span className="hidden sm:inline">Ajuda</span>
    </Link>
  );
}
