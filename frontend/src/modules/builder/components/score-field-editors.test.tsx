import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ScoreResultEditor, SectionScoreEditor } from './score-field-editors';

const questions = [
  {
    code: 'extravasamento',
    label: 'Há extravasamento de ração?',
    options: [
      { internalValue: 'opcao_1', displayLabel: 'Sim' },
      { internalValue: 'opcao_2', displayLabel: 'Não' },
    ],
  },
];

describe('SectionScoreEditor', () => {
  it('mostra as perguntas da seção já pontuadas, sem tirar nem acrescentar pergunta', () => {
    render(<SectionScoreEditor settings={{ scoreMode: 'section' }} questions={questions} onChangeSettings={vi.fn()} />);
    expect(screen.getByLabelText('Pontos de Sim')).toHaveValue(1);
    expect(screen.getByLabelText('Pontos de Não')).toHaveValue(0);
    expect(screen.queryByRole('button', { name: 'Tirar pontos' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Pontuar uma pergunta')).not.toBeInTheDocument();
  });

  it('"Inverter" grava os pontos invertidos da pergunta negativa', () => {
    const onChange = vi.fn();
    render(<SectionScoreEditor settings={{ scoreMode: 'section' }} questions={questions} onChangeSettings={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Inverter' }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ optionScores: { extravasamento: { opcao_1: 0, opcao_2: 1 } } }),
    );
  });

  it('seção sem pergunta de escolha avisa', () => {
    render(<SectionScoreEditor settings={{ scoreMode: 'section' }} questions={[]} onChangeSettings={vi.fn()} />);
    expect(screen.getByText(/ainda não tem perguntas de escolha/)).toBeInTheDocument();
  });
});

describe('ScoreResultEditor', () => {
  const sectionScores = [
    { code: 'p1', label: 'Pontuação', sectionTitle: 'Isolamento' },
    { code: 'p2', label: 'Pontuação', sectionTitle: 'Barreira' },
  ];

  it('marco ou média, e as seções usadas pelo nome da seção', () => {
    const onChange = vi.fn();
    render(
      <ScoreResultEditor
        fieldCode="geral"
        settings={{ scoreMode: 'result' }}
        sectionScores={sectionScores}
        onChangeSettings={onChange}
      />,
    );
    expect(screen.getByText('Usa 2 pontuações de seção')).toBeInTheDocument();
    expect(screen.getByText('Isolamento')).toBeInTheDocument();
    expect(screen.getByLabelText('Marco em %')).toHaveValue(70);

    fireEvent.change(screen.getByLabelText('Marco em %'), { target: { value: '80' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ scoreMark: 80 }));

    fireEvent.click(screen.getByLabelText(/Média das seções/));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ scoreResultMeasure: 'average' }));
  });

  it('com média, o marco some', () => {
    render(
      <ScoreResultEditor
        fieldCode="media"
        settings={{ scoreMode: 'result', scoreResultMeasure: 'average' }}
        sectionScores={sectionScores}
        onChangeSettings={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText('Marco em %')).not.toBeInTheDocument();
  });
});
