import { Braces, Check, X } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { NodeConfigModalVariant } from '../../components/NodeConfigModal';
import { FALLBACK_META, NODE_META, nodeKind } from './node-meta';

/** Estado do autosave do editor, refletido no "Salvo" do modal. */
export interface SaveState {
  isSaving: boolean;
  isDirty: boolean;
}

export function SaveIndicator({ state }: { state?: SaveState }) {
  if (!state) return null;
  if (state.isSaving) return <span className="text-[13px] text-tx-muted">Salvando…</span>;
  // Sujo = ainda não foi para o servidor (o autosave espera 3s e não roda com o fluxo inválido).
  if (state.isDirty) return <span className="text-[13px] text-tx-muted">Não salvo</span>;
  return (
    <span className="flex items-center gap-1.5 text-[13px] text-tx-muted">
      <Check className="h-3.5 w-3.5 text-nc-ok-icon" strokeWidth={2.5} />
      Salvo
    </span>
  );
}

function StatusChip({ issueCount }: { issueCount: number }) {
  if (issueCount === 0) {
    return (
      <span className="flex items-center gap-1 rounded-full bg-nc-ok-bg px-2.5 py-[5px] text-xs font-semibold text-nc-ok">
        <Check className="h-3 w-3" strokeWidth={3} />
        Pronto
      </span>
    );
  }
  return (
    <span className="rounded-full bg-nc-warn-bg px-2.5 py-[5px] text-xs font-semibold text-nc-warn">
      {issueCount === 1 ? '1 pendência' : `${issueCount} pendências`}
    </span>
  );
}

interface Props {
  type: string;
  alias: string;
  onAliasChange: (value: string) => void;
  /** Pendências do nó; sem valor, o chip não aparece. */
  issueCount?: number;
  saveState?: SaveState;
  /** Botão "Variáveis" que abre a coluna direita quando a tela é estreita para ela (< 1100px). */
  asideToggle?: { open: boolean; onToggle: () => void };
  onClose: () => void;
  variant: NodeConfigModalVariant;
}

export function NodeConfigHeader({
  type,
  alias,
  onAliasChange,
  issueCount,
  saveState,
  asideToggle,
  onClose,
  variant,
}: Props) {
  const { label, Icon, color, bg } = NODE_META[type] ?? FALLBACK_META;
  const compact = variant === 'compact';
  // A cor do nó vive só no tile: fundo claro do NODE_META, ou a própria cor a ~18% no escuro.
  const tileStyle = { '--tile-bg': bg, '--tile-bg-dark': `${color}2e` } as CSSProperties;

  return (
    <header
      className={[
        'flex shrink-0 items-center',
        compact ? 'gap-3 px-5 py-4' : 'gap-3.5 border-b border-border-subtle px-6 py-[18px]',
      ].join(' ')}
    >
      <div
        style={tileStyle}
        className={[
          'grid shrink-0 place-items-center bg-[var(--tile-bg)] dark:bg-[var(--tile-bg-dark)]',
          compact ? 'h-9 w-9 rounded-[10px]' : 'h-10 w-10 rounded-[11px]',
        ].join(' ')}
      >
        <Icon className={compact ? 'h-[17px] w-[17px]' : 'h-[19px] w-[19px]'} style={{ color }} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-tx-muted">
          {compact ? nodeKind(type) : `${nodeKind(type)} · ${label}`}
        </p>
        {/* Alias editável no próprio título; vazio, mostra o nome do tipo. */}
        <input
          aria-label="Nome do nó"
          value={alias}
          onChange={(event) => onAliasChange(event.target.value)}
          placeholder={label}
          className={[
            '-ml-1.5 block min-w-[4ch] max-w-full truncate rounded-md border border-transparent bg-transparent px-1.5 py-px font-semibold tracking-[-0.01em] text-tx-primary outline-none [field-sizing:content]',
            'placeholder:text-tx-primary hover:border-border-default focus:border-nc-accent focus:placeholder:text-tx-ph',
            compact ? 'text-base' : 'text-[17px]',
          ].join(' ')}
        />
      </div>

      {!compact && (
        <div className="flex shrink-0 items-center gap-4">
          {issueCount !== undefined && <StatusChip issueCount={issueCount} />}
          <SaveIndicator state={saveState} />
          {asideToggle && (
            <button
              type="button"
              onClick={asideToggle.onToggle}
              aria-expanded={asideToggle.open}
              className={[
                'flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium min-[1100px]:hidden',
                asideToggle.open
                  ? 'border-nc-accent bg-nc-accent-soft text-nc-accent'
                  : 'border-border-default text-tx-secondary hover:bg-bg-s2',
              ].join(' ')}
            >
              <Braces className="h-3.5 w-3.5" />
              Variáveis
            </button>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar"
        className={[
          'grid shrink-0 place-items-center rounded-[10px] text-tx-muted hover:bg-bg-s3',
          compact ? 'h-[34px] w-[34px]' : 'h-9 w-9',
        ].join(' ')}
      >
        <X className="h-[18px] w-[18px]" />
      </button>
    </header>
  );
}
