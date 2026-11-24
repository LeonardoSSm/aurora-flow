import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { fireEvent, render, screen } from '@testing-library/react';
import { BuilderWizardFieldRow } from './builder-wizard-field-row';
import type { DraftField } from '../types';

function makeCalculatedField(overrides: Partial<DraftField> = {}): DraftField {
  return {
    id: 'field-total',
    code: 'total',
    label: 'Total',
    fieldType: 'calculated',
    required: false,
    isSensitive: false,
    options: [],
    settingsJson: { formula: '{quantidade} * {preco}', formulaDecimals: 2 },
    conditionsJson: {},
    visibilityRules: null,
    ...overrides,
  };
}

const availableFields = [
  { code: 'quantidade', label: 'Quantidade', fieldType: 'number' as const },
  { code: 'preco', label: 'Preço unitário', fieldType: 'currency' as const },
  {
    code: 'tabela',
    label: 'Tabela de Produtos',
    fieldType: 'product_table' as const,
    productTableColumns: [
      { id: 'col-qtd', label: 'Quantidade', type: 'number' as const, filledBy: 'respondent' as const },
      {
        id: 'col-valor',
        label: 'Valor unitario',
        type: 'number' as const,
        filledBy: 'respondent' as const,
      },
    ],
  },
];

function renderRow(field: DraftField, onChange = () => {}, fields = availableFields) {
  return render(
    <DndContext>
      <SortableContext items={[field.id]}>
        <BuilderWizardFieldRow
          field={field}
          position={1}
          availableFields={fields}
          expanded
          onToggleExpanded={() => {}}
          onOpenTypePicker={() => {}}
          onChange={onChange}
          onRemove={() => {}}
          canRemove
        />
      </SortableContext>
    </DndContext>,
  );
}

