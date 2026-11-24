import { api } from '../../services/api';
import type { FieldSettings, SuggestedUser } from '../forms/types';

/** Mínimo de letras para pesquisar entre todos os usuários no formulário publicado (igual ao backend). */
export const USER_SEARCH_MIN_CHARS = 3;

export const NOT_SUGGESTED_MESSAGE = 'Escolha um dos e-mails sugeridos.';

/** Formulário publicado: pesquisa de pessoas num campo "E-mail de usuário" sem lista própria. */
export async function searchUserEmailSuggestions(
  formId: string,
  fieldCode: string,
  q: string,
): Promise<SuggestedUser[]> {
  const { data } = await api.get<{ users: SuggestedUser[] }>(
    `/public/forms/${encodeURIComponent(formId)}/fields/${encodeURIComponent(fieldCode)}/user-suggestions`,
    { params: { q } },
  );
  return data.users;
}

/** Sem acento, sem maiúscula, sem espaço nas pontas. */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Pessoas cujo nome ou e-mail contém o texto. Texto vazio = todas. */
export function filterSuggestedUsers<T extends SuggestedUser>(users: T[], text: string): T[] {
  const needle = normalizeSearch(text);
  if (!needle) return users;
  return users.filter(
    (user) => normalizeSearch(user.name).includes(needle) || normalizeSearch(user.email).includes(needle),
  );
}

export function findUserByEmail(users: SuggestedUser[], email: string): SuggestedUser | undefined {
  const needle = email.trim().toLowerCase();
  if (!needle) return undefined;
  return users.find((user) => user.email.toLowerCase() === needle);
}

/**
 * Conferência no navegador da trava "só e-mails sugeridos" — só quando a lista inteira está à mão
 * (formulário publicado com pessoas escolhidas). Nos outros casos quem confere é o backend.
 */
export function userEmailSuggestionError(settings: FieldSettings, value: string): string | null {
  const suggestions = settings.userSuggestions;
  if (!suggestions?.onlySuggested || !suggestions.users) return null;
  return findUserByEmail(suggestions.users, value) ? null : NOT_SUGGESTED_MESSAGE;
}
