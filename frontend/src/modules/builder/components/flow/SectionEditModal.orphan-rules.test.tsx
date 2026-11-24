import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ToastProvider } from '../../../../components/ui';
import type { DraftField, DraftSection, DraftSectionBranch } from '../../types';
import { SectionEditModal } from './SectionEditModal';

function makeField(code: string, label: string, overrides: Partial<DraftField> = {}): DraftField {
  return {
    id: `f-${code}`,
    code,
    label,
    fieldType: 'checkbox',
    required: false,
    isSensitive: false,
    options: [],
    settingsJson: {},
    conditionsJson: {},
    visibilityRules: null,
    ...overrides,
  };
}

function makeBranch(id: string, overrides: Partial<DraftSectionBranch> = {}): DraftSectionBranch {
  return {
    id,
    fieldCode: 'veiculo',
    optionValue: null,
    checkboxValue: true,
    targetSectionId: 's2',
    targetIsSubmit: false,
    ...overrides,
  };
}

function makeSections(branches: DraftSectionBranch[], s1: Partial<DraftSection> = {}): DraftSection[] {
  return [
    {
      id: 's1',
      serverId: null,
      title: 'Informações principais',
      description: '',
      nextSectionId: 's2',
      nextIsSubmit: false,
      flowPositionX: null,
      flowPositionY: null,
      branches,
      fields: [
        makeField('veiculo', 'Usou veículo?'),
        makeField('transporte', 'Transporte', {
          fieldType: 'single_select',
          options: [{ id: 'o1', internalValue: 'opcao_1', displayLabel: 'Moto' }],
        }),
      ],
      ...s1,
    },
    {
      id: 's2',
      serverId: null,
      title: 'Despesas',
      description: '',
      nextSectionId: null,
      nextIsSubmit: true,
      flowPositionX: null,
      flowPositionY: null,
      branches: [],
      fields: [],
    },
  ];
}

/** Guarda o que o modal manda em onSetSectionFlow, como o reducer do construtor faz. */
function Harness({ initial }: { initial: DraftSection[] }) {
  const [sections, setSections] = useState(initial);
  return (
    <SectionEditModal
      section={sections[0]}
      sections={sections}
      formId={null}
      availableFields={[]}
      onClose={() => {}}
      onSelectSection={() => {}}
      onUpdateSection={() => {}}
      onRemoveSection={() => {}}
      canRemoveSection
      onAddField={() => 'novo'}
      onRemoveField={() => {}}
      onUpdateField={() => {}}
      onMoveField={() => {}}
      onSetSectionFlow={(nextSectionId, nextIsSubmit, branches) =>
        setSections((current) =>
          current.map((s, i) => (i === 0 ? { ...s, nextSectionId, nextIsSubmit, branches } : s)),
        )
      }
    />
  );
}

function openFlowTab(initial: DraftSection[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <Harness initial={initial} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByText('Lógica de fluxo'));
}

describe('SectionEditModal — regras sem efeito na Lógica de fluxo', () => {
  it('mostra a regra de checkbox sem Sim/Não (caso da produção) e remove só ela', () => {
    openFlowTab(
      makeSections([
        makeBranch('valida'),
        makeBranch('orfa', { checkboxValue: null }),
      ]),
    );

    const group = screen.getByRole('group', { name: 'Regras sem efeito' });
    expect(within(group).getByText('Se “Usou veículo?” = sem resposta definida → Despesas')).toBeInTheDocument();
    expect(within(group).getByText(/a regra não diz para qual resposta vale/)).toBeInTheDocument();

    fireEvent.click(within(group).getByRole('button', { name: /Remover regra sem efeito/ }));

    expect(screen.queryByRole('group', { name: 'Regras sem efeito' })).not.toBeInTheDocument();
    // A regra válida (Sim → Despesas) continua no seletor do "Sim".
    const selects = screen.getAllByRole('combobox');
    expect((selects[0] as HTMLSelectElement).value).toBe('s2');
  });

  it('pega já no rascunho a regra numa opção apagada e a de destino removido', () => {
    openFlowTab(
      makeSections([
        makeBranch('opcao-apagada', { fieldCode: 'transporte', optionValue: 'opcao_9', checkboxValue: null }),
        makeBranch('destino-apagado', { targetSectionId: 'fantasma' }),
      ]),
    );

    const group = screen.getByRole('group', { name: 'Regras sem efeito' });
    expect(within(group).getByText('2 regras sem efeito')).toBeInTheDocument();
    expect(within(group).getByText(/a opção desta regra não existe mais no campo/)).toBeInTheDocument();
    expect(within(group).getByText('Se “Usou veículo?” = Sim → seção removida')).toBeInTheDocument();
    expect(within(group).getAllByRole('button', { name: /Remover regra sem efeito/ })).toHaveLength(2);
  });

  it('sem regra órfã, não mostra o aviso', () => {
    openFlowTab(makeSections([makeBranch('valida')]));
    expect(screen.queryByRole('group', { name: 'Regras sem efeito' })).not.toBeInTheDocument();
  });

  it('caminho padrão com destino apagado não finge "Enviar formulário"', () => {
    openFlowTab(makeSections([], { nextSectionId: 'fantasma', nextIsSubmit: false }));

    const select = screen.getByRole('combobox', { name: 'Caminho padrão desta seção' }) as HTMLSelectElement;
    expect(select.selectedOptions[0].textContent).toBe('Seção removida — escolha o destino');

    fireEvent.change(select, { target: { value: '__submit__' } });
    expect(select.selectedOptions[0].textContent).toBe('Enviar formulário');
  });
});
