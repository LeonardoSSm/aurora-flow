import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../cn';

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cn('rounded-2xl bg-surface-container-lowest p-4 shadow-soft', className)}
      {...props}
    >
      {children}
    </div>
  );
}
