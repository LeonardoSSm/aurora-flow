import { LayoutGrid, Plus } from 'lucide-react';
import { useAuth } from '../../../app/auth-context';
import { useSimpleProcesses } from './simple-processes-view';

type SimpleHomeViewProps = {
  onCreateProcess: () => void;
  onViewProcesses: () => void;
};

/** Modo simplificado: criar processo e, quando já existe algum, ver os processos. */
export function SimpleHomeView({ onCreateProcess, onViewProcesses }: SimpleHomeViewProps) {
  const processes = useSimpleProcesses();
  const count = processes.data?.total ?? 0;
  const canCreate = useAuth().hasPermission('forms.create');

  return (
    <div className="flex min-h-[calc(100vh-53px-48px)] flex-wrap content-center items-center justify-center gap-6 px-4 py-10">
      {canCreate ? (
        <button
          type="button"
          onClick={onCreateProcess}
          className="flex w-72 flex-col items-center gap-4 rounded-3xl bg-primary px-10 py-12 text-white shadow-soft transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          <Plus className="h-16 w-16" strokeWidth={2.5} />
          <span className="text-3xl font-bold">Criar processo</span>
        </button>
      ) : null}

      {count > 0 ? (
        <button
          type="button"
          onClick={onViewProcesses}
          className="flex w-72 flex-col items-center gap-4 rounded-3xl border-2 border-border-strong bg-bg-surface px-10 py-12 text-tx-primary shadow-soft transition-colors hover:bg-bg-hover focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          <LayoutGrid className="h-16 w-16" strokeWidth={2} />
          <span className="text-3xl font-bold">Ver processos</span>
          <span className="-mt-2 text-base text-tx-secondary">
            {count} {count === 1 ? 'processo' : 'processos'}
          </span>
        </button>
      ) : null}

      {!canCreate && !processes.isLoading && count === 0 ? (
        <p className="max-w-md text-center text-lg text-tx-secondary">
          Nenhum processo liberado para você ainda. Peça acesso a quem cuida do processo.
        </p>
      ) : null}
    </div>
  );
}
