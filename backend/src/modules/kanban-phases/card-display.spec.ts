import {
  CARD_DISPLAY_MAX_FIELDS,
  DEFAULT_CARD_DISPLAY,
  effectiveCardDisplay,
  formatCardFieldValue,
  normalizeCardDisplay,
  type CardFieldMeta,
} from './card-display';

function meta(fieldType: string, extra: Partial<CardFieldMeta> = {}): CardFieldMeta {
  return { code: 'campo', label: 'Campo', fieldType, options: new Map(), hours: false, phaseLabel: null, ...extra };
}

describe('normalizeCardDisplay', () => {
  it('descarta indicador desconhecido e repetido, mantendo a ordem', () => {
    expect(normalizeCardDisplay({ indicators: ['priority', 'xpto', 'priority', 'requester'], fields: [] })).toEqual({
      indicators: ['priority', 'requester'],
      fields: [],
    });
  });

  it('aceita campos com código válido, sem repetir, com rótulo aparado ou null', () => {
    expect(
      normalizeCardDisplay({
        indicators: [],
        fields: [
          { fieldCode: 'valor_total', label: '  Total  ' },
          { fieldCode: 'valor_total', label: 'de novo' },
          { fieldCode: 'tem espaço' },
          { fieldCode: 'fornecedor', label: '   ' },
          'lixo',
        ],
      }),
    ).toEqual({
      indicators: [],
      fields: [
        { fieldCode: 'valor_total', label: 'Total' },
        { fieldCode: 'fornecedor', label: null },
      ],
    });
  });

  it('para no limite de campos', () => {
    const fields = Array.from({ length: CARD_DISPLAY_MAX_FIELDS + 3 }, (_, index) => ({ fieldCode: `c${index}` }));
    expect(normalizeCardDisplay({ indicators: [], fields })?.fields).toHaveLength(CARD_DISPLAY_MAX_FIELDS);
  });

  it('não objeto vira null (= sem configuração)', () => {
    expect(normalizeCardDisplay(null)).toBeNull();
    expect(normalizeCardDisplay('x')).toBeNull();
    expect(normalizeCardDisplay([])).toBeNull();
  });

  it('card "vazio" (nada ligado) é uma escolha válida, não volta ao padrão', () => {
    expect(normalizeCardDisplay({ indicators: [], fields: [] })).toEqual({ indicators: [], fields: [] });
  });
});

describe('effectiveCardDisplay', () => {
  const phase = { indicators: ['priority'], fields: [] };
  const mine = { indicators: ['requester'], fields: [{ fieldCode: 'x', label: null }] };

  it('ajuste pessoal ganha do padrão da fase', () => {
    expect(effectiveCardDisplay(mine, phase)).toEqual({ display: mine, source: 'personal' });
  });

  it('sem ajuste vale o da fase', () => {
    expect(effectiveCardDisplay(undefined, phase)).toEqual({ display: phase, source: 'phase' });
  });

  it('sem nenhum vale o padrão do sistema (o card de antes)', () => {
    expect(effectiveCardDisplay(null, null)).toEqual({ display: DEFAULT_CARD_DISPLAY, source: 'default' });
    expect(DEFAULT_CARD_DISPLAY.indicators).toEqual(
      expect.arrayContaining(['process', 'priority', 'value', 'sla', 'phase_sla', 'assignee', 'updated_at']),
    );
  });
});

describe('formatCardFieldValue', () => {
  it('vazio não aparece', () => {
    expect(formatCardFieldValue(null, meta('short_text'))).toBeNull();
    expect(formatCardFieldValue('  ', meta('short_text'))).toBeNull();
    expect(formatCardFieldValue([], meta('multi_select'))).toBeNull();
  });

  it('lista mostra o rótulo da opção, não o código', () => {
    const options = new Map([
      ['sp', 'São Paulo'],
      ['rj', 'Rio de Janeiro'],
    ]);
    expect(formatCardFieldValue('sp', meta('single_select', { options }))).toBe('São Paulo');
    expect(formatCardFieldValue(['sp', 'rj'], meta('multi_select', { options }))).toBe('São Paulo, Rio de Janeiro');
    // Opção que saiu da lista: mostra o valor gravado.
    expect(formatCardFieldValue('mg', meta('single_select', { options }))).toBe('mg');
  });

  it('caixa vira Sim/Não', () => {
    expect(formatCardFieldValue(true, meta('checkbox'))).toBe('Sim');
    expect(formatCardFieldValue('false', meta('checkbox'))).toBe('Não');
  });

  it('valor, cálculo e número no formato brasileiro', () => {
    expect(formatCardFieldValue(1234.5, meta('currency'))).toBe('R$ 1.234,50');
    expect(formatCardFieldValue('R$ 99,90', meta('currency'))).toBe('R$ 99,90');
    expect(formatCardFieldValue(10, meta('calculated'))).toBe('R$ 10,00');
    expect(formatCardFieldValue(8.5, meta('calculated', { hours: true }))).toBe('8h30');
    expect(formatCardFieldValue(1500.25, meta('number'))).toBe('1.500,25');
  });

  it('data em dd/mm/aaaa', () => {
    expect(formatCardFieldValue('2026-11-13', meta('date'))).toBe('13/11/2026');
    expect(formatCardFieldValue('2026-11-13T13:05:00.000Z', meta('datetime'))).toBe('13/11/2026 10:05');
  });

  it('lista do ERP mostra o nome; tabela de itens mostra quantos', () => {
    expect(formatCardFieldValue({ value: '001', label: 'Fornecedor X' }, meta('erp_lookup'))).toBe('Fornecedor X');
    expect(formatCardFieldValue([{ a: 1 }, { a: 2 }], meta('item_order'))).toBe('2 itens');
    expect(formatCardFieldValue([{ a: 1 }], meta('erp_table'))).toBe('1 item');
  });

  it('texto longo é cortado com reticências', () => {
    const text = formatCardFieldValue('a'.repeat(500), meta('long_text')) as string;
    expect(text.length).toBeLessThanOrEqual(140);
    expect(text.endsWith('…')).toBe(true);
  });

  it('arquivo e campos de layout nunca aparecem', () => {
    expect(formatCardFieldValue('foto.png', meta('file_upload'))).toBeNull();
    expect(formatCardFieldValue('x', meta('title'))).toBeNull();
  });

  it('objeto qualquer sem rótulo não vira JSON no card', () => {
    expect(formatCardFieldValue({ foo: 'bar' }, meta('short_text'))).toBeNull();
  });
});
