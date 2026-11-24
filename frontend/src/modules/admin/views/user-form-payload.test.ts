import { describe, expect, it } from 'vitest';
import {
  buildCreatePayload,
  buildUpdatePayload,
  canSubmitUserForm,
  type UserFormValues,
} from './user-form-payload';

const base: UserFormValues = {
  fullName: '  Ana Souza ',
  email: ' ana@tijucaalimentos.com ',
  role: 'editor',
  areaId: '',
  method: 'invite',
  password: '',
};

describe('buildCreatePayload', () => {
  it('invite: manda convite e nenhuma senha', () => {
    expect(buildCreatePayload(base)).toEqual({
      fullName: 'Ana Souza',
      email: 'ana@tijucaalimentos.com',
      role: 'editor',
      areaId: null,
      sendInvite: true,
    });
  });

  it('password: senha digitada e sem convite, mesmo que a senha tenha ficado de outro método', () => {
    expect(
      buildCreatePayload({ ...base, method: 'password', password: 'Senha123', areaId: 'a1' }),
    ).toEqual({
      fullName: 'Ana Souza',
      email: 'ana@tijucaalimentos.com',
      role: 'editor',
      areaId: 'a1',
      sendInvite: false,
      password: 'Senha123',
    });
  });

  it('pre: sem convite e sem senha (descarta senha digitada antes de trocar de método)', () => {
    const payload = buildCreatePayload({ ...base, method: 'pre', password: 'Senha123' });
    expect(payload).toEqual({
      fullName: 'Ana Souza',
      email: 'ana@tijucaalimentos.com',
      role: 'editor',
      areaId: null,
      sendInvite: false,
    });
    expect(payload).not.toHaveProperty('password');
  });

  it('invite descarta senha digitada no método "password"', () => {
    expect(buildCreatePayload({ ...base, password: 'Senha123' })).not.toHaveProperty('password');
  });
});

describe('buildUpdatePayload', () => {
  it('sem senha não manda a chave password', () => {
    expect(buildUpdatePayload({ ...base, areaId: 'a1' })).toEqual({
      fullName: 'Ana Souza',
      email: 'ana@tijucaalimentos.com',
      role: 'editor',
      areaId: 'a1',
    });
  });

  it('com senha manda a nova senha', () => {
    expect(buildUpdatePayload({ ...base, password: 'Nova1234' })).toMatchObject({
      password: 'Nova1234',
    });
  });
});

describe('canSubmitUserForm', () => {
  it('exige nome e e-mail válido', () => {
    expect(canSubmitUserForm('create', base)).toBe(true);
    expect(canSubmitUserForm('create', { ...base, fullName: '   ' })).toBe(false);
    expect(canSubmitUserForm('create', { ...base, email: 'ana@' })).toBe(false);
    expect(canSubmitUserForm('create', { ...base, email: 'ana tijuca@x.com' })).toBe(false);
  });

  it('create + password segue a regra do backend; os outros métodos ignoram a senha', () => {
    expect(canSubmitUserForm('create', { ...base, method: 'password', password: '' })).toBe(false);
    expect(canSubmitUserForm('create', { ...base, method: 'password', password: 'Abc1234' })).toBe(
      false,
    );
    // 8+ caracteres, mas sem maiúscula / minúscula / número: o servidor recusaria.
    for (const password of ['abcdefgh', 'ABCDEFG1', 'abcdefg1', 'Abcdefgh']) {
      expect(canSubmitUserForm('create', { ...base, method: 'password', password })).toBe(false);
    }
    expect(canSubmitUserForm('create', { ...base, method: 'password', password: 'Abc12345' })).toBe(
      true,
    );
    expect(canSubmitUserForm('create', { ...base, method: 'pre', password: 'x' })).toBe(true);
  });

  it('edit: senha é opcional, mas se preenchida segue a regra do backend', () => {
    expect(canSubmitUserForm('edit', base)).toBe(true);
    expect(canSubmitUserForm('edit', { ...base, password: 'curta' })).toBe(false);
    expect(canSubmitUserForm('edit', { ...base, password: 'semnumero' })).toBe(false);
    expect(canSubmitUserForm('edit', { ...base, password: 'Longa1234' })).toBe(true);
  });
});
