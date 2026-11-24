import type { CreateUserPayload, UpdateUserPayload } from '../services/admin-api';

/**
 * Como a pessoa entra pela primeira vez (só no convidar):
 * - invite: recebe o link por e-mail para criar a senha;
 * - password: o admin define a senha agora, sem e-mail;
 * - pre: pré-cadastro sem senha, entra com o Google corporativo.
 * Senha + convite juntos deixaram de existir de propósito (handoff do painel de usuários).
 */
export type FirstAccessMethod = 'invite' | 'password' | 'pre';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Mesma regra do backend (create/update-user.dto.ts): 8+, maiúscula, minúscula e número. */
export const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

export function isValidPassword(password: string): boolean {
  return PASSWORD_RE.test(password);
}

export type UserFormValues = {
  fullName: string;
  email: string;
  role: string;
  areaId: string;
  method: FirstAccessMethod;
  password: string;
};

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/** Regras do botão primário; `submitting` fica com quem chama. */
export function canSubmitUserForm(mode: 'create' | 'edit', values: UserFormValues): boolean {
  if (!values.fullName.trim() || !isValidEmail(values.email)) return false;
  if (mode === 'create') {
    return values.method !== 'password' || isValidPassword(values.password);
  }
  return values.password === '' || isValidPassword(values.password);
}

function basePayload(values: UserFormValues) {
  return {
    fullName: values.fullName.trim(),
    email: values.email.trim(),
    role: values.role,
    areaId: values.areaId || null,
  };
}

export function buildCreatePayload(values: UserFormValues): CreateUserPayload {
  const base = basePayload(values);
  switch (values.method) {
    case 'invite':
      return { ...base, sendInvite: true };
    case 'password':
      return { ...base, sendInvite: false, password: values.password };
    case 'pre':
      return { ...base, sendInvite: false };
  }
}

export function buildUpdatePayload(values: UserFormValues): UpdateUserPayload {
  const base = basePayload(values);
  return values.password ? { ...base, password: values.password } : base;
}
