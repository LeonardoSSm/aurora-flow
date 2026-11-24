import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../app/auth-context';
import { useViewportFill } from '../../../hooks/use-viewport-fill';
import { cn } from '../../../lib/cn';
import { PhaseFieldsModal } from '../../kanban-phases/components/phase-fields-modal';
import { ForMeList } from '../components/for-me-list';
import { ProcessGrid } from '../components/process-grid';
import { useDashboardPanelQuery } from '../hooks/use-dashboard-panel-query';
import type { PanelItem } from '../types';

function greeting(fullName: string | undefined): string {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const firstName = fullName?.trim().split(/\s+/)[0];
  return firstName ? `${part}, ${firstName}` : part;
}

export function DashboardView() {
  const { user } = useAuth();
  const { data, isLoading, isError, isFetching, refetch } = useDashboardPanelQuery();
  const [openItem, setOpenItem] = useState<PanelItem | null>(null);
  // No desktop o painel ocupa o que sobra da janela, sem rolar.
  const { ref, height } = useViewportFill();

  const failedFlows = data?.alerts.failedFlowsToday ?? 0;
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <section
      ref={ref}
      style={height ? { height } : undefined}
      className="flex flex-col gap-4 md:overflow-hidden"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-tx-primary">{greeting(user?.fullName)}</h1>
          <p className="text-sm text-tx-secondary first-letter:uppercase">{today}</p>
        </div>
        <div className="flex items-center gap-2">
          {failedFlows > 0 ? (
            <Link
              to="/flows"
              className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-200"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {failedFlows} {failedFlows === 1 ? 'fluxo falhou hoje' : 'fluxos falharam hoje'}
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            title="Atualizar"
            aria-label="Atualizar"
            className="rounded-full p-2 text-tx-secondary hover:bg-surface-container-low hover:text-primary disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          </button>
        </div>
      </header>

      {isError ? (
        <p className="text-sm font-semibold text-error">Não foi possível carregar o painel agora.</p>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[minmax(320px,2fr)_3fr]">
        <ForMeList forMe={data?.forMe} loading={isLoading} onOpen={setOpenItem} />
        <ProcessGrid processes={data?.processes} loading={isLoading} />
      </div>

      {openItem ? (
        <PhaseFieldsModal
          card={openItem}
          onClose={() => {
            setOpenItem(null);
            void refetch();
          }}
        />
      ) : null}
    </section>
  );
}
