/**
 * "E-mail de usuário": um campo E-mail (`fieldType: 'email'`) com `settingsJson.userSuggestions`.
 * O valor gravado continua sendo só o e-mail digitado/escolhido — notificações, exportações e
 * `{{campo}}` tratam como qualquer e-mail.
 *
 * - `userIds` com gente: só essas pessoas aparecem como sugestão.
 * - `userIds` vazio: qualquer usuário ativo do sistema é sugerido (pesquisa pelo nome ou e-mail).
 * - `onlySuggested`: só aceita e-mail de quem pode ser sugerido; sem ele, qualquer e-mail vale.
 */
export type UserEmailSuggestions = {
  userIds: string[];
  onlySuggested: boolean;
};

/** O que o navegador recebe no formulário publicado: nunca os ids, só nome e e-mail. */
export type SuggestedUser = { name: string; email: string };

export type PublicUserEmailSuggestions = {
  onlySuggested: boolean;
  /** Presente quando o campo tem pessoas escolhidas; ausente = pesquisar entre todos os usuários. */
  users?: SuggestedUser[];
};

/** Mínimo de letras para pesquisar entre todos os usuários (formulário público é anônimo). */
export const USER_SEARCH_MIN_CHARS = 3;
/** Máximo de pessoas por pesquisa. */
export const USER_SEARCH_LIMIT = 8;
/** Teto de pessoas escolhidas num campo — evita configuração gigante. */
export const USER_SUGGESTIONS_MAX_USERS = 500;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lê a configuração do campo; `null` = campo E-mail comum. Tolera lixo (ignora ids inválidos). */
export function parseUserEmailSuggestions(settings: unknown): UserEmailSuggestions | null {
  if (!settings || typeof settings !== 'object') return null;
  const raw = (settings as Record<string, unknown>).userSuggestions;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const userIds = Array.isArray(record.userIds)
    ? [
        ...new Set(
          record.userIds.filter(
            (id): id is string => typeof id === 'string' && UUID_PATTERN.test(id),
          ),
        ),
      ].slice(0, USER_SUGGESTIONS_MAX_USERS)
    : [];
  return { userIds, onlySuggested: record.onlySuggested === true };
}

/** Configuração sem as sugestões (o resto do campo, como veio). */
export function withoutUserSuggestions(
  settings: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const { userSuggestions: _userSuggestions, ...rest } = settings ?? {};
  return rest;
}

/** Comparação de e-mail: sem espaços nas pontas e sem diferença de maiúscula. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}
