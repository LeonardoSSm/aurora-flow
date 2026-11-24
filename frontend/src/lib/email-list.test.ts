import { describe, expect, it } from 'vitest';
import { isValidEmail, MAX_EMAIL_LENGTH, parseEmailList } from './email-list';

describe('isValidEmail', () => {
  it.each(['gestor@tijucaalimentos.com', ' a@b.co ', 'nome.sobrenome+tag@dominio.com.br'])(
    'aceita %p',
    (value) => {
      expect(isValidEmail(value)).toBe(true);
    },
  );

  it.each(['', 'sem-arroba', 'a@b', 'a b@c.com', '<x>@y.com', `${'x'.repeat(MAX_EMAIL_LENGTH)}@d.com`])(
    'recusa %p',
    (value) => {
      expect(isValidEmail(value)).toBe(false);
    },
  );
});

describe('parseEmailList', () => {
  it('separa por vírgula, ponto e vírgula, espaço e quebra de linha', () => {
    expect(parseEmailList('a@x.com, b@x.com;c@x.com\nd@x.com e@x.com').emails).toEqual([
      'a@x.com',
      'b@x.com',
      'c@x.com',
      'd@x.com',
      'e@x.com',
    ]);
  });

  it('normaliza para minúsculas e remove repetidos', () => {
    expect(parseEmailList('A@X.com, a@x.COM').emails).toEqual(['a@x.com']);
  });

  it('separa o que não é e-mail para o usuário corrigir', () => {
    expect(parseEmailList('ok@x.com, lixo, outro@@x.com, lixo')).toEqual({
      emails: ['ok@x.com'],
      invalid: ['lixo', 'outro@@x.com'],
    });
  });

  it('texto vazio ou só separadores não gera nada', () => {
    expect(parseEmailList('  , ; \n')).toEqual({ emails: [], invalid: [] });
  });
});
