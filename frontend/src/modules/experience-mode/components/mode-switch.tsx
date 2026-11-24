import { LayoutGrid, MousePointerClick } from 'lucide-react';
import { cn } from '../../../lib/cn';
import type { ExperienceMode } from '../experience-mode-store';

const OPTIONS: Array<{ value: ExperienceMode; label: string; icon: typeof LayoutGrid }> = [
  { value: 'simple', label: 'Simples', icon: MousePointerClick },
  { value: 'advanced', label: 'Avançado', icon: LayoutGrid },
];

/** Chave "Simples | Avançado" para alternar a mesma tela entre os dois modos. */
export function ModeSwitch({
  value,
  onChange,
  className,
}: {
  value: ExperienceMode;
  onChange: (mode: ExperienceMode) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Modo"
      className={cn('inline-flex shrink-0 rounded-lg bg-bg-s3 p-0.5', className)}
    >
      {OPTIONS.map(({ value: option, label, icon: Icon }) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          onClick={() => {
            if (option !== value) onChange(option);
          }}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-bold transition-colors',
            value === option
              ? 'bg-bg-surface text-tx-primary shadow-sm'
              : 'text-tx-secondary hover:text-tx-primary',
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}
