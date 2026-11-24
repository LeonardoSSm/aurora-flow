import { CircleHelp, ClipboardList, Home, Link2, ListChecks, Zap } from 'lucide-react';
import { cn } from '../../../../lib/cn';

export type SidebarIconName =
  | 'home'
  | 'dashboard'
  | 'panels'
  | 'forms'
  | 'itemLists'
  | 'builder'
  | 'flows'
  | 'responses'
  | 'solicitations'
  | 'kanban'
  | 'approvals'
  | 'integrations'
  | 'admin'
  | 'help'
  | 'plus'
  | 'logout';

/**
 * Conjunto de icones da navegacao. Usado pela sidebar e pelo grid de modulos da
 * home — por isso vive fora do componente da barra.
 */
export function SidebarIcon({ name, className }: { name: SidebarIconName; className?: string }) {
  const commonProps = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    className: cn('h-5 w-5', className),
    'aria-hidden': true,
  };

  if (name === 'home') {
    return <Home className={cn('h-5 w-5', className)} aria-hidden />;
  }

  if (name === 'dashboard') {
    return (
      <svg {...commonProps}>
        <rect x="3" y="3" width="8" height="8" rx="1.5" />
        <rect x="13" y="3" width="8" height="5" rx="1.5" />
        <rect x="13" y="10" width="8" height="11" rx="1.5" />
        <rect x="3" y="13" width="8" height="8" rx="1.5" />
      </svg>
    );
  }

  // Painéis montados à mão: um gráfico dentro de uma moldura, para não se
  // confundir com o Dashboard fixo logo acima na barra.
  if (name === 'panels') {
    return (
      <svg {...commonProps}>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M7 15v-3M11.5 15V9M16 15v-5" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === 'forms') {
    return (
      <svg {...commonProps}>
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </svg>
    );
  }

  if (name === 'itemLists') {
    return <ListChecks className={cn('h-5 w-5', className)} aria-hidden />;
  }

  if (name === 'builder') {
    return (
      <svg {...commonProps}>
        <path d="M4 7h16M4 12h11M4 17h7" />
        <path d="M18 12l2 2-5 5h-2v-2l5-5z" />
      </svg>
    );
  }

  if (name === 'flows') {
    return <Zap className={cn('h-5 w-5', className)} aria-hidden />;
  }

  if (name === 'responses') {
    return (
      <svg {...commonProps}>
        <path d="M4 5h16v10H8l-4 4V5z" />
        <path d="M8 9h8M8 12h5" />
      </svg>
    );
  }

  if (name === 'solicitations') {
    return <ClipboardList className={cn('h-5 w-5', className)} aria-hidden />;
  }

  if (name === 'kanban') {
    return (
      <svg {...commonProps}>
        <rect x="3" y="3" width="5" height="14" rx="1.5" />
        <rect x="9.5" y="3" width="5" height="9" rx="1.5" />
        <rect x="16" y="3" width="5" height="18" rx="1.5" />
      </svg>
    );
  }

  if (name === 'approvals') {
    return (
      <svg {...commonProps}>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    );
  }

  if (name === 'integrations') {
    return <Link2 className={cn('h-5 w-5', className)} aria-hidden />;
  }

  if (name === 'help') {
    return <CircleHelp className={cn('h-5 w-5', className)} aria-hidden />;
  }

  if (name === 'admin') {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="8" r="3.25" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </svg>
    );
  }

  if (name === 'plus') {
    return (
      <svg {...commonProps}>
        <path d="M12 5v14M5 12h14" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="M15 8l5 4-5 4" />
      <path d="M20 12H9" />
      <path d="M9 5v14" />
    </svg>
  );
}
