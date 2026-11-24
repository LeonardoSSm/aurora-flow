import { describe, expect, it } from 'vitest';
import { formatBRL, formatBRLCompact } from './money';

describe('money', () => {
  it('formata em reais com espaço comum', () => {
    expect(formatBRL(1500.5)).toBe('R$ 1.500,50');
    expect(formatBRL(0)).toBe('R$ 0,00');
    expect(formatBRL(-12.3)).toBe('-R$ 12,30');
  });

  it('total compacto: completo até 100 mil, "mil" e "mi" acima', () => {
    expect(formatBRLCompact(1046.99)).toBe('R$ 1.046,99');
    expect(formatBRLCompact(99999.99)).toBe('R$ 99.999,99');
    expect(formatBRLCompact(123456)).toBe('R$ 123,5 mil');
    expect(formatBRLCompact(2500000)).toBe('R$ 2,5 mi');
  });
});
