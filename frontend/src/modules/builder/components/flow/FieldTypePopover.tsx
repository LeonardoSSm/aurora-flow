import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useEscapeKey } from '../../../../hooks/use-escape-key';
import { filterFieldTypeGroups } from '../../lib/field-search';
import { fieldTypeIcon, type FieldTypeChoice } from '../../types';

type FieldTypePopoverProps = {
  /** "add" adiciona um campo; "change" troca o tipo de um campo existente. */
  mode: 'add' | 'change';
  /** Tipo atual do campo, no modo "change" (fica destacado). */
  currentChoice?: FieldTypeChoice;
  erpTableEnabled: boolean;
  onChoose: (choice: FieldTypeChoice) => void;
  onClose: () => void;
};

type Direction = 'up' | 'down' | 'left' | 'right';

/** Próximo botão da grade na direção da seta, pela posição na tela (vale para 4 ou 2 colunas). */
function nextOption(buttons: HTMLElement[], current: HTMLElement, direction: Direction) {
  const index = buttons.indexOf(current);
  if (direction === 'left') return buttons[index - 1] ?? null;
  if (direction === 'right') return buttons[index + 1] ?? null;

  const from = current.getBoundingClientRect();
  const centerX = from.left + from.width / 2;
  const rows = buttons
    .map((button) => ({ button, rect: button.getBoundingClientRect() }))
    .filter(({ rect }) => (direction === 'down' ? rect.top > from.top + 4 : rect.top < from.top - 4));
  if (rows.length === 0) return null;
  const rowTop =
    direction === 'down'
      ? Math.min(...rows.map(({ rect }) => rect.top))
      : Math.max(...rows.map(({ rect }) => rect.top));
  const sameRow = rows.filter(({ rect }) => Math.abs(rect.top - rowTop) < 4);
  sameRow.sort(
    (a, b) =>
      Math.abs(a.rect.left + a.rect.width / 2 - centerX) -
      Math.abs(b.rect.left + b.rect.width / 2 - centerX),
  );
  return sameRow[0]?.button ?? null;
}

const ARROWS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

/**
 * Seletor de tipos de campo: grade por grupo, com busca. Ancorado no contêiner da aba
 * Campos, logo abaixo da barra de ferramentas. Fecha com Esc (antes do modal), clique fora
 * ou no X.
 */
export function FieldTypePopover({
  mode,
  currentChoice,
  erpTableEnabled,
  onChoose,
  onClose,
}: FieldTypePopoverProps) {
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const groups = filterFieldTypeGroups(query, { erpTableEnabled });

  useEscapeKey(onClose);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Element | null;
      if (!target || rootRef.current?.contains(target)) return;
      // Os botões que abrem o seletor cuidam de abrir/fechar (senão fecharia e reabriria).
      if (target.closest('[data-type-picker-trigger]')) return;
      onClose();
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [onClose]);

  function optionButtons(): HTMLElement[] {
    return Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[data-type-option]') ?? []);
  }

  function handleGridKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const direction = ARROWS[event.key];
    const current = event.target as HTMLElement;
    if (!direction || !current.hasAttribute('data-type-option')) return;
    event.preventDefault();
    const buttons = optionButtons();
    const next = nextOption(buttons, current, direction);
    if (next) next.focus();
    else if (direction === 'up') inputRef.current?.focus();
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      optionButtons()[0]?.focus();
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const first = groups[0]?.options[0];
      if (first) onChoose(first.value);
    }
  }

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={mode === 'add' ? 'Adicionar campo' : 'Trocar tipo do campo'}
      className="absolute right-7 top-[58px] z-30 flex max-h-[min(560px,calc(100%-72px))] w-[min(780px,calc(100%-32px))] flex-col rounded-[12px] border border-border-strong bg-bg-surface shadow-[0_24px_48px_rgba(13,29,41,.16)]"
    >
      <div className="flex shrink-0 items-center gap-2.5 border-b border-border-default px-3.5 py-3">
        <Search className="h-4 w-4 shrink-0 text-tx-muted" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="Buscar tipo de campo"
          aria-label="Buscar tipo de campo"
          className="min-w-0 flex-1 bg-transparent text-sm text-tx-primary outline-none placeholder:text-tx-ph"
        />
        <button
          type="button"
          aria-label="Fechar seletor de tipos"
          onClick={onClose}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-[6px] text-tx-secondary hover:bg-bg-hover"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div
        onKeyDown={handleGridKeyDown}
        className="grid min-h-0 flex-1 content-start gap-3.5 overflow-y-auto overflow-x-hidden px-3.5 pb-3.5 pt-1.5"
      >
        {groups.length === 0 ? (
          <p className="py-2 text-[13px] text-tx-secondary">Nenhum tipo encontrado.</p>
        ) : (
          groups.map((group) => (
            <section key={group.group} className="grid gap-1.5" aria-label={group.group}>
              <h3 className="pt-2 text-[11px] font-bold uppercase tracking-[.12em] text-tx-muted">
                {group.group}
              </h3>
              <div className="grid grid-cols-2 gap-1.5 min-[900px]:grid-cols-4">
                {group.options.map((option) => {
                  const Icon = fieldTypeIcon[option.value];
                  const current = option.value === currentChoice;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      data-type-option=""
                      aria-pressed={mode === 'change' ? current : undefined}
                      onClick={() => onChoose(option.value)}
                      className={[
                        'flex h-11 min-w-0 items-center gap-2.5 rounded-[8px] border bg-bg-surface px-2.5 text-left text-[13px] font-semibold leading-tight text-tx-primary outline-none hover:border-primary hover:bg-bg-hover focus-visible:border-primary focus-visible:bg-bg-hover',
                        current ? 'border-primary bg-bg-hover' : 'border-border-default',
                      ].join(' ')}
                    >
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] bg-bg-s3 text-primary dark:text-blue-300">
                        <Icon className="h-[15px] w-[15px]" />
                      </span>
                      <span className="line-clamp-2 min-w-0">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
