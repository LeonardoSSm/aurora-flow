import { normalizeEmailAddress, normalizePhoneNumber, normalizeWhatsAppAddress } from './address.util';

describe('address.util', () => {
  describe('normalizeEmailAddress', () => {
    it.each([
      ['Maria.Souza@Empresa.COM', 'maria.souza@empresa.com'],
      ['  a+tag@dominio.com.br  ', 'a+tag@dominio.com.br'],
    ])('normaliza %s', (input, expected) => {
      expect(normalizeEmailAddress(input)).toBe(expected);
    });

    it.each([
      '',
      null,
      undefined,
      'sem-arroba.com',
      'a@b',
      'a b@c.com',
      'a@b.com, c@d.com',
      '<a@b.com>',
      'a@b.com;c@d.com',
      '"x"@b.com',
      `${'a'.repeat(250)}@b.com`,
    ])('rejeita %p', (input) => {
      expect(normalizeEmailAddress(input as never)).toBeNull();
    });
  });

  describe('normalizePhoneNumber', () => {
    it.each([
      ['(85) 99999-1234', '5585999991234'],
      ['85999991234', '5585999991234'],
      ['085 99999-1234', '5585999991234'],
      ['+55 85 99999-1234', '5585999991234'],
      ['5585999991234', '5585999991234'],
      ['+1 415 555 2671', '14155552671'],
      ['8533331234', '558533331234'],
    ])('normaliza %s', (input, expected) => {
      expect(normalizePhoneNumber(input)).toBe(expected);
    });

    it('usa o DDI padrão informado', () => {
      expect(normalizePhoneNumber('912345678', '351')).toBe('351912345678');
    });

    it.each(['', null, undefined, 'abc', '123', '+12345', '1'.repeat(20)])('rejeita %p', (input) => {
      expect(normalizePhoneNumber(input as never)).toBeNull();
    });
  });

  describe('normalizeWhatsAppAddress', () => {
    it.each([
      ['120363025246125486@g.us', '120363025246125486@g.us'],
      ['  120363025246125486@G.US ', '120363025246125486@g.us'],
      ['5585999991234-1596737011@g.us', '5585999991234-1596737011@g.us'],
      ['(85) 99999-1234', '5585999991234'],
    ])('aceita %s', (input, expected) => {
      expect(normalizeWhatsAppAddress(input)).toBe(expected);
    });

    it.each(['', null, 'grupo@g.us', '123@g.us', '120363025246125486@s.whatsapp.net', 'abc'])(
      'rejeita %p',
      (input) => {
        expect(normalizeWhatsAppAddress(input as never)).toBeNull();
      },
    );
  });
});
