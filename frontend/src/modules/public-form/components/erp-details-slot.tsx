import { createContext, useContext, useEffect, useState } from 'react';

/**
 * Painel ao lado do formulário público onde a ficha de uma "Lista do ERP" é desenhada (via
 * portal) em telas largas. `null` = sem painel (construtor, telas estreitas, outros usos do
 * campo): a ficha fica dentro do próprio campo.
 */
export const ErpDetailsSlotContext = createContext<HTMLElement | null>(null);

/**
 * Largura em que formulário (420 px) + painel cabem lado a lado. Abaixo disso, a ficha fica
 * dentro do campo.
 */
const SIDE_PANEL_QUERY = '(min-width: 1100px)';

/** Sem `matchMedia` (testes, navegador antigo): tela estreita, ficha dentro do campo. */
function matchSidePanel(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(SIDE_PANEL_QUERY)
    : null;
}

function useWideScreen(): boolean {
  const [wide, setWide] = useState(() => matchSidePanel()?.matches ?? false);
  useEffect(() => {
    const media = matchSidePanel();
    if (!media) return;
    const onChange = (event: MediaQueryListEvent) => setWide(event.matches);
    setWide(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return wide;
}

/** O painel lateral, quando há um e a tela comporta. */
export function useErpDetailsSlot(): HTMLElement | null {
  const slot = useContext(ErpDetailsSlotContext);
  const wide = useWideScreen();
  return slot && wide ? slot : null;
}

/**
 * Onde a ficha abre como gaveta (por cima do formulário, pela direita), em vez do painel ao
 * lado. Vale para a etapa que tem uma tabela larga junto da "Lista do ERP": o formulário precisa
 * da largura toda para a tabela, então a ficha só aparece quando pedida. `null` = sem gaveta.
 * O elemento fica dentro da página do formulário para herdar as cores da marca (`--tf-*`).
 */
export const ErpDetailsDrawerContext = createContext<HTMLElement | null>(null);

export function useErpDetailsDrawer(): HTMLElement | null {
  return useContext(ErpDetailsDrawerContext);
}

/** Campos que são tabelas e precisam de largura (a coluna de 420 px os espreme). */
const WIDE_FIELD_TYPES = new Set(['erp_table', 'item_order', 'product_table']);

/**
 * A etapa tem uma "Lista do ERP" e uma tabela larga: o formulário ocupa a largura toda e a
 * ficha da lista vai para a gaveta.
 */
export function isWideErpSection(fields: ReadonlyArray<{ fieldType: string }>): boolean {
  return (
    fields.some((field) => field.fieldType === 'erp_lookup') &&
    fields.some((field) => WIDE_FIELD_TYPES.has(field.fieldType))
  );
}
