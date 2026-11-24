import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ResponseScorecard } from '../utils/response-scorecard';
import { ResponseScorecardView, SCORECARD_UNIT_STORAGE_KEY } from './response-scorecard';

const scorecard: ResponseScorecard = {
  mark: 70,
  results: [
    { code: 'geral', label: 'Seções no marco', value: 50, formatted: '50,0%', pointsText: '1 de 2 seções' },
    { code: 'media', label: 'Média', value: 40, formatted: '40,0%', pointsText: null },
  ],
  sections: [
    { code: 'iso', label: 'Isolamento', value: 80, formatted: '80,0%', percent: true, reachedMark: true, pointsText: '4 de 5 pontos' },
    { code: 'bar', label: 'Barreira', value: 0, formatted: '0,0%', percent: true, reachedMark: false, pointsText: '0 de 1 ponto' },
  ],
};

afterEach(() => window.localStorage.clear());

describe('ResponseScorecardView — % | Pontos', () => {
  it('começa em %; "Pontos" troca seções e o % de seções no marco, a média fica em %', () => {
    render(<ResponseScorecardView scorecard={scorecard} />);
    expect(screen.getByText('80,0%')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pontos' }));

    expect(screen.getByText('4 de 5 pontos')).toBeInTheDocument();
    expect(screen.getByText('0 de 1 ponto')).toBeInTheDocument();
    expect(screen.getByText('1 de 2 seções')).toBeInTheDocument();
    expect(screen.getByText('40,0%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pontos' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('lembra a escolha: a próxima resposta aberta já vem em pontos', () => {
    const { unmount } = render(<ResponseScorecardView scorecard={scorecard} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pontos' }));
    unmount();
    expect(window.localStorage.getItem(SCORECARD_UNIT_STORAGE_KEY)).toBe('points');

    render(<ResponseScorecardView scorecard={scorecard} />);
    expect(screen.getByText('4 de 5 pontos')).toBeInTheDocument();
  });

  it('sem nada em pontos (notas sem pontos por opção), o seletor não aparece', () => {
    const semPontos: ResponseScorecard = {
      ...scorecard,
      results: scorecard.results.map((row) => ({ ...row, pointsText: null })),
      sections: scorecard.sections.map((row) => ({ ...row, pointsText: null })),
    };
    render(<ResponseScorecardView scorecard={semPontos} />);
    expect(screen.queryByRole('group', { name: 'Mostrar notas em' })).not.toBeInTheDocument();
  });
});
