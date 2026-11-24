import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FieldSettings } from '../../forms/types';
import { FormulaEditor, type FormulaAvailableField } from './formula-editor';

const fields: FormulaAvailableField[] = [
  {
    code: 'p1',
    label: 'Usa EPI?',
    fieldType: 'single_select',
    options: [
      { internalValue: 'a', displayLabel: 'Sim' },
      { internalValue: 'b', displayLabel: 'Não' },
    ],
  },
  {
    code: 'p2',
    label: 'Área isolada?',
    fieldType: 'single_select',
    options: [
      { internalValue: 'a', displayLabel: 'Sim' },
      { internalValue: 'b', displayLabel: 'Não' },
    ],
  },
];
const phases = [
  { id: 'fase-1', label: 'Novo' },
  { id: 'fase-urgente', label: 'Urgente' },
];

function renderEditor(settings: FieldSettings, onChangeSettings = vi.fn()) {
  render(
    <FormulaEditor
      fieldCode="pontos"
      settings={settings}
      availableFields={fields}
      phaseOptions={phases}
      onChangeSettings={onChangeSettings}
    />,
  );
  return onChangeSettings;
}

describe('FormulaEditor — pontos por opção e faixas', () => {
  it('pontua uma pergunta já com Sim = 1 e Não = 0', () => {
    const onChange = renderEditor({ formula: '' });
    fireEvent.change(screen.getByLabelText('Pontuar uma pergunta'), { target: { value: 'p1' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ optionScores: { p1: { a: 1, b: 0 } } }));
  });

  it('grava e apaga pontos de uma opção', () => {
    const onChange = renderEditor({ formula: '{p1}', optionScores: { p1: { a: 10 } } });
    fireEvent.change(screen.getByLabelText('Pontos de Não'), { target: { value: '5' } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ optionScores: { p1: { a: 10, b: 5 } } }),
    );
    fireEvent.change(screen.getByLabelText('Pontos de Sim'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ optionScores: { p1: {} } }));
  });

  it('"Usar a soma" monta a fórmula com as perguntas pontuadas', () => {
    const onChange = renderEditor({ formula: '', optionScores: { p1: { a: 10 }, p2: { a: 20 } } });
    fireEvent.click(screen.getByRole('button', { name: 'Usar a soma das perguntas pontuadas' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ formula: 'SOMA({p1}; {p2})' }));
  });

  it('avisa quando uma pergunta de escolha está na fórmula sem pontos', () => {
    renderEditor({ formula: '{p1} + {p2}', optionScores: { p1: { a: 10 } } });
    expect(screen.getByText(/Área isolada\? está na fórmula sem pontos/)).toBeInTheDocument();
  });

  it('o teste mostra em que faixa e fase o resultado cai', () => {
    renderEditor({
      formula: 'SOMA({p1}; {p2})',
      optionScores: { p1: { a: 10, b: 0 }, p2: { a: 20, b: 0 } },
      scoreRanges: [
        { id: 'r1', from: 20, label: 'Atenção', phaseId: 'fase-1' },
        { id: 'r2', from: 30, label: 'Crítico', phaseId: 'fase-urgente' },
      ],
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Usa EPI?' }), { target: { value: 'a' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Área isolada?' }), { target: { value: 'a' } });
    expect(screen.getByText('faixa "Crítico" → Urgente')).toBeInTheDocument();
  });

  it('adiciona faixa e exige a fase', () => {
    const onChange = renderEditor({
      formula: '{p1}',
      scoreRanges: [{ id: 'r1', from: 20 }],
    });
    expect(screen.getByText('Escolha a fase desta faixa.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar faixa' }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scoreRanges: [{ id: 'r1', from: 20 }, expect.objectContaining({ from: 30 })],
      }),
    );
  });

  it('sem o processo salvo, não deixa escolher fase', () => {
    render(
      <FormulaEditor
        fieldCode="pontos"
        settings={{ formula: '{p1}', scoreRanges: [{ id: 'r1', from: 20 }] }}
        availableFields={fields}
        phaseOptions={null}
        onChangeSettings={vi.fn()}
      />,
    );
    expect(screen.getByText('Salve o processo para escolher as fases das faixas.')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Card começa na fase' })).toBeDisabled();
  });
});

describe('FormulaEditor — pontuação da seção', () => {
  const sectionFields: FormulaAvailableField[] = [
    ...fields,
    {
      code: 'p3',
      label: 'Piquete?',
      fieldType: 'single_select',
      options: [
        { internalValue: 'opcao_1', displayLabel: 'Sim' },
        { internalValue: 'opcao_2', displayLabel: 'Não' },
        { internalValue: 'opcao_3', displayLabel: 'Não se Aplica' },
      ],
    },
    { code: 'fora', label: 'De outra seção', fieldType: 'single_select', options: [] },
  ];

  function renderSection(settings: FieldSettings, onChangeSettings = vi.fn()) {
    render(
      <FormulaEditor
        fieldCode="conf_secao"
        settings={settings}
        availableFields={sectionFields}
        sectionFieldCodes={['p1', 'p2', 'p3', 'conf_secao']}
        onChangeSettings={onChangeSettings}
      />,
    );
    return onChangeSettings;
  }

  it('"Pontuar as perguntas desta seção" pontua só as da seção e monta a CONFORMIDADE', () => {
    const onChange = renderSection({ formula: '' });
    fireEvent.click(screen.getByRole('button', { name: 'Pontuar as perguntas desta seção' }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        optionScores: {
          p1: { a: 1, b: 0 },
          p2: { a: 1, b: 0 },
          p3: { opcao_1: 1, opcao_2: 0, opcao_3: null },
        },
        formula: 'CONFORMIDADE({p1}; {p2}; {p3})',
        formulaSuffix: '%',
      }),
    );
  });

  it('pergunta já pontuada (ex.: invertida) e fórmula já escrita ficam como estão', () => {
    const onChange = renderSection({ formula: 'CONFORMIDADE({p1})', optionScores: { p1: { a: 0, b: 1 } } });
    fireEvent.click(screen.getByRole('button', { name: 'Pontuar as perguntas desta seção' }));
    const last = onChange.mock.calls.at(-1)?.[0] as FieldSettings;
    expect(last.optionScores?.p1).toEqual({ a: 0, b: 1 });
    expect(last.formula).toBe('CONFORMIDADE({p1})');
  });

  it('"Inverter" troca os pontos de Sim e Não', () => {
    const onChange = renderSection({ formula: '{p1}', optionScores: { p1: { a: 1, b: 0 } } });
    fireEvent.click(screen.getByRole('button', { name: 'Inverter' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ optionScores: { p1: { a: 0, b: 1 } } }));
  });

  it('desmarcar "conta" deixa a opção fora da pontuação', () => {
    const onChange = renderSection({ formula: '{p3}', optionScores: { p3: { opcao_1: 1, opcao_2: 0, opcao_3: 0 } } });
    fireEvent.click(screen.getByLabelText('Não se Aplica conta na pontuação'));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ optionScores: { p3: { opcao_1: 1, opcao_2: 0, opcao_3: null } } }),
    );
  });
});
