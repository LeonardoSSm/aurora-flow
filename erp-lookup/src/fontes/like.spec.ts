import { padraoContem } from './like';

describe('padraoContem', () => {
  it('envolve o texto em % para buscar em qualquer posição', () => {
    expect(padraoContem('cafe')).toBe('%cafe%');
  });

  it('transforma % e _ digitados em literais', () => {
    expect(padraoContem('100%')).toBe('%100!%%');
    expect(padraoContem('a_b')).toBe('%a!_b%');
  });

  it('escapa o próprio caractere de escape', () => {
    expect(padraoContem('oi!')).toBe('%oi!!%');
  });
});