describe('BuilderWizardFieldRow — editor de fórmula', () => {
  it('abre o editor com a fórmula e os campos disponíveis', () => {
    renderRow(makeCalculatedField());

    expect(screen.getByDisplayValue('{quantidade} * {preco}')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quantidade' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preço unitário' })).toBeInTheDocument();
  });

  it('insere a referência do campo ao clicar no atalho', () => {
    const onChange = vi.fn();
    renderRow(makeCalculatedField({ settingsJson: { formula: '', formulaDecimals: 2 } }), onChange);

    fireEvent.click(screen.getByRole('button', { name: 'Quantidade' }));

    expect(onChange).toHaveBeenCalledWith('settingsJson', {
      formula: '{quantidade}',
      formulaDecimals: 2,
    });
  });

  it('atalho de uma tabela de produtos insere o gabarito do SOMAPRODUTO com o nome real da 1ª coluna', () => {
    const onChange = vi.fn();
    renderRow(makeCalculatedField({ settingsJson: { formula: '', formulaDecimals: 2 } }), onChange);

    fireEvent.click(screen.getByRole('button', { name: 'Tabela de Produtos' }));

    expect(onChange).toHaveBeenCalledWith('settingsJson', {
      formula: 'SOMAPRODUTO({tabela}; "Quantidade")',
      formulaDecimals: 2,
    });
  });

  it('atalho de uma tabela sem colunas configuradas cai no placeholder genérico "coluna"', () => {
    const onChange = vi.fn();
    const semColunas = [
      { code: 'tabela', label: 'Tabela de Produtos', fieldType: 'product_table' as const },
    ];
    renderRow(
      makeCalculatedField({ settingsJson: { formula: '', formulaDecimals: 2 } }),
      onChange,
      semColunas,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tabela de Produtos' }));

    expect(onChange).toHaveBeenCalledWith('settingsJson', {
      formula: 'SOMAPRODUTO({tabela}; "coluna")',
      formulaDecimals: 2,
    });
  });

  it('mostra um atalho por coluna da tabela, com aspas no rótulo — não colide com o atalho do campo "Quantidade"', () => {
    renderRow(makeCalculatedField());

    // Chip do campo numérico "Quantidade" e chip da coluna "Quantidade" da tabela
    // coexistem sem ambiguidade porque o texto do chip de coluna já vem entre aspas.
    expect(screen.getByRole('button', { name: 'Quantidade' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '"Quantidade"' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '"Valor unitario"' })).toBeInTheDocument();
  });

  it('clicar no atalho de uma coluna insere o nome entre aspas', () => {
    const onChange = vi.fn();
    renderRow(makeCalculatedField({ settingsJson: { formula: '', formulaDecimals: 2 } }), onChange);

    fireEvent.click(screen.getByRole('button', { name: '"Valor unitario"' }));

    expect(onChange).toHaveBeenCalledWith('settingsJson', {
      formula: '"Valor unitario"',
      formulaDecimals: 2,
    });
  });

  it('acusa referência a campo inexistente', () => {
    renderRow(makeCalculatedField({ settingsJson: { formula: '{quantidade} + {inexistente}' } }));

    expect(screen.getByText(/Campo não encontrado na fórmula: \{inexistente\}/)).toBeInTheDocument();
  });

  it('acusa fórmula com sintaxe inválida', () => {
    renderRow(makeCalculatedField({ settingsJson: { formula: '{quantidade} *' } }));

    expect(screen.getByText('Fórmula incompleta.')).toBeInTheDocument();
  });

  it('simula o resultado com os valores de teste', () => {
    renderRow(makeCalculatedField());

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Quantidade' }), {
      target: { value: '3' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Preço unitário' }), {
      target: { value: '19.9' },
    });

    expect(screen.getByText('59,70')).toBeInTheDocument();
  });

  describe('testador com SOMAPRODUTO — colunas em vez da tabela inteira', () => {
    function renderWithSumProduct(formula: string) {
      return renderRow(
        makeCalculatedField({ settingsJson: { formula, formulaDecimals: 2 } }),
      );
    }

    it('pede um valor por coluna citada, não um número solto pra tabela inteira', () => {
      renderWithSumProduct('SOMAPRODUTO({tabela}; "Quantidade"; "Valor unitario")');

      expect(screen.queryByRole('spinbutton', { name: 'Tabela de Produtos' })).toBeNull();
      expect(screen.getByRole('spinbutton', { name: '"Quantidade"' })).toBeInTheDocument();
      expect(screen.getByRole('spinbutton', { name: '"Valor unitario"' })).toBeInTheDocument();
    });

    it('calcula o resultado simulado a partir dos valores de coluna preenchidos', () => {
      renderWithSumProduct('SOMAPRODUTO({tabela}; "Quantidade"; "Valor unitario")');

      fireEvent.change(screen.getByRole('spinbutton', { name: '"Quantidade"' }), {
        target: { value: '10' },
      });
      fireEvent.change(screen.getByRole('spinbutton', { name: '"Valor unitario"' }), {
        target: { value: '2.5' },
      });

      expect(screen.getByText('25,00')).toBeInTheDocument();
    });

    it('fica em branco (—) enquanto nenhuma coluna de teste foi preenchida', () => {
      renderWithSumProduct('SOMAPRODUTO({tabela}; "Quantidade"; "Valor unitario")');

      expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('mistura campo comum e coluna de tabela na mesma simulação', () => {
      renderWithSumProduct('SOMAPRODUTO({tabela}; "Quantidade") + {preco}');

      fireEvent.change(screen.getByRole('spinbutton', { name: '"Quantidade"' }), {
        target: { value: '3' },
      });
      fireEvent.change(screen.getByRole('spinbutton', { name: 'Preço unitário' }), {
        target: { value: '10' },
      });

      expect(screen.getByText('13,00')).toBeInTheDocument();
    });

    it('combinar colunas com + (em vez de separar com ;) acusa erro, em vez de reverter pro input da tabela inteira', () => {
      renderWithSumProduct('SOMAPRODUTO({tabela}; "Quantidade" + "Valor unitario")');

      expect(screen.getByText(/vão direto entre aspas/)).toBeInTheDocument();
      expect(screen.queryByRole('spinbutton', { name: 'Tabela de Produtos' })).toBeNull();
      expect(screen.queryByText('Testar com valores de exemplo')).toBeNull();
    });

    it('SOMAQUOCIENTE também pede um valor por coluna, e calcula a divisão simulada', () => {
      renderWithSumProduct('SOMAQUOCIENTE({tabela}; "Quantidade"; "Valor unitario")');

      expect(screen.queryByRole('spinbutton', { name: 'Tabela de Produtos' })).toBeNull();
      fireEvent.change(screen.getByRole('spinbutton', { name: '"Quantidade"' }), {
        target: { value: '10' },
      });
      fireEvent.change(screen.getByRole('spinbutton', { name: '"Valor unitario"' }), {
        target: { value: '2' },
      });

      expect(screen.getByText('5,00')).toBeInTheDocument();
    });
  });
});

describe('BuilderWizardFieldRow — rótulo do campo', () => {
  // Motivo: o rótulo costuma ser uma pergunta inteira ("A granja respeita a distância
  // mínima..."), não uma palavra — um <input> de uma linha só escondia a maior parte do
  // texto atrás de rolagem horizontal. Virou um textarea de uma "linha" que cresce em
  // altura conforme o texto quebra.
  it('é um textarea (não um input de uma linha só), pra caber pergunta longa', () => {
    renderRow(makeCalculatedField({ label: 'Pergunta' }));

    const labelField = screen.getByDisplayValue('Pergunta');
    expect(labelField.tagName).toBe('TEXTAREA');
  });

  it('Enter no rótulo é bloqueado — continua sendo um texto de uma linha só, sem quebra manual', () => {
    renderRow(makeCalculatedField({ label: 'Pergunta' }));

    const labelField = screen.getByDisplayValue('Pergunta');
    // fireEvent.keyDown devolve false quando preventDefault() foi chamado durante o disparo.
    const notPrevented = fireEvent.keyDown(labelField, { key: 'Enter' });
    expect(notPrevented).toBe(false);
  });
});
