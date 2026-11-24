import { pickScoreEntry, type ScoreEntryField } from './score-entry';

function calc(code: string, scoreRanges: unknown[], sectionOrder = 0, order = 0): ScoreEntryField {
  return { code, label: code.toUpperCase(), settingsJson: { scoreRanges }, sectionOrder, order };
}

describe('pickScoreEntry', () => {
  const pontos = calc('pontos', [
    { id: 'a', from: 20, label: 'A', phaseId: 'fase-a' },
    { id: 'b', from: 30, phaseId: 'fase-b' },
    { id: 'c', from: 50, phaseId: 'fase-c' },
  ]);

  it('devolve a faixa e a fase do resultado enviado', () => {
    expect(pickScoreEntry([pontos], new Map([['pontos', 35]]))).toEqual({
      fieldCode: 'pontos',
      fieldLabel: 'PONTOS',
      value: 35,
      range: { id: 'b', from: 30, phaseId: 'fase-b' },
    });
  });

  it('abaixo da primeira faixa ou sem resultado, nada muda', () => {
    expect(pickScoreEntry([pontos], new Map([['pontos', 19]]))).toBeNull();
    expect(pickScoreEntry([pontos], new Map([['pontos', null]]))).toBeNull();
    expect(pickScoreEntry([pontos], new Map())).toBeNull();
  });

  it('com dois cálculos com faixa, vale o primeiro do formulário que cair numa faixa', () => {
    const risco = calc('risco', [{ id: 'r', from: 0, phaseId: 'fase-r' }], 1, 0);
    const antes = calc('antes', [{ id: 'x', from: 100, phaseId: 'fase-x' }], 0, 5);
    const entry = pickScoreEntry([risco, antes, { ...pontos, sectionOrder: 2 }], new Map([
      ['antes', 10],
      ['risco', 4],
      ['pontos', 60],
    ]));
    expect(entry?.fieldCode).toBe('risco');
  });

  it('ignora faixa sem fase e cálculo sem faixas', () => {
    const semFase = calc('semfase', [{ id: 's', from: 0 }]);
    const semFaixa: ScoreEntryField = { ...pontos, code: 'total', settingsJson: { formula: '1' } };
    expect(pickScoreEntry([semFase, semFaixa], new Map([['semfase', 5], ['total', 5]]))).toBeNull();
  });
});
