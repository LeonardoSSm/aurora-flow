import { Columns3, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../app/auth-context';
import { SimpleAutomationsPanel } from './simple-automations-panel';
import { SimplePhasesPanel } from './simple-phases-panel';

const buttonClass =
  'inline-flex h-10 items-center gap-2 rounded-xl border-2 border-border-strong bg-bg-surface px-4 text-sm font-bold text-tx-primary transition-colors hover:bg-bg-hover';

/** Topo do kanban no modo simplificado: as etapas do processo e as automações. */
export function SimpleKanbanToolbar({ formId }: { formId: string }) {
  const { can } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const linkState = location.state as { processName?: string; openPhases?: boolean } | null;
  const canEditPhases = can('kanban_phases.manage', formId);
  const canManageFlows = can('flows.manage', formId);
  // Quem volta do Criador avançado pela chave "Simples" chega com as Etapas abertas.
  const [open, setOpen] = useState<'phases' | 'automations' | null>(() =>
    linkState?.openPhases && canEditPhases ? 'phases' : null,
  );

  // Consome o pedido de abrir: recarregar a página não reabre a janela.
  useEffect(() => {
    if (linkState?.openPhases) {
      navigate(location.pathname, { replace: true, state: { processName: linkState.processName } });
    }
  }, [linkState, location.pathname, navigate]);

  if (!canEditPhases && !canManageFlows) return null;

  return (
    <>
      {canEditPhases ? (
        <button type="button" onClick={() => setOpen('phases')} className={buttonClass}>
          <Columns3 className="h-4 w-4" />
          Etapas
        </button>
      ) : null}
      {canManageFlows ? (
        <button type="button" onClick={() => setOpen('automations')} className={buttonClass}>
          <Zap className="h-4 w-4" />
          Automações
        </button>
      ) : null}
      {open === 'phases' ? <SimplePhasesPanel formId={formId} onClose={() => setOpen(null)} /> : null}
      {open === 'automations' ? <SimpleAutomationsPanel formId={formId} onClose={() => setOpen(null)} /> : null}
    </>
  );
}
