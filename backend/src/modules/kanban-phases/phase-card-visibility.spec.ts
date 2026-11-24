import { answerTexts, canSeeCardInPhase, cardVisibilityFieldCodes, normalizeCardVisibility } from './phase-card-visibility';

describe('normalizeCardVisibility', () => {
  it('sem regra (ou só regras incompletas) vira null = filtro desligado', () => {
    expect(normalizeCardVisibility(null)).toBeNull();
    expect(normalizeCardVisibility({ rules: [], othersSeeAll: false })).toBeNull();
    expect(
      normalizeCardVisibility({
        rules: [
          { fieldCode: 'filial', values: [], roleCodes: ['a'], userIds: [] },
          { fieldCode: 'filial', values: ['SP'], roleCodes: [], userIds: [] },
          { fieldCode: 'campo inválido', values: ['SP'], roleCodes: ['a'], userIds: [] },
        ],
      }),
    ).toBeNull();
  });

  it('tira repetição e espaços; othersSeeAll só é false quando dito', () => {
    expect(
      normalizeCardVisibility({
        rules: [{ fieldCode: ' filial ', values: ['SP', ' SP', ''], roleCodes: ['a', 'a'], userIds: [] }],
      }),
    ).toEqual({ rules: [{ fieldCode: 'filial', values: ['SP'], roleCodes: ['a'], userIds: [] }], othersSeeAll: true });
    expect(
      normalizeCardVisibility({
        rules: [{ fieldCode: 'filial', values: ['SP'], roleCodes: ['a'], userIds: [] }],
        othersSeeAll: false,
      })?.othersSeeAll,
    ).toBe(false);
  });
});

describe('answerTexts', () => {
  it('lista múltipla, caixa, número e Lista do ERP viram textos comparáveis', () => {
    expect(answerTexts(['SP', 'RJ'])).toEqual(['SP', 'RJ']);
    expect(answerTexts(true)).toEqual(['true']);
    expect(answerTexts(false)).toEqual(['false']);
    expect(answerTexts(3)).toEqual(['3']);
    expect(answerTexts({ value: '001', label: 'Matriz', fonte: 'erp' })).toEqual(['001', 'Matriz']);
    expect(answerTexts('  ')).toEqual([]);
    expect(answerTexts(null)).toEqual([]);
  });
});

describe('canSeeCardInPhase', () => {
  const phase = {
    cardVisibility: {
      rules: [
        { fieldCode: 'filial', values: ['SP', 'Campinas'], roleCodes: ['comercial'], userIds: [] },
        { fieldCode: 'urgente', values: ['true'], roleCodes: [], userIds: ['u-chefe'] },
      ],
      othersSeeAll: true,
    },
  };
  const answers =
    (values: Record<string, unknown>) =>
    (code: string): unknown =>
      values[code];

  it('fase sem filtro e quem configura as fases veem tudo', () => {
    expect(canSeeCardInPhase({ cardVisibility: null }, { sub: 'x', role: 'y' }, false, answers({}))).toBe(true);
    expect(canSeeCardInPhase(phase, { sub: 'x', role: 'comercial' }, true, answers({ filial: 'RJ' }))).toBe(true);
  });

  it('quem está na regra vê só o que casa com um dos valores (sem diferença de maiúsculas)', () => {
    const comercial = { sub: 'x', role: 'comercial' };
    expect(canSeeCardInPhase(phase, comercial, false, answers({ filial: 'sp' }))).toBe(true);
    expect(canSeeCardInPhase(phase, comercial, false, answers({ filial: ['RJ', 'Campinas'] }))).toBe(true);
    expect(canSeeCardInPhase(phase, comercial, false, answers({ filial: 'RJ' }))).toBe(false);
    expect(canSeeCardInPhase(phase, comercial, false, answers({}))).toBe(false);
  });

  it('em duas regras, basta casar uma delas', () => {
    const chefe = { sub: 'u-chefe', role: 'comercial' };
    expect(canSeeCardInPhase(phase, chefe, false, answers({ filial: 'RJ', urgente: true }))).toBe(true);
    expect(canSeeCardInPhase(phase, chefe, false, answers({ filial: 'RJ', urgente: false }))).toBe(false);
  });

  it('quem não está em regra nenhuma segue othersSeeAll', () => {
    const outro = { sub: 'x', role: 'financeiro' };
    expect(canSeeCardInPhase(phase, outro, false, answers({ filial: 'RJ' }))).toBe(true);
    const closed = { cardVisibility: { ...phase.cardVisibility, othersSeeAll: false } };
    expect(canSeeCardInPhase(closed, outro, false, answers({ filial: 'SP' }))).toBe(false);
  });

  it('cardVisibilityFieldCodes lista os campos sem repetir', () => {
    expect(cardVisibilityFieldCodes(phase)).toEqual(['filial', 'urgente']);
    expect(cardVisibilityFieldCodes({ cardVisibility: null })).toEqual([]);
  });
});
