import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../../../lib/cn';
import { type AdminLinkState, useAdminBackground } from '../admin-route';

type AdminFeatureCardProps = {
  title: string;
  description: string;
  status: 'ativo' | 'planejado';
  href: string;
  icon: LucideIcon;
};

export function AdminFeatureCard({
  title,
  description,
  status,
  href,
  icon: Icon,
}: AdminFeatureCardProps) {
  const { background } = useAdminBackground();
  const state: AdminLinkState = { backgroundLocation: background ?? undefined };

  return (
    <Link
      to={href}
      state={state}
      className="grid content-start gap-1.5 rounded-xl border border-border-default bg-bg-surface px-4 py-3.5 text-tx-primary transition-colors hover:border-border-strong hover:bg-bg-s2"
    >
      <div className="flex items-center gap-2.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-[15px] w-[15px]" aria-hidden />
        </span>
        <h3 className="flex-1 text-sm font-bold">{title}</h3>
        <span
          className={cn(
            'rounded-full px-[7px] py-0.5 text-[10px] font-bold uppercase tracking-[0.04em]',
            status === 'ativo'
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
              : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
          )}
        >
          {status}
        </span>
      </div>
      <p className="pl-[38px] text-[13px] text-tx-secondary">{description}</p>
    </Link>
  );
}
