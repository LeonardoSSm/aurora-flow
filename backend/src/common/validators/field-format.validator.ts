function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function isRepeatedDigits(value: string): boolean {
  return /^(\d)\1+$/.test(value);
}

export function validateCpf(value: string): boolean {
  const digits = onlyDigits(value);
  if (digits.length !== 11 || isRepeatedDigits(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(digits[i]) * (10 - i);
  let v = (sum * 10) % 11;
  if (v === 10) v = 0;
  if (v !== Number(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(digits[i]) * (11 - i);
  v = (sum * 10) % 11;
  if (v === 10) v = 0;
  return v === Number(digits[10]);
}

export function validateCnpj(value: string): boolean {
  const digits = onlyDigits(value);
  if (digits.length !== 14 || isRepeatedDigits(digits)) return false;

  const calc = (base: string, weights: number[]): number => {
    const sum = base.split('').reduce((total, ch, i) => total + Number(ch) * weights[i], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const base = digits.slice(0, 12);
  const d1 = calc(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(`${base}${d1}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digits === `${base}${d1}${d2}`;
}

export function validateCep(value: string): boolean {
  return onlyDigits(value).length === 8;
}

export function validatePhone(value: string): boolean {
  const digits = onlyDigits(value);
  return digits.length === 10 || digits.length === 11;
}

export function validateEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// Accepts Brazilian-formatted currency strings ("1.234,56", "R$ 1.234,56") or plain numbers.
export function validateCurrency(value: string): boolean {
  if (value.trim() === '') return false;
  // Strip optional "R$ " prefix, thousand separators, then convert comma decimal to dot
  const stripped = value.trim().replace(/^R\$\s?/, '');
  const normalized = stripped.replace(/\./g, '').replace(',', '.');
  const n = Number(normalized);
  return !isNaN(n) && isFinite(n);
}

export function stripMask(value: string): string {
  return onlyDigits(value);
}
