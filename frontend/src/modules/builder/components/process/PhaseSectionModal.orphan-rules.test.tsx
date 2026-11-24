import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { newDraftPhase } from '../../../kanban-phases/hooks/use-phases-draft';
import {
  PHASE_SECTION_AUTO,
  type DraftKanbanPhase,
  type DraftKanbanPhaseField,
} from '../../../kanban-phases/types';
import { PhaseSectionModal } from './PhaseSectionModal';

function field(
  id: string,
  fieldType: DraftKanbanPhaseField['fieldType'],
  label: string,
  options: DraftKanbanPhaseField['options'] = [],
): DraftKanbanPhaseField {
  return { id, serverId: null, code: id, label, fieldType, required: false, settingsJson: {}, options };
}

function Harness({ initial }: { initial: DraftKanbanPhase }) {
  const [phase, setPhase] = useState(initial);
  return (
    <PhaseSectionModal
      phase={phase}
      sectionId="t1"
      formulaFields={[]}
      onChangeFields={(fields) => setPhase((current) => ({ ...current, fields }))}
      onChangeSectionFlow={(sectionFlow) => setPhase((current) => ({ ...current, sectionFlow }))}
      onRemoveSection={() => {}}
      onSelectSection={() => {}}
      onClose={() => {}}
    />
  );
}

describe('PhaseSectionModal — regras sem efeito', () => {
  it('mostra a regra de opção apagada e o Remover tira só ela', () => {
    const phase: DraftKanbanPhase = {
      ...newDraftPhase(0),
      fields: [
        field('t1', 'title', 'Vistoria'),
        field('ok', 'checkbox', 'Está ok?'),
        field('area', 'single_select', 'Área', [{ value: 'fin', label: 'Financeiro' }]),
        field('t2', 'title', 'Fotos'),
      ],
      sectionFlow: {
        t1: {
          next: PHASE_SECTION_AUTO,
          branches: [
            { fieldId: 'ok', optionValue: null, checkboxValue: true, target: 't2' },
            { fieldId: 'area', optionValue: 'apagada', checkboxValue: null, target: 't2' },
          ],
        },
      },
    };
    render(<Harness initial={phase} />);

    const group = screen.getByRole('group', { name: 'Regras sem efeito' });
    expect(within(group).getByText('Se “Área” = apagada → Fotos')).toBeInTheDocument();
    expect(within(group).getByText(/a opção desta regra não existe mais no campo/)).toBeInTheDocument();

    fireEvent.click(within(group).getByRole('button', { name: /Remover regra sem efeito/ }));

    expect(screen.queryByRole('group', { name: 'Regras sem efeito' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Destino quando Está ok? for Sim')).toHaveValue('t2');
  });
});
