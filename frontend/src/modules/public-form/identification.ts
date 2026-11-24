import type { FormVersionSettings } from '../forms/types';

export type ResponderIdentificationMode = {
  /** Mostra o bloco de nome/e-mail no topo. */
  show: boolean;
  /** Nome e e-mail obrigatórios — força `show`. */
  required: boolean;
};

export type ResponderIdentificationErrors = {
  responderName?: string;
  responderEmail?: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Lê as duas chaves do `settingsJson`. Sem nenhuma (formulário antigo) o bloco aparece e é
 * opcional, igual sempre foi. Obrigatória liga o bloco mesmo que "mostrar" esteja desligado.
 */
export function getResponderIdentificationMode(
  settings: FormVersionSettings | null | undefined,
): ResponderIdentificationMode {
  const required = settings?.requireResponderIdentification === true;
  return { required, show: required || (settings?.showResponderIdentification ?? true) };
}

/**
 * Liga/desliga uma das duas chaves no construtor mantendo as duas coerentes: obrigatória
 * liga também "mostrar"; desligar "mostrar" desliga também "obrigatória".
 */
export function applyIdentificationToggle(
  settings: FormVersionSettings,
  key: 'show' | 'required',
  checked: boolean,
): FormVersionSettings {
  if (key === 'required') {
    return checked
      ? { ...settings, requireResponderIdentification: true, showResponderIdentification: true }
      : { ...settings, requireResponderIdentification: false };
  }
  return checked
    ? { ...settings, showResponderIdentification: true }
    : { ...settings, showResponderIdentification: false, requireResponderIdentification: false };
}

/** Mesma regra do backend (`responder-identification.ts`); e-mail preenchido sempre precisa ser válido. */
export function validateResponderIdentification(
  name: string,
  email: string,
  required: boolean,
): ResponderIdentificationErrors {
  const errors: ResponderIdentificationErrors = {};
  const trimmedEmail = email.trim();
  if (required && !name.trim()) {
    errors.responderName = 'Informe seu nome.';
  }
  if (trimmedEmail) {
    if (!EMAIL_REGEX.test(trimmedEmail)) errors.responderEmail = 'Informe um e-mail válido.';
  } else if (required) {
    errors.responderEmail = 'Informe seu e-mail.';
  }
  return errors;
}

/** Erros de identificação devolvidos pelo backend (422 com `responderName`/`responderEmail`). */
export function pickIdentificationErrors(
  apiErrors: Record<string, string> | null | undefined,
): ResponderIdentificationErrors {
  const errors: ResponderIdentificationErrors = {};
  if (apiErrors?.responderName) errors.responderName = apiErrors.responderName;
  if (apiErrors?.responderEmail) errors.responderEmail = apiErrors.responderEmail;
  return errors;
}
