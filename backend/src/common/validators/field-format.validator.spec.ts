import {
  stripMask,
  validateCep,
  validateCnpj,
  validateCpf,
  validateCurrency,
  validateEmail,
  validatePhone,
} from './field-format.validator';

// ─── CPF ─────────────────────────────────────────────────────────────────────

describe('validateCpf', () => {
  it.each([
    '529.982.247-25',
    '52998224725', // same, no mask
    '111.444.777-35',
    '123.456.789-09', // computed: check digits 09
    '000.000.001-91', // computed: check digits 91
  ])('accepts valid CPF %s', (cpf) => {
    expect(validateCpf(cpf)).toBe(true);
  });

  it.each([
    '123.456.789-00', // invalid check digits
    '000.000.000-00', // all zeros
    '111.111.111-11', // repeated digits
    '999.999.999-99', // repeated digits
    '12345678', // too short
    '529.982.247-26', // off by one
    '',
    'abc.def.ghi-jk',
  ])('rejects invalid CPF %s', (cpf) => {
    expect(validateCpf(cpf)).toBe(false);
  });
});

// ─── CNPJ ────────────────────────────────────────────────────────────────────

describe('validateCnpj', () => {
  it.each(['11.222.333/0001-81', '11222333000181', '45.997.418/0001-53', '11.444.777/0001-61'])(
    'accepts valid CNPJ %s',
    (cnpj) => {
      expect(validateCnpj(cnpj)).toBe(true);
    },
  );

  it.each([
    '00.000.000/0000-00', // all zeros
    '11.111.111/1111-11', // repeated digits
    '12.345.678/0001-00', // invalid check digits
    '1234567890123', // too short (13 digits)
    '',
  ])('rejects invalid CNPJ %s', (cnpj) => {
    expect(validateCnpj(cnpj)).toBe(false);
  });
});

// ─── CEP ─────────────────────────────────────────────────────────────────────

describe('validateCep', () => {
  it.each([
    '01310-100', // São Paulo, with mask
    '01310100', // without mask
    '70040-010', // Brasília, with mask
    '70040010', // without mask
  ])('accepts valid CEP %s', (cep) => {
    expect(validateCep(cep)).toBe(true);
  });

  it.each([
    '0131010', // 7 digits
    '013101000', // 9 digits
    '',
    'ABCDE-FGH',
  ])('rejects invalid CEP %s', (cep) => {
    expect(validateCep(cep)).toBe(false);
  });
});

// ─── Phone ───────────────────────────────────────────────────────────────────

describe('validatePhone', () => {
  it.each([
    '11 99999-9999', // 11 digits with mask (mobile)
    '11999999999', // 11 digits without mask
    '11 3333-4444', // 10 digits with mask (landline)
    '1133334444', // 10 digits without mask
    '(21) 98765-4321',
    '(21) 3333-4444',
  ])('accepts valid phone %s', (phone) => {
    expect(validatePhone(phone)).toBe(true);
  });

  it.each([
    '119999', // too short (6 digits)
    '119999999999', // too long (12 digits)
    '',
    'abcdefghij',
  ])('rejects invalid phone %s', (phone) => {
    expect(validatePhone(phone)).toBe(false);
  });
});

// ─── Email ───────────────────────────────────────────────────────────────────

describe('validateEmail', () => {
  it.each(['user@example.com', 'user.name+tag@sub.domain.org', 'a@b.co', 'test@formhub.com.br'])(
    'accepts valid email %s',
    (email) => {
      expect(validateEmail(email)).toBe(true);
    },
  );

  it.each(['not-an-email', '@nodomain.com', 'user@', 'user @example.com', ''])(
    'rejects invalid email %s',
    (email) => {
      expect(validateEmail(email)).toBe(false);
    },
  );
});

// ─── Currency ─────────────────────────────────────────────────────────────────

describe('validateCurrency', () => {
  it.each([
    '1234',
    '1234.56',
    '1.234,56', // Brazilian format
    '1.234.567,89',
    'R$ 1.500,00', // with "R$ " prefix (stored by frontend)
    'R$ 0,00',
    '0',
    '-50,00',
  ])('accepts valid currency string %s', (value) => {
    expect(validateCurrency(value)).toBe(true);
  });

  it.each([
    '',
    '   ',
    'abc',
    '12,34,56', // multiple commas after stripping dots
  ])('rejects invalid currency string %s', (value) => {
    expect(validateCurrency(value)).toBe(false);
  });
});

// ─── stripMask ────────────────────────────────────────────────────────────────

describe('stripMask', () => {
  it('removes dots, dashes and slashes from CPF/CNPJ/CEP', () => {
    expect(stripMask('529.982.247-25')).toBe('52998224725');
    expect(stripMask('11.222.333/0001-81')).toBe('11222333000181');
    expect(stripMask('01310-100')).toBe('01310100');
  });

  it('returns plain digits unchanged', () => {
    expect(stripMask('12345678')).toBe('12345678');
  });

  it('returns empty string for empty input', () => {
    expect(stripMask('')).toBe('');
  });
});
