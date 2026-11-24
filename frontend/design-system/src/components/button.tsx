import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../cn';

type ButtonVariant = 'primary' | 'ghost' | 'subtle';
type ButtonSize = 'sm' | 'md';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  children: ReactNode;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-primary to-primary-container text-white shadow-soft hover:opacity-90',
  // No escuro o azul da marca some sobre a superfície: usa o mesmo azul claro dos destaques do app (#93c5fd).
  ghost:
    'bg-surface-container-lowest text-primary hover:bg-surface-container-high dark:text-blue-300',
  subtle: 'bg-surface-container-low text-tx-primary hover:bg-surface-container-high',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'rounded-lg px-3 py-2 text-sm',
  md: 'rounded-xl px-4 py-3 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'font-bold transition-all disabled:cursor-not-allowed disabled:opacity-60',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
