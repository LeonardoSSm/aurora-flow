import { Trash2 } from 'lucide-react';
import type { NodeConfigModalVariant } from '../../components/NodeConfigModal';
import { SaveIndicator, type SaveState } from './NodeConfigHeader';

const primaryBtn =
  'rounded-lg bg-nc-btn px-5 text-sm font-semibold text-white hover:bg-nc-btn-hover';
const secondaryBtn =
  'h-[38px] rounded-lg border border-border-default bg-bg-surface px-4 text-sm font-medium text-tx-primary hover:bg-bg-s2';

interface Props {
  variant: NodeConfigModalVariant;
  onDelete: () => void;
  onClose: () => void;
  /** Etapa anterior; sem valor (1ª etapa), "Voltar" não aparece. */
  onPrev?: () => void;
  /** Próxima etapa; sem valor (última etapa), o botão primário vira "Concluir". */
  onNext?: () => void;
  saveState?: SaveState;
}

/** A edição já vale ao digitar: "Próximo" só navega e "Concluir" só fecha. */
export function NodeConfigFooter({ variant, onDelete, onClose, onPrev, onNext, saveState }: Props) {
  const compact = variant === 'compact';

  return (
    <footer
      className={[
        'flex shrink-0 items-center gap-3 border-t border-border-subtle',
        compact ? 'px-5 py-3' : 'px-6 py-3.5',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={onDelete}
        className={[
          '-ml-3 flex items-center gap-2 rounded-lg px-3 text-sm font-medium text-nc-danger hover:bg-nc-danger-bg',
          compact ? 'h-9' : 'h-[38px]',
        ].join(' ')}
      >
        <Trash2 className="h-[15px] w-[15px]" />
        {compact ? 'Excluir' : 'Excluir nó'}
      </button>

      <div className="ml-auto flex items-center gap-3">
        {compact ? (
          <>
            <SaveIndicator state={saveState} />
            <button type="button" onClick={onClose} className={`h-9 ${primaryBtn}`}>
              Concluir
            </button>
          </>
        ) : (
          <>
            {onPrev && (
              <button type="button" onClick={onPrev} className={secondaryBtn}>
                Voltar
              </button>
            )}
            <button type="button" onClick={onNext ?? onClose} className={`h-[38px] ${primaryBtn}`}>
              {onNext ? 'Próximo' : 'Concluir'}
            </button>
          </>
        )}
      </div>
    </footer>
  );
}
