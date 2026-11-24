import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../components/ui';
import type { DraftKanbanPhaseField } from '../types';
import { PhaseFieldRow } from './phase-field-row';

// Seleção pode tirar as opções de uma lista salva: o seletor lista as listas (aqui, nenhuma).
vi.mock('../../item-lists/item-lists-api', async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  useItemListsQuery: () => ({ data: [], isLoading: false }),
}));

function field(overrides: Partial<DraftKanbanPhaseField> = {}): DraftKanbanPhaseField {
  return {
    id: 'f1',
    serverId: 'f1',
    code: 'motivo',
    label: 'Motivo',
    fieldType: 'short_text',
    required: false,
    settingsJson: {},
    options: [],
    ...overrides,
  };
}

/** Monta a linha já aberta e devolve o último estado do campo a cada mudança. */
function renderRow(initial: DraftKanbanPhaseField, extra: { onMove?: (d: number) => void } = {}) {
  const changes: DraftKanbanPhaseField[] = [];
  function Harness() {
    const [value, setValue] = useState(initial);
    return (
      <ul>
        <PhaseFieldRow
          field={value}
          index={1}
          total={3}
          expanded
          onToggle={() => undefined}
          onChange={(next) => {
            changes.push(next);
            setValue(next);
          }}
          onRemove={() => undefined}
          onMove={extra.onMove ?? (() => undefined)}
        />
      </ul>
    );
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <Harness />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { last: () => changes[changes.length - 1] };
}

describe('PhaseFieldRow', () => {
  it('troca o tipo pelo seletor visual e começa da configuração padrão do tipo novo', () => {
    const { last } = renderRow(field({ settingsJson: { maxLength: 40 } }));
    fireEvent.click(screen.getByRole('button', { name: /Trocar/ }));
    expect(screen.getByRole('listbox', { name: 'Tipo do campo' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Texto curto/ })).toHaveAttribute('aria-selected', 'true');
    // "Lista do ERP" não existe em fase
    expect(screen.queryByRole('option', { name: /ERP/ })).not.toBeInTheDocument();

    // "Pedido de itens" existe em fase (a lista é do sistema)
    expect(screen.getByRole('option', { name: /Pedido de itens/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: /Avaliação/ }));
    expect(last()).toMatchObject({ fieldType: 'rating', settingsJson: { max: 5 } });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Número de estrelas')).toHaveValue(5);
  });

  it('"Total de horas": escolhe chegada e saída, grava em horas e avisa que sai em 8h30', () => {
    const changes: DraftKanbanPhaseField[] = [];
    function Harness() {
      const [value, setValue] = useState(field({ code: 'total_horas', label: 'Total de horas' }));
      return (
        <ul>
          <PhaseFieldRow
            field={value}
            index={0}
            total={1}
            expanded
            onToggle={() => undefined}
            onChange={(next) => {
              changes.push(next);
              setValue(next);
            }}
            onRemove={() => undefined}
            onMove={() => undefined}
            formulaFields={[
              { code: 'chegada', label: 'Hora de chegada', fieldType: 'time' },
              { code: 'saida', label: 'Hora de saída', fieldType: 'time' },
            ]}
          />
        </ul>
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Trocar/ }));
    fireEvent.click(screen.getByRole('option', { name: /Total de horas/ }));
    expect(changes.at(-1)).toMatchObject({ fieldType: 'calculated', settingsJson: { formula: '', formulaFormat: 'hours' } });
    expect(changes.at(-1)?.settingsJson.formulaPrefix).toBeUndefined();

    fireEvent.change(screen.getByLabelText('Hora de início (ex.: chegada)'), { target: { value: 'chegada' } });
    expect(changes.at(-1)?.settingsJson).toEqual({ formula: 'DURACAO({chegada}; {saida})', formulaFormat: 'hours' });
    expect(screen.getByText(/recalculado ao salvar os campos do card/).textContent).toMatch(/em horas \(ex\.: 8h30\)/);
    expect(screen.queryByText(/sempre em R\$/)).not.toBeInTheDocument();
  });

  it('"Cálculo (R$)": fórmula com os campos do formulário e das fases, formato fixo e sem obrigatório', () => {
    const changes: DraftKanbanPhaseField[] = [];
    function Harness() {
      const [value, setValue] = useState(field({ code: 'total', label: 'Total' }));
      return (
        <ul>
          <PhaseFieldRow
            field={value}
            index={0}
            total={1}
            expanded
            onToggle={() => undefined}
            onChange={(next) => {
              changes.push(next);
              setValue(next);
            }}
            onRemove={() => undefined}
            onMove={() => undefined}
            formulaFields={[
              { code: 'valor', label: 'Valor do pedido', fieldType: 'currency' },
              { code: 'frete', label: 'Frete (fase Cotação)', fieldType: 'currency' },
              { code: 'total', label: 'Total', fieldType: 'calculated' },
            ]}
          />
        </ul>
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Trocar/ }));
    fireEvent.click(screen.getByRole('option', { name: /Cálculo \(R\$\)/ }));
    expect(changes.at(-1)).toMatchObject({
      fieldType: 'calculated',
      settingsJson: { formula: '', formulaDecimals: 2, formulaPrefix: 'R$ ' },
    });

    // O próprio campo não aparece entre os atalhos; os outros sim.
    expect(screen.queryByRole('button', { name: 'Total' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Valor do pedido' }));
    fireEvent.click(screen.getByRole('button', { name: '+' }));
    fireEvent.click(screen.getByRole('button', { name: 'Frete (fase Cotação)' }));
    expect(changes.at(-1)?.settingsJson).toMatchObject({
      formula: '{valor} + {frete}',
      formulaDecimals: 2,
      formulaPrefix: 'R$ ',
    });
    // Formato fixo: sem casas/prefixo/sufixo; e cálculo não é obrigatório para ninguém.
    expect(screen.queryByText('Casas decimais')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Obrigatório' })).not.toBeInTheDocument();
    expect(screen.getByText('Calculado — ninguém preenche')).toBeInTheDocument();
  });

  it('"Lista suspensa" vira a seleção com displayAs e o seletor a reconhece; voltar tira o displayAs', () => {
    const { last } = renderRow(field());
    fireEvent.click(screen.getByRole('button', { name: /Trocar/ }));
    fireEvent.click(screen.getByRole('option', { name: /Lista suspensa \(várias\)/ }));
    expect(last()).toMatchObject({ fieldType: 'multi_select', settingsJson: { displayAs: 'dropdown' } });

    fireEvent.click(screen.getByRole('button', { name: /Trocar/ }));
    expect(screen.getByRole('option', { name: /Lista suspensa \(várias\)/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: /Várias opções/ })).toHaveAttribute('aria-selected', 'false');

    fireEvent.click(screen.getByRole('option', { name: /Várias opções/ }));
    expect(last().fieldType).toBe('multi_select');
    expect(last().settingsJson.displayAs).toBeUndefined();
  });

  it('conteúdo (título) não tem obrigatório nem código; trocar para ele desliga o obrigatório', () => {
    const { last } = renderRow(field({ required: true }));
    expect(screen.getByRole('switch', { name: 'Obrigatório' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Trocar/ }));
    fireEvent.click(screen.getByRole('option', { name: /Título/ }));
    expect(last()).toMatchObject({ fieldType: 'title', required: false });
    expect(screen.queryByRole('switch', { name: /Obrigatório/ })).not.toBeInTheDocument();
  });

  it('checkbox explica que obrigatório = precisa estar marcado', () => {
    renderRow(field({ fieldType: 'checkbox' }));
    expect(screen.getByRole('switch', { name: 'Obrigatório (precisa estar marcado)' })).toBeInTheDocument();
  });

  it('opção salva mantém o valor ao ser renomeada; opção nova acompanha o nome', () => {
    const { last } = renderRow(
      field({ fieldType: 'single_select', options: [{ value: 'cliente_desistiu', label: 'Cliente desistiu' }] }),
    );
    fireEvent.change(screen.getByLabelText('Nome da opção 1'), { target: { value: 'Cliente cancelou' } });
    expect(last().options[0]).toEqual({ value: 'cliente_desistiu', label: 'Cliente cancelou' });

    fireEvent.click(screen.getByRole('button', { name: /Adicionar opção/ }));
    fireEvent.change(screen.getByLabelText('Nome da opção 2'), { target: { value: 'Erro de digitação' } });
    expect(last().options[1]).toEqual({ value: 'erro_de_digitacao', label: 'Erro de digitação', isNew: true });
  });

  it('"Colar lista" cria uma opção por linha, sem repetir valores', () => {
    const { last } = renderRow(field({ fieldType: 'multi_select', options: [{ value: 'outro', label: 'Outro' }] }));
    fireEvent.click(screen.getByRole('button', { name: /Colar lista/ }));
    fireEvent.change(screen.getByLabelText('Colar opções, uma por linha'), {
      target: { value: 'Preço\n\n  Prazo  \nOutro' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(last().options.map((o) => [o.value, o.label])).toEqual([
      ['outro', 'Outro'],
      ['preco', 'Preço'],
      ['prazo', 'Prazo'],
      ['outro_2', 'Outro'],
    ]);
  });

  it('reordena opções e o campo', () => {
    const onMove = vi.fn();
    const { last } = renderRow(
      field({
        fieldType: 'single_select',
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      }),
      { onMove },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Descer opção 1' }));
    expect(last().options.map((o) => o.value)).toEqual(['b', 'a']);

    fireEvent.click(screen.getByRole('button', { name: 'Subir campo Motivo' }));
    expect(onMove).toHaveBeenCalledWith(-1);
  });

  it('número tem mínimo, máximo e casas decimais', () => {
    const { last } = renderRow(field({ fieldType: 'number' }));
    fireEvent.change(screen.getByLabelText('Máximo'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Casas decimais'), { target: { value: '2' } });
    expect(last().settingsJson).toEqual({ max: 100, decimals: 2 });
  });
});
