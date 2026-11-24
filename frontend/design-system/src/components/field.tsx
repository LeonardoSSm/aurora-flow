import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';
import { cn } from '../cn';

type FieldLabelProps = LabelHTMLAttributes<HTMLLabelElement> & {
  children: ReactNode;
};

type TextInputProps = InputHTMLAttributes<HTMLInputElement>;
type SelectInputProps = SelectHTMLAttributes<HTMLSelectElement>;

export function FieldLabel({ className, children, ...props }: FieldLabelProps) {
  return (
    <label
      className={cn('grid gap-2 text-sm font-semibold text-tx-secondary', className)}
      {...props}
    >
      {children}
    </label>
  );
}

export function TextInput({ className, ...props }: TextInputProps) {
  return (
    <input
      className={cn(
        'w-full rounded-xl border border-border-default/50 bg-surface-container-low px-3 py-2 text-sm text-tx-primary outline-none ring-primary/30 placeholder:text-tx-secondary focus:ring-2 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-400',
        className,
      )}
      {...props}
    />
  );
}

export function SelectInput({ className, children, ...props }: SelectInputProps) {
  return (
    <select
      className={cn(
        'w-full rounded-xl border border-border-default/60 bg-surface-container-low px-3 py-2 text-sm text-tx-primary outline-none ring-primary/30 focus:ring-2 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
