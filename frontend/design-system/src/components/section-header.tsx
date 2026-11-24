import type { ReactNode } from 'react';
import { cn } from '../cn';

type SectionHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function SectionHeader({ title, description, action, className }: SectionHeaderProps) {
  return (
    <header
      className={cn('flex flex-col gap-3 md:flex-row md:items-end md:justify-between', className)}
    >
      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">{title}</h1>
        {description ? <p className="text-tx-muted">{description}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </header>
  );
}
