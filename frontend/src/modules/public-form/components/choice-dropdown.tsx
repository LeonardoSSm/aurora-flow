import { Check, ChevronDown, Search, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type ChoiceDropdownOption = { id: string; internalValue: string; displayLabel: string };

type ChoiceDropdownProps = {
  options: ChoiceDropdownOption[];
  /** Escolha única: o valor escolhido. Várias: a lista de valores. */
  value: string | string[] | null;
  multiple?: boolean;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  onChange: (next: string | string[] | null) => void;
};

/** Com poucas opções a busca só atrapalha. */
const SEARCH_FROM = 8;

/** Destaque translúcido: legível no formulário claro e nas telas escuras. */
const HIGHLIGHT = 'color-mix(in srgb, var(--tf-primary) 14%, transparent)';

/** Cores do formulário que a lista leva para o portal (fora da árvore que as define). */
const THEME_VARS = [
  '--tf-surface',
  '--tf-border',
  '--tf-text',
  '--tf-text-muted',
  '--tf-primary',
  '--tf-background',
];

type Placement = {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
  vars: Record<string, string>;
};

/**
 * Onde abrir a lista: fixa na tela, colada no campo — abaixo, ou acima quando falta espaço. Fica
 * num portal para não ser cortada por quem rola (ex.: a tabela dinâmica do ERP, o modal da fase).
 */
function placeBelowOrAbove(trigger: HTMLElement): Placement {
  const rect = trigger.getBoundingClientRect();
  const styles = getComputedStyle(trigger);
  const vars = Object.fromEntries(
    THEME_VARS.map((name) => [name, styles.getPropertyValue(name).trim()]).filter(
      ([, value]) => value,
    ),
  );
  const below = window.innerHeight - rect.bottom - 8;
  const above = rect.top - 8;
  const base = { left: rect.left, width: Math.max(rect.width, 220), vars };
  return below >= 220 || below >= above
    ? { ...base, top: rect.bottom + 4, maxHeight: Math.max(160, Math.min(320, below)) }
    : {
        ...base,
        bottom: window.innerHeight - rect.top + 4,
        maxHeight: Math.max(160, Math.min(320, above)),
      };
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * "Lista suspensa": a mesma escolha única/múltipla, mas fechada num campo compacto, com busca
 * quando a lista é longa. Usa as cores --tf-* do formulário (público, pré-visualização e fases).
 */
export function ChoiceDropdown({
  options,
  value,
  multiple = false,
  placeholder = 'Selecione…',
  disabled = false,
  invalid = false,
  onChange,
}: ChoiceDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = useMemo(
    () => (Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : []),
    [value],
  );
  const term = normalize(search.trim());
  const filtered = useMemo(
    () =>
      term ? options.filter((option) => normalize(option.displayLabel).includes(term)) : options,
    [options, term],
  );
  const showSearch = options.length >= SEARCH_FROM;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target))
        setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      return;
    }
    const firstSelected = options.findIndex((option) => selected.includes(option.internalValue));
    setActive(firstSelected >= 0 ? firstSelected : 0);
    if (showSearch) searchRef.current?.focus();
    // Só ao abrir: depois quem manda é o teclado.
  }, [open]);

  // Acompanha o campo quando a página (ou o modal) rola ou a janela muda de tamanho.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setPlacement(null);
      return;
    }
    const update = () => triggerRef.current && setPlacement(placeBelowOrAbove(triggerRef.current));
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  function choose(optionValue: string) {
    if (multiple) {
      onChange(
        selected.includes(optionValue)
          ? selected.filter((item) => item !== optionValue)
          : [...selected, optionValue],
      );
      return;
    }
    onChange(optionValue);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => Math.min(current + 1, filtered.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = filtered[active];
      if (option) choose(option.internalValue);
    }
  }

  const labelOf = (optionValue: string) =>
    options.find((option) => option.internalValue === optionValue)?.displayLabel ?? optionValue;

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      <div
        ref={triggerRef}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setOpen((current) => !current)}
        className="flex w-full items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-[color:var(--tf-primary)]/30"
        style={{
          boxSizing: 'border-box',
          minHeight: 36,
          padding: '4px 8px 4px 12px',
          borderRadius: 8,
          border: `1px solid ${invalid ? 'var(--tf-danger)' : open ? 'var(--tf-primary)' : 'var(--tf-border)'}`,
          background: 'var(--tf-background)',
          color: 'var(--tf-text)',
          fontSize: 13,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {selected.length === 0 ? (
            <span style={{ color: 'var(--tf-text-muted)' }}>{placeholder}</span>
          ) : multiple ? (
            selected.map((item) => (
              <span
                key={item}
                className="inline-flex max-w-full items-center gap-1 rounded-md"
                style={{
                  padding: '2px 4px 2px 8px',
                  background: HIGHLIGHT,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                <span className="truncate">{labelOf(item)}</span>
                {!disabled ? (
                  <button
                    type="button"
                    aria-label={`Remover ${labelOf(item)}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onChange(selected.filter((other) => other !== item));
                    }}
                    className="grid h-4 w-4 place-items-center rounded"
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </span>
            ))
          ) : (
            <span className="truncate font-medium">{labelOf(selected[0])}</span>
          )}
        </div>
        {selected.length > 0 && !disabled ? (
          <button
            type="button"
            aria-label="Limpar"
            onClick={(event) => {
              event.stopPropagation();
              onChange(multiple ? [] : null);
            }}
            className="grid h-6 w-6 shrink-0 place-items-center rounded"
            style={{ color: 'var(--tf-text-muted)' }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <ChevronDown
          className="h-4 w-4 shrink-0 transition-transform"
          style={{ color: 'var(--tf-text-muted)', transform: open ? 'rotate(180deg)' : undefined }}
        />
      </div>

      {open && placement
        ? createPortal(
            <div
              ref={popoverRef}
              className="fixed z-[200] flex flex-col overflow-hidden"
              style={{
                ...placement.vars,
                left: placement.left,
                width: placement.width,
                top: placement.top,
                bottom: placement.bottom,
                maxHeight: placement.maxHeight,
                borderRadius: 10,
                border: '1px solid var(--tf-border)',
                background: 'var(--tf-surface)',
                boxShadow: '0 12px 28px rgba(15, 23, 42, 0.22)',
              }}
            >
              {showSearch ? (
                <div
                  className="flex items-center gap-2"
                  style={{ padding: '8px 10px', borderBottom: '1px solid var(--tf-border)' }}
                >
                  <Search className="h-4 w-4 shrink-0" style={{ color: 'var(--tf-text-muted)' }} />
                  <input
                    ref={searchRef}
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setActive(0);
                    }}
                    placeholder="Buscar…"
                    aria-label="Buscar opção"
                    className="w-full bg-transparent focus:outline-none"
                    style={{ fontSize: 13, color: 'var(--tf-text)' }}
                  />
                </div>
              ) : null}
              <ul
                ref={listRef}
                role="listbox"
                aria-multiselectable={multiple}
                className="min-h-0 flex-1 overflow-y-auto py-1"
              >
                {filtered.length === 0 ? (
                  <li style={{ padding: '10px 12px', fontSize: 13, color: 'var(--tf-text-muted)' }}>
                    Nenhuma opção encontrada.
                  </li>
                ) : (
                  filtered.map((option, index) => {
                    const isSelected = selected.includes(option.internalValue);
                    return (
                      <li
                        key={option.id}
                        data-index={index}
                        role="option"
                        aria-selected={isSelected}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => choose(option.internalValue)}
                        className="flex cursor-pointer items-center gap-2"
                        style={{
                          padding: '8px 12px',
                          fontSize: 13,
                          color: 'var(--tf-text)',
                          fontWeight: isSelected ? 700 : 500,
                          background: index === active ? HIGHLIGHT : 'transparent',
                        }}
                      >
                        <span className="min-w-0 flex-1 truncate">{option.displayLabel}</span>
                        {isSelected ? (
                          <Check
                            className="h-4 w-4 shrink-0"
                            style={{ color: 'var(--tf-primary)' }}
                          />
                        ) : null}
                      </li>
                    );
                  })
                )}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
