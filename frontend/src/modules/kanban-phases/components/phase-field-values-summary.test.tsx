import { render, screen } from '@testing-library/react';
import type { PhaseFieldValue } from '../../solicitations/services/solicitations-api';
import type { KanbanPhase, KanbanPhaseField } from '../types';
import {
  formatPhaseValue,
  getPhaseFieldEntries,
  PhaseFieldValuesSummary,
} from './phase-field-values-summary';

function makeField(overrides: Partial<KanbanPhaseField>): KanbanPhaseField {
  return {
    id: 'fld-qtd',
    code: 'quantidade',
    label: 'Quantidade produzida',
    fieldType: 'number',
    required: true,
    order: 0,
    settingsJson: null,
    optionsJson: null,
    ...overrides,
  };
}

function makePhase(fields: KanbanPhaseField[]): KanbanPhase {
  return {
    id: 'phase-qtd',
    formId: 'form-1',
    key: 'quantidade_produzida',
    label: 'Quantidade produzida',
    color: 'blue',
    description: null,
    order: 2,
    isTerminal: false,
    actorRoleCode: 'operador',
    requiresApproval: true,
    approverRoleCode: 'supervisor',
    fields,
  };
}

function makeValue(overrides: Partial<PhaseFieldValue>): PhaseFieldValue {
  return {
    id: 'val-1',
    solicitationId: 'sol-1',
    phaseFieldId: 'fld-qtd',
    fieldCode: 'quantidade',
    valueText: null,
    valueNumber: null,
    valueBoolean: null,
    valueJson: null,
    ...overrides,
  };
}

describe('getPhaseFieldEntries', () => {
  it('devolve só os campos da fase que já têm valor, na ordem da fase', () => {
    const phase = makePhase([
      makeField({ id: 'a', label: 'Lote', fieldType: 'short_text', order: 0 }),
      makeField({ id: 'b', label: 'Quantidade produzida', order: 1 }),
      makeField({ id: 'c', label: 'Observação', fieldType: 'long_text', order: 2 }),
    ]);
    const entries = getPhaseFieldEntries(phase, [
      makeValue({ id: 'v-b', phaseFieldId: 'b', valueNumber: 120 }),
      makeValue({ id: 'v-a', phaseFieldId: 'a', valueText: 'L-42' }),
    ]);

    expect(entries.map((entry) => entry.field.label)).toEqual(['Lote', 'Quantidade produzida']);
  });

  it('ignora campos de arquivo (a foto aparece como anexo) e valores vazios', () => {
    const phase = makePhase([
      makeField({ id: 'foto', label: 'Foto', fieldType: 'file_upload', order: 0 }),
      makeField({ id: 'qtd', label: 'Quantidade produzida', order: 1 }),
    ]);
    const entries = getPhaseFieldEntries(phase, [
      makeValue({ id: 'v-foto', phaseFieldId: 'foto', valueJson: { attachmentId: 'att-1' } }),
      makeValue({ id: 'v-qtd', phaseFieldId: 'qtd' }),
    ]);

    expect(entries).toEqual([]);
  });

  it('formata número, texto, booleano e JSON', () => {
    expect(formatPhaseValue(makeValue({ valueNumber: 0 }))).toBe('0');
    expect(formatPhaseValue(makeValue({ valueText: 'ok' }))).toBe('ok');
    expect(formatPhaseValue(makeValue({ valueBoolean: false }))).toBe('Não');
    expect(formatPhaseValue(makeValue({ valueJson: { a: 1 } }))).toBe('{"a":1}');
  });

  it('número no formato brasileiro; "Valor (R$)" mostra o texto visto; "Cálculo" sempre em R$', () => {
    expect(formatPhaseValue(makeValue({ valueNumber: 1234.5 }))).toBe('1.234,5');
    expect(
      formatPhaseValue(makeValue({ valueText: 'R$ 1.500,75', valueNumber: 1500.75 }), { fieldType: 'currency' }),
    ).toBe('R$ 1.500,75');
    expect(formatPhaseValue(makeValue({ valueNumber: 1500.75 }), { fieldType: 'currency' })).toBe('R$ 1.500,75');
    expect(formatPhaseValue(makeValue({ valueNumber: 1050.25 }), { fieldType: 'calculated' })).toBe('R$ 1.050,25');
  });
});

describe('PhaseFieldValuesSummary', () => {
  const phase = makePhase([makeField({})]);

  it('mostra a quantidade enviada em destaque, com o rótulo do campo', () => {
    render(
      <PhaseFieldValuesSummary
        phase={phase}
        values={[makeValue({ valueNumber: 120 })]}
      />,
    );

    expect(screen.getByRole('region', { name: 'Dados enviados nesta fase' })).toBeInTheDocument();
    expect(screen.getByText('Quantidade produzida')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
  });

  it('mostra o zero como valor (zero é uma quantidade válida, não "vazio")', () => {
    render(<PhaseFieldValuesSummary phase={phase} values={[makeValue({ valueNumber: 0 })]} />);

    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('aceita um título customizado', () => {
    render(
      <PhaseFieldValuesSummary
        phase={phase}
        title="Enviado pelo operador"
        values={[makeValue({ valueNumber: 7 })]}
      />,
    );

    expect(screen.getByRole('region', { name: 'Enviado pelo operador' })).toBeInTheDocument();
  });

  it('não renderiza nada sem fase, ou enquanto o operador ainda não preencheu nada', () => {
    const { container, rerender } = render(<PhaseFieldValuesSummary phase={undefined} values={[]} />);
    expect(container).toBeEmptyDOMElement();

    rerender(<PhaseFieldValuesSummary phase={phase} values={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
