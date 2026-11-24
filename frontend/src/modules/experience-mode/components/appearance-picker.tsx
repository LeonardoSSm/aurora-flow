import { Check, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '../../../lib/cn';
import type { FormAppearance } from '../../forms/types';
import {
  DEFAULT_PROCESS_COLOR,
  DEFAULT_PROCESS_ICON,
  PROCESS_COLORS,
  PROCESS_ICONS,
  resolveAppearance,
} from '../lib/process-appearance';

type AppearancePickerProps = {
  processName: string;
  value: FormAppearance | null | undefined;
  saving: boolean;
  onSave: (next: FormAppearance) => void;
  onClose: () => void;
};

/** Janela para escolher a cor e o ícone do card de um processo. */
export function AppearancePicker({ processName, value, saving, onSave, onClose }: AppearancePickerProps) {
  const [color, setColor] = useState(value?.color ?? DEFAULT_PROCESS_COLOR);
  const [icon, setIcon] = useState(value?.icon ?? DEFAULT_PROCESS_ICON);
  const { Icon } = resolveAppearance({ color, icon });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Cor e ícone de ${processName}`}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-bg-surface p-6 shadow-soft"
      >
        <div className="flex items-start gap-4">
          <span
            className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-white"
            style={{ backgroundColor: color }}
          >
            <Icon className="h-7 w-7" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-tx-primary">Cor e ícone</h2>
            <p className="truncate text-sm text-tx-secondary">{processName}</p>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-tx-secondary hover:bg-bg-hover"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <h3 className="mb-3 mt-6 text-base font-bold text-tx-primary">Cor</h3>
        <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Cor">
          {PROCESS_COLORS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={color === option.value}
              aria-label={option.label}
              title={option.label}
              onClick={() => setColor(option.value)}
              className={cn(
                'grid h-11 w-11 place-items-center rounded-full text-white transition-transform hover:scale-110',
                color === option.value ? 'ring-4 ring-offset-2 ring-offset-bg-surface' : '',
              )}
              style={{ backgroundColor: option.value, ['--tw-ring-color' as string]: option.value }}
            >
              {color === option.value ? <Check className="h-5 w-5" /> : null}
            </button>
          ))}
        </div>

        <h3 className="mb-3 mt-6 text-base font-bold text-tx-primary">Ícone</h3>
        <div className="grid grid-cols-6 gap-2" role="radiogroup" aria-label="Ícone">
          {Object.entries(PROCESS_ICONS).map(([key, option]) => {
            const OptionIcon = option.icon;
            const selected = icon === key;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={option.label}
                title={option.label}
                onClick={() => setIcon(key)}
                className={cn(
                  'grid aspect-square place-items-center rounded-xl border-2 transition-colors',
                  selected ? 'text-white' : 'border-border-default text-tx-secondary hover:bg-bg-hover',
                )}
                style={selected ? { backgroundColor: color, borderColor: color } : undefined}
              >
                <OptionIcon className="h-6 w-6" />
              </button>
            );
          })}
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-12 rounded-xl px-5 text-base font-bold text-tx-primary hover:bg-bg-hover"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => onSave({ color, icon })}
            className="h-12 rounded-xl bg-primary px-6 text-base font-bold text-white hover:opacity-90 disabled:opacity-60"
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
