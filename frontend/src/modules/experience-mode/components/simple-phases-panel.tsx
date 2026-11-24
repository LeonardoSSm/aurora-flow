import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../../lib/cn';
import { setExperienceMode } from '../experience-mode-store';
import { ModeSwitch } from './mode-switch';
import { queryKeys } from '../../../lib/query-keys';
import { usePhasesDraft } from '../../kanban-phases/hooks/use-phases-draft';
import { phaseColorHex } from '../../kanban-phases/types';
import { PhaseDetailStep, PhasesStep } from './wizard-steps';
import { SimpleModal } from './simple-modal';

/**
 * Etapas do processo no modo simplificado: a mesma lista e as mesmas perguntas do passo a passo
 * (nome, ordem, quem trabalha, aprovação, prazo), salvas de uma vez.
 */
export function SimplePhasesPanel({ formId, onClose }: { formId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const phases = usePhasesDraft(formId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const workPhases = phases.draft.filter((phase) => !phase.isTerminal);
  const selectedIndex = workPhases.findIndex((phase) => phase.id === selectedId);
  const selected = selectedIndex >= 0 ? workPhases[selectedIndex] : workPhases[0];

  /** Mesmas etapas no Criador avançado (mapa do processo); a chave de lá traz de volta para cá. */
  function openAdvanced() {
    if (phases.hasUnsavedChanges && !window.confirm('As mudanças nas etapas ainda não foram salvas. Sair mesmo assim?')) {
      return;
    }
    setExperienceMode('advanced');
    navigate(`/builder?formId=${formId}`);
  }

  async function save() {
    if (phases.draft.some((phase) => !phase.label.trim())) {
      setError('Dê um nome para cada etapa.');
      return;
    }
    setError(null);
    if (!phases.hasUnsavedChanges) {
      onClose();
      return;
    }
    if (await phases.save()) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.kanbanPhases.byForm(formId) });
      onClose();
    }
  }

  return (
    <SimpleModal
      title="Etapas"
      subtitle="As colunas do kanban: por onde o pedido passa e quem cuida de cada parte."
      onClose={onClose}
      headerExtra={<ModeSwitch value="simple" onChange={openAdvanced} className="mt-1" />}
      footer={
        <>
          {error ? <p role="alert" className="mr-auto text-sm font-semibold text-red-600 dark:text-red-400">{error}</p> : null}
          <button type="button" onClick={onClose} className="h-11 rounded-xl px-5 text-sm font-bold text-tx-primary hover:bg-bg-hover">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={phases.isSaving || !phases.initialized}
            className="h-11 rounded-xl bg-primary px-5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
          >
            {phases.isSaving ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      }
    >
      <PhasesStep phases={phases} />

      {phases.initialized && selected ? (
        <section className="mt-8 border-t border-border-default pt-6">
          <h3 className="mb-3 text-lg font-bold text-tx-primary">Quem faz o quê</h3>
          <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Etapa">
            {workPhases.map((phase) => (
              <button
                key={phase.id}
                type="button"
                role="tab"
                aria-selected={phase.id === selected.id}
                onClick={() => setSelectedId(phase.id)}
                className={cn(
                  'inline-flex h-9 items-center gap-2 rounded-full border-2 px-3 text-sm font-semibold transition-colors',
                  phase.id === selected.id
                    ? 'border-primary bg-primary/10 text-tx-primary'
                    : 'border-border-default text-tx-secondary hover:bg-bg-hover',
                )}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: phaseColorHex(phase.color) }} />
                {phase.label || 'Sem nome'}
              </button>
            ))}
          </div>
          <PhaseDetailStep
            key={selected.id}
            phase={selected}
            position={workPhases.indexOf(selected) + 1}
            total={workPhases.length}
            phases={phases}
          />
        </section>
      ) : null}
    </SimpleModal>
  );
}
