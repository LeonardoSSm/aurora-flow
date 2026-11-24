import { Check, ChevronDown, GitBranch, Info as InfoIcon, Plus, X } from 'lucide-react';
import {
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';

// Componentes de campo do modal de configuração de nó (handoff "Componentes de campo").
// Cores pelos tokens --nc-* / bg-* / tx-*: funcionam no claro e no escuro sem `dark:`.

/** Input/select de 38px. Dentro de um <Field> com erro, a borda fica vermelha. */
export const inputCls =
  'h-[38px] w-full rounded-lg border border-border-default bg-nc-input px-3 text-sm text-tx-primary outline-none placeholder:text-tx-ph focus:border-nc-accent focus:shadow-nc-ring disabled:cursor-not-allowed disabled:opacity-45 group-data-[invalid]/field:border-nc-danger';

export const textareaCls =
  'w-full resize-none rounded-lg border border-border-default bg-nc-input px-3 py-2.5 text-sm leading-[1.5] text-tx-primary outline-none placeholder:text-tx-ph focus:border-nc-accent focus:shadow-nc-ring disabled:opacity-45 group-data-[invalid]/field:border-nc-danger';

/** URLs, JSON, cron, dot-paths e chaves. */
export const monoCls = 'font-mono text-[13px]';

// ── Field ──────────────────────────────────────────────────────────────

export function Field({
  label,
  hint,
  error,
  counter,
  half = false,
  errorRole,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  /** Texto à direita do label, ex. "123/4000". */
  counter?: string;
  /** Meia largura dentro de um <FieldGrid>. */
  half?: boolean;
  /** "alert" anuncia o erro a leitores de tela (o formulário de notificação usa assim). */
  errorRole?: 'alert';
  children: ReactNode;
}) {
  return (
    <div
      data-invalid={error ? '' : undefined}
      className={`group/field grid min-w-0 content-start gap-1.5 ${half ? 'col-span-1' : 'col-span-full'}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium text-tx-secondary">{label}</span>
        {counter && <span className="text-xs text-tx-ph">{counter}</span>}
      </div>
      {children}
      {hint && <p className="text-xs leading-[1.45] text-tx-muted [text-wrap:pretty]">{hint}</p>}
      {error && (
        <p role={errorRole} className="text-xs font-semibold text-nc-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Grade de duas colunas das etapas: campo padrão ocupa as duas; `half` ocupa uma. */
export function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-[18px]">{children}</div>;
}

// ── Select / Input ─────────────────────────────────────────────────────

export function Select({
  isPlaceholder = false,
  className = '',
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  /** Valor vazio de um campo obrigatório: o texto fica na cor de placeholder. */
  isPlaceholder?: boolean;
}) {
  return (
    <div className="relative min-w-0">
      <select
        {...props}
        className={[
          inputCls,
          'cursor-pointer appearance-none pr-[34px] [&>option]:text-tx-primary',
          isPlaceholder ? 'text-tx-ph' : '',
          className,
        ].join(' ')}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tx-muted"
      />
    </div>
  );
}

export function Input({
  suffix,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { suffix?: string }) {
  if (!suffix) return <input {...props} className={`${inputCls} ${className}`} />;
  return (
    <div className="flex h-[38px] min-w-0 overflow-hidden rounded-lg border border-border-default bg-nc-input focus-within:border-nc-accent focus-within:shadow-nc-ring group-data-[invalid]/field:border-nc-danger">
      <input
        {...props}
        className={`min-w-0 flex-1 bg-transparent px-3 text-sm text-tx-primary outline-none placeholder:text-tx-ph ${className}`}
      />
      <span className="grid place-items-center border-l border-border-subtle bg-bg-s2 px-3 text-[13px] text-tx-muted">
        {suffix}
      </span>
    </div>
  );
}

// ── Segmentado ─────────────────────────────────────────────────────────

/** Substitui selects de até 4 opções curtas (modo, método HTTP, resultado…). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  mono = false,
  fullWidth = false,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  mono?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={[
        'gap-0.5 rounded-[9px] bg-nc-seg-track p-[3px]',
        fullWidth ? 'flex w-full' : 'inline-flex max-w-full self-start justify-self-start',
      ].join(' ')}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={[
              'h-[30px] rounded-[7px] px-[13px] text-[13px] transition-colors',
              fullWidth ? 'flex-1' : '',
              mono ? 'font-mono' : '',
              active
                ? 'bg-nc-seg-active font-semibold text-tx-primary shadow-[0_1px_2px_rgba(13,29,41,.12)]'
                : 'font-medium text-tx-secondary hover:text-tx-primary',
            ].join(' ')}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Cartões de escolha ─────────────────────────────────────────────────

export function ChoiceCards<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  columns = 2,
}: {
  options: ReadonlyArray<{ value: T; title: string; description: string }>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  columns?: 2 | 3;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`col-span-full grid gap-2 ${columns === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={[
              'flex items-start gap-2.5 rounded-[10px] border-[1.5px] p-3.5 text-left transition-colors',
              active
                ? 'border-nc-accent bg-nc-accent-soft'
                : 'border-border-default hover:border-border-strong',
            ].join(' ')}
          >
            <span
              aria-hidden
              className={[
                'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-[1.5px]',
                active ? 'border-nc-accent' : 'border-border-strong',
              ].join(' ')}
            >
              {active && <span className="h-2 w-2 rounded-full bg-nc-accent" />}
            </span>
            <span className="grid gap-1">
              <span className="text-sm font-semibold text-tx-primary">{option.title}</span>
              <span className="text-xs leading-[1.45] text-tx-muted">{option.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Lista de checagem ──────────────────────────────────────────────────

export function CheckList({
  items,
  selected,
  onToggle,
  emptyText,
  maxHeight,
}: {
  items: ReadonlyArray<{ id: string; title: string; subtitle?: string }>;
  selected: readonly string[];
  onToggle: (id: string) => void;
  emptyText?: string;
  /** Altura máxima em px; a lista rola dentro dela. */
  maxHeight?: number;
}) {
  return (
    <div
      className="admin-scroll col-span-full overflow-y-auto rounded-[10px] border border-border-default"
      style={maxHeight ? { maxHeight } : undefined}
    >
      {items.length === 0 && emptyText ? (
        <p className="px-3 py-2.5 text-[13px] text-tx-muted">{emptyText}</p>
      ) : (
        items.map((item) => {
          const checked = selected.includes(item.id);
          return (
            <label
              key={item.id}
              className="flex cursor-pointer items-center gap-3 border-b border-border-subtle px-3 py-2.5 last:border-0 hover:bg-bg-s2"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(item.id)}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className={[
                  'grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border-[1.5px] peer-focus-visible:shadow-nc-ring',
                  checked ? 'border-nc-btn bg-nc-btn' : 'border-border-strong bg-nc-input',
                ].join(' ')}
              >
                {checked && <Check className="h-[11px] w-[11px] text-white" strokeWidth={3} />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-tx-primary">
                  {item.title}
                </span>
                {item.subtitle && (
                  <span className="block truncate text-xs text-tx-muted">{item.subtitle}</span>
                )}
              </span>
            </label>
          );
        })
      )}
    </div>
  );
}

// ── Toggle ─────────────────────────────────────────────────────────────

/** Linha inteira clicável (role="switch"): título, descrição opcional e a chave à direita. */
export function Toggle({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description?: ReactNode;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const descriptionId = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={title}
      aria-describedby={description ? descriptionId : undefined}
      onClick={() => onChange(!checked)}
      className="col-span-full flex w-full items-start gap-3 rounded-lg text-left outline-none focus-visible:shadow-nc-ring"
    >
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="text-sm font-medium text-tx-primary">{title}</span>
        {description && (
          <span id={descriptionId} className="text-xs leading-[1.45] text-tx-muted">
            {description}
          </span>
        )}
      </span>
      <span
        aria-hidden
        className={[
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors duration-150',
          checked ? 'bg-nc-btn' : 'bg-border-strong',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,.2)] transition-[left] duration-150',
            checked ? 'left-[18px]' : 'left-0.5',
          ].join(' ')}
        />
      </span>
    </button>
  );
}

// ── Pares chave/valor ──────────────────────────────────────────────────

export type KvPair = { key: string; value: string };

export function KeyValue({
  pairs,
  onChange,
  addLabel = 'Adicionar cabeçalho',
}: {
  pairs: KvPair[];
  onChange: (pairs: KvPair[]) => void;
  addLabel?: string;
}) {
  const kvInputCls = `${inputCls} h-9 ${monoCls}`;
  return (
    <div className="col-span-full grid gap-2">
      {pairs.map((pair, i) => (
        <div key={i} className="grid grid-cols-[1fr_1.4fr_36px] gap-2">
          <input
            className={kvInputCls}
            value={pair.key}
            onChange={(e) =>
              onChange(pairs.map((p, j) => (j === i ? { ...p, key: e.target.value } : p)))
            }
            placeholder="Chave"
            aria-label={`Chave ${i + 1}`}
          />
          <input
            className={kvInputCls}
            value={pair.value}
            onChange={(e) =>
              onChange(pairs.map((p, j) => (j === i ? { ...p, value: e.target.value } : p)))
            }
            placeholder="Valor"
            aria-label={`Valor ${i + 1}`}
          />
          <button
            type="button"
            onClick={() => onChange(pairs.filter((_, j) => j !== i))}
            aria-label={`Remover ${i + 1}`}
            className="grid h-9 w-9 place-items-center rounded-lg text-tx-muted hover:bg-nc-danger-bg hover:text-nc-danger"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...pairs, { key: '', value: '' }])}
        className="-ml-2 flex h-8 items-center gap-1.5 self-start justify-self-start rounded-lg px-2 text-[13px] font-semibold text-nc-accent hover:bg-nc-accent-soft"
      >
        <Plus className="h-3.5 w-3.5" />
        {addLabel}
      </button>
    </div>
  );
}

// ── Info ───────────────────────────────────────────────────────────────

/** Aviso que não é a descrição da etapa (limites, avisos de configuração). Sem borda. */
export function Info({ text, children }: { text?: string; children?: ReactNode }) {
  return (
    <div className="col-span-full flex gap-2.5 rounded-[10px] bg-nc-info-bg px-3.5 py-3">
      <InfoIcon className="mt-px h-4 w-4 shrink-0 text-nc-info" />
      <div className="min-w-0 text-[13px] leading-[1.5] text-nc-info [&_p]:text-nc-info">
        {text ? <p>{text}</p> : children}
      </div>
    </div>
  );
}

// ── Etapas de um formulário ────────────────────────────────────────────

/**
 * Corpo de um formulário com etapas: no modal (`section` definido) mostra só a etapa aberta —
 * a descrição dela vem do cabeçalho da etapa; avulso (testes, nós sem etapas) mostra todas em
 * sequência, com `intro` no topo como antes.
 */
export function FormSections({
  section,
  intro,
  parts,
}: {
  section?: string;
  intro?: string;
  parts: Record<string, ReactNode>;
}) {
  if (section) return <FieldGrid>{parts[section]}</FieldGrid>;
  return (
    <div className="grid gap-[18px]">
      {intro && <Info text={intro} />}
      {Object.entries(parts).map(([id, part]) => (
        <FieldGrid key={id}>{part}</FieldGrid>
      ))}
    </div>
  );
}

// ── Frase-resumo ───────────────────────────────────────────────────────

/** A regra montada em português (Condição de campo). */
export function SummaryPhrase({ children }: { children: ReactNode }) {
  return (
    <div className="col-span-full flex items-center gap-2.5 rounded-[10px] border border-dashed border-border-strong bg-bg-s2 px-3.5 py-3 text-sm text-tx-primary">
      <GitBranch className="h-4 w-4 shrink-0 text-[#D97706]" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

// ── Chips de variável ──────────────────────────────────────────────────

export type ChipVariable = { name: string; label: string; field?: boolean };

/** Chips `{{nome}}` que inserem a variável; os de campo do formulário em verde. */
export function VariableChips({
  variables,
  onPick,
  title,
}: {
  variables: readonly ChipVariable[];
  onPick: (name: string) => void;
  title?: string;
}) {
  return (
    <div className="col-span-full grid gap-2">
      {title && <span className="text-xs font-semibold text-tx-muted">{title}</span>}
      <div className="flex flex-wrap gap-1.5">
        {variables.map((variable) => (
          <button
            key={variable.name}
            type="button"
            title={variable.label}
            onClick={() => onPick(variable.name)}
            className={[
              'h-[26px] rounded-md px-[9px] font-mono text-xs transition-colors',
              variable.field
                ? 'bg-nc-field-var-bg text-nc-field-var hover:brightness-95'
                : 'bg-nc-accent-soft text-nc-accent hover:brightness-95',
            ].join(' ')}
          >
            {`{{${variable.name}}}`}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Insere um texto na posição do cursor do campo (ou no fim, se ele não teve foco). */
export function useInsertAtCursor<T extends HTMLInputElement | HTMLTextAreaElement>(
  value: string,
  onChange: (next: string) => void,
) {
  const ref = useRef<T>(null);
  function insert(token: string) {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }
  return { ref, insert };
}

/**
 * Campo vazio com sugestão (a mesma do placeholder): Tab preenche com ela e, enquanto o campo
 * estiver focado e vazio, um botão flutuante avisa — e também preenche se clicado. Com texto, o
 * Tab volta a só trocar de campo. O campo vai dentro de um contêiner `relative`, junto do `button`.
 */
export function useTabSuggestion(
  value: string,
  suggestion: string | undefined,
  onAccept: (next: string) => void,
  /** Textarea: o botão fica no canto de baixo; input: centrado na altura. */
  multiline = false,
) {
  const [focused, setFocused] = useState(false);
  const available = Boolean(suggestion) && value === '';

  const fieldProps = {
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    onKeyDown: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key === 'Tab' && !event.shiftKey && available && suggestion) {
        event.preventDefault();
        onAccept(suggestion);
      }
    },
  };

  const button =
    focused && available && suggestion ? (
      <button
        type="button"
        // Sem isso o campo perde o foco no clique e o botão some antes de receber o click.
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onAccept(suggestion)}
        title={suggestion}
        className={`absolute right-1.5 z-10 inline-flex ${multiline ? 'bottom-1.5' : 'top-1/2 -translate-y-1/2'} items-center gap-1.5 rounded-md bg-nc-accent-soft px-2 py-1 text-[11px] font-semibold text-nc-accent shadow-sm transition-opacity hover:opacity-80`}
      >
        <kbd className="rounded border border-current bg-bg-surface px-1 font-sans text-[10px] font-bold leading-[14px]">
          Tab
        </kbd>
        usar sugestão
      </button>
    ) : null;

  return { fieldProps, button };
}

// ── Prévia de endpoint (Operação ERP) ──────────────────────────────────

export function EndpointPreview({
  connector,
  method,
  path,
}: {
  connector?: string;
  method: string;
  path: string;
}) {
  return (
    <div className="col-span-full grid gap-1.5 rounded-[10px] bg-bg-s2 px-3.5 py-3">
      {connector && <span className="text-xs text-tx-muted">{connector}</span>}
      <span className="flex min-w-0 items-center gap-2">
        <span
          className={[
            'rounded px-1.5 py-0.5 text-[11px] font-bold',
            method === 'GET'
              ? 'bg-nc-field-var-bg text-nc-ok-icon'
              : 'bg-nc-accent-soft text-nc-accent',
          ].join(' ')}
        >
          {method}
        </span>
        <span className="truncate font-mono text-[13px] text-tx-primary">{path}</span>
      </span>
    </div>
  );
}
