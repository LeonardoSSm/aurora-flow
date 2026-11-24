import {
  computeCalculatedFieldValues,
  getFormulaOptionScores,
  scoreOptionAnswer,
} from './formula.engine';
import { describeScoreRange, findScoreRange, getScoreRanges } from './score-ranges';

describe('pontuação por opção no campo calculado', () => {
  const optionScores = {
    p1: { a: 10, b: 5 },
    p2: { a: 20, b: 0 },
    p3: { sim: 3, nao: 1, talvez: 2 },
  };

  function score(values: Record<string, unknown>, formula = 'SOMA({p1}; {p2}; {p3})'): number | null {
    return computeCalculatedFieldValues([{ code: 'pontos', formula, decimals: 0, optionScores }], values)
      .pontos;
  }

  it('soma os pontos da opção escolhida em cada pergunta', () => {
    expect(score({ p1: 'a', p2: 'b', p3: 'sim' })).toBe(13);
    expect(score({ p1: 'b', p2: 'a', p3: 'nao' })).toBe(26);
  });

  it('várias marcadas somam os pontos de cada uma', () => {
    expect(score({ p1: 'a', p3: ['sim', 'talvez'] })).toBe(15);
  });

  it('opção sem pontos vale 0 e pergunta em branco não entra', () => {
    expect(score({ p1: 'c', p2: 'a' })).toBe(20);
    expect(score({ p1: null, p2: '', p3: [] })).toBeNull();
  });

  it('só o cálculo que pontua lê os pontos; os outros seguem o de-para comum', () => {
    const values = computeCalculatedFieldValues(
      [
        { code: 'pontos', formula: '{p1} + {p2}', optionScores },
        { code: 'dobro', formula: '{pontos} * 2' },
        { code: 'cru', formula: '{p1} + 1' },
      ],
      { p1: 'a', p2: 'a' },
    );
    expect(values).toEqual({ pontos: 30, dobro: 60, cru: null });
  });

  it('scoreOptionAnswer converte o valor para texto antes de procurar', () => {
    expect(scoreOptionAnswer(1, { '1': 7 })).toBe(7);
    expect(scoreOptionAnswer(undefined, { a: 1 })).toBeNull();
  });

  it('getFormulaOptionScores descarta pontos que não são número', () => {
    expect(
      getFormulaOptionScores({ optionScores: { p1: { a: 10, b: '5', c: Number.NaN }, p2: 'x' } }),
    ).toEqual({ p1: { a: 10 } });
    expect(getFormulaOptionScores({})).toBeNull();
    expect(getFormulaOptionScores(null)).toBeNull();
  });
});

describe('faixas do resultado', () => {
  const ranges = getScoreRanges({
    scoreRanges: [
      { id: 'c', from: 50, label: 'C', phaseId: 'fase-c' },
      { id: 'a', from: 20, label: 'A', phaseId: 'fase-a' },
      { id: 'b', from: 30, label: ' ', phaseId: 'fase-b' },
      { id: 'x', from: 'dez', phaseId: 'fase-x' },
    ],
  });

  it('ordena pelo início e ignora faixa sem início numérico', () => {
    expect(ranges.map((range) => range.id)).toEqual(['a', 'b', 'c']);
    expect(ranges[1].label).toBeUndefined();
  });

  it('cada faixa vai do seu início até a próxima', () => {
    expect(findScoreRange(ranges, 19.99)).toBeNull();
    expect(findScoreRange(ranges, 20)?.id).toBe('a');
    expect(findScoreRange(ranges, 29)?.id).toBe('a');
    expect(findScoreRange(ranges, 30)?.id).toBe('b');
    expect(findScoreRange(ranges, 49)?.id).toBe('b');
    expect(findScoreRange(ranges, 50)?.id).toBe('c');
    expect(findScoreRange(ranges, 1000)?.id).toBe('c');
    expect(findScoreRange(ranges, null)).toBeNull();
  });

  it('descreve a faixa pelo nome ou pelo início', () => {
    expect(describeScoreRange(ranges[0])).toBe('A');
    expect(describeScoreRange(ranges[1])).toBe('a partir de 30');
  });
});

describe('pontuação por seção: CONFORMIDADE, ATINGIRAM e MEDIAPREENCHIDOS', () => {
  const simNao = { opcao_1: 1, opcao_2: 0 };
  const optionScores = {
    q1: simNao,
    q2: simNao,
    q3: { opcao_1: 1, opcao_2: 0, opcao_3: null },
    // Pergunta "negativa" (Sim é ruim): pontos invertidos.
    q4: { opcao_1: 0, opcao_2: 1 },
  };

  function conformity(values: Record<string, unknown>): number | null {
    return computeCalculatedFieldValues(
      [{ code: 'conf', formula: 'CONFORMIDADE({q1}; {q2}; {q3}; {q4})', decimals: 1, optionScores }],
      values,
    ).conf;
  }

  it('% dos pontos obtidos sobre o máximo das perguntas respondidas', () => {
    expect(conformity({ q1: 'opcao_1', q2: 'opcao_1', q3: 'opcao_1', q4: 'opcao_2' })).toBe(100);
    expect(conformity({ q1: 'opcao_1', q2: 'opcao_2', q3: 'opcao_2', q4: 'opcao_1' })).toBe(25);
    expect(conformity({ q1: 'opcao_1', q2: 'opcao_2', q3: 'opcao_1' })).toBe(66.7);
  });

  it('opção que não conta (Não se aplica) sai da pontuação e do máximo', () => {
    expect(conformity({ q1: 'opcao_1', q2: 'opcao_2', q3: 'opcao_3', q4: 'opcao_2' })).toBe(66.7);
  });

  it('sem nenhuma pergunta que conte, a seção fica sem nota', () => {
    expect(conformity({})).toBeNull();
    expect(conformity({ q3: 'opcao_3' })).toBeNull();
  });

  it('ATINGIRAM: % das seções com nota iguais ou acima do marco; seção sem nota fica de fora', () => {
    const values = computeCalculatedFieldValues(
      [
        { code: 'secA', formula: 'CONFORMIDADE({q1}; {q2})', decimals: 1, optionScores },
        { code: 'secB', formula: 'CONFORMIDADE({q3}; {q4})', decimals: 1, optionScores },
        // Seção do outro caminho do formulário: ninguém respondeu.
        { code: 'secC', formula: 'CONFORMIDADE({x1})', decimals: 1, optionScores: { x1: simNao } },
        { code: 'geral', formula: 'ATINGIRAM(70; {secA}; {secB}; {secC})', decimals: 1 },
        { code: 'media', formula: 'MEDIAPREENCHIDOS({secA}; {secB}; {secC})', decimals: 1 },
      ],
      { q1: 'opcao_1', q2: 'opcao_1', q3: 'opcao_1', q4: 'opcao_1' },
    );
    // secA = 100 (atingiu), secB = 50 (não atingiu), secC sem nota.
    expect(values).toEqual({ secA: 100, secB: 50, secC: null, geral: 50, media: 75 });
  });

  it('marco é "igual ou acima": 70 conta como atingido', () => {
    const values = computeCalculatedFieldValues(
      [{ code: 'geral', formula: 'ATINGIRAM(70; {a}; {b}; {c})', decimals: 1 }],
      { a: 70, b: 69.9, c: 100 },
    );
    expect(values.geral).toBe(66.7);
  });

  it('getFormulaOptionScores guarda o "não conta" (null)', () => {
    expect(getFormulaOptionScores({ optionScores: { q3: { opcao_1: 1, opcao_3: null } } })).toEqual({
      q3: { opcao_1: 1, opcao_3: null },
    });
  });
});
