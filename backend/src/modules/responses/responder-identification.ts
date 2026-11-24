import type { FieldErrorMap } from '../../common/exceptions/field-validation.exception';

/** Quem está logado no envio (token válido no `/responses/submit`), quando há. */
export type LoggedResponder = { email: string; fullName: string } | null;

export type ResponderIdentity = {
  responderName: string | null;
  responderEmail: string | null;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * `settingsJson.requireResponderIdentification` da versão publicada. Só `true` liga:
 * formulário sem a chave (todos antes dela existir) continua aceitando envio anônimo.
 */
export function requiresResponderIdentification(
  settings: Record<string, unknown> | null | undefined,
): boolean {
  return settings?.requireResponderIdentification === true;
}

function clean(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Nome e e-mail que vão para a resposta. Com identificação obrigatória e o campo em branco,
 * usa o usuário logado (o app mobile não tem o bloco de identificação). Sem a opção, grava
 * só o que veio — envio anônimo continua anônimo mesmo com alguém logado no navegador.
 */
export function resolveResponderIdentity(
  settings: Record<string, unknown> | null | undefined,
  payload: { responderName?: string | null; responderEmail?: string | null },
  loggedUser: LoggedResponder,
): ResponderIdentity {
  const name = clean(payload.responderName);
  const email = clean(payload.responderEmail);
  if (!requiresResponderIdentification(settings) || !loggedUser) {
    return { responderName: name, responderEmail: email };
  }
  return {
    responderName: name ?? clean(loggedUser.fullName),
    responderEmail: email ?? clean(loggedUser.email),
  };
}

/** Erros de identificação (chaves `responderName` / `responderEmail`); vazio quando passa. */
export function validateResponderIdentity(
  settings: Record<string, unknown> | null | undefined,
  identity: ResponderIdentity,
): FieldErrorMap {
  if (!requiresResponderIdentification(settings)) return {};
  const errors: FieldErrorMap = {};
  if (!identity.responderName) {
    errors.responderName = 'Informe seu nome.';
  }
  if (!identity.responderEmail) {
    errors.responderEmail = 'Informe seu e-mail.';
  } else if (!EMAIL_REGEX.test(identity.responderEmail)) {
    errors.responderEmail = 'Informe um e-mail válido.';
  }
  return errors;
}
