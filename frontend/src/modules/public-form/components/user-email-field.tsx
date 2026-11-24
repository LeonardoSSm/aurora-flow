import { keepPreviousData, useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Loader2, Search, UserRound } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import type { SuggestedUser } from '../../forms/types';
import { fetchAssignableUsers } from '../../users/services/users-api';
import type { PublicAnswerValue, PublicFormField } from '../types';
import {
  filterSuggestedUsers,
  findUserByEmail,
  searchUserEmailSuggestions,
  USER_SEARCH_MIN_CHARS,
} from '../user-email';

const DEBOUNCE_MS = 250;
/** Quantas pessoas a lista mostra de uma vez (rola se passar). */
const MAX_VISIBLE = 50;

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/**
 * De onde vêm as pessoas:
 * - `list`: formulário publicado com pessoas escolhidas (vêm junto do formulário, nome + e-mail);
 * - `remote`: formulário publicado sem pessoas escolhidas — pesquisa no backend (mínimo de letras);
 * - `internal`: pré-visualização no construtor e campo de fase (quem está logado) — lista de
 *   usuários ativos do sistema, filtrada pelas pessoas escolhidas, se houver.
 */
type Source = 'list' | 'remote' | 'internal';

function sourceOf(field: PublicFormField, formId?: string): Source {
  const suggestions = field.settingsJson.userSuggestions;
  if (suggestions?.users) return 'list';
  if ((suggestions?.userIds?.length ?? 0) === 0 && formId) return 'remote';
  return 'internal';
}

function useSuggestedUsers(field: PublicFormField, formId: string | undefined, text: string) {
  const source = sourceOf(field, formId);
  const suggestions = field.settingsJson.userSuggestions;
  const chosenIds = useMemo(() => suggestions?.userIds ?? [], [suggestions?.userIds]);
  const debounced = useDebounced(text.trim(), DEBOUNCE_MS);

  const internal = useQuery({
    queryKey: ['users', 'assignable', 'all'],
    queryFn: () => fetchAssignableUsers(),
    enabled: source === 'internal',
    staleTime: 5 * 60_000,
    retry: false,
  });

  const remoteEnabled = source === 'remote' && debounced.length >= USER_SEARCH_MIN_CHARS;
  const remote = useQuery({
    queryKey: ['user-email-suggestions', formId ?? '', field.code, debounced],
    queryFn: () => searchUserEmailSuggestions(formId ?? '', field.code, debounced),
    enabled: remoteEnabled,
    staleTime: 30_000,
    retry: false,
    placeholderData: keepPreviousData,
  });

  // Todas as pessoas que podem ser sugeridas e que já conhecemos (para achar nome pelo e-mail).
  const known: SuggestedUser[] = useMemo(() => {
    if (source === 'list') return suggestions?.users ?? [];
    if (source === 'remote') return remote.data ?? [];
    const all = (internal.data ?? []).map((user) => ({ id: user.id, name: user.fullName, email: user.email }));
    const filtered = chosenIds.length > 0 ? all.filter((user) => chosenIds.includes(user.id)) : all;
    return filtered.map(({ name, email }) => ({ name, email }));
  }, [source, suggestions?.users, remote.data, internal.data, chosenIds]);

  // Lista inteira de quem tem pessoas escolhidas aparece já ao focar; entre todos os usuários,
  // só depois de digitar (no publicado, o mínimo de letras).
  const needsText = chosenIds.length === 0 && !suggestions?.users;
  const minChars = source === 'remote' ? USER_SEARCH_MIN_CHARS : needsText ? 1 : 0;
  const matches =
    text.trim().length < minChars
      ? []
      : source === 'remote'
        ? known
        : filterSuggestedUsers(known, text);

  const error = source === 'remote' ? remote.error : source === 'internal' ? internal.error : null;
  return {
    known,
    matches: matches.slice(0, MAX_VISIBLE),
    minChars,
    loading: (source === 'remote' && remote.isFetching) || (source === 'internal' && internal.isLoading),
    error,
  };
}

function describeError(error: unknown): string {
  if (axios.isAxiosError(error) && error.response?.status === 429) {
    return 'Muitas pesquisas seguidas. Espere alguns segundos e tente de novo.';
  }
  return 'Não foi possível carregar as sugestões agora. Digite o e-mail completo.';
}

function PersonLine({ user }: { user: SuggestedUser }) {
  return (
    <span className="flex min-w-0 flex-col" style={{ gap: 1 }}>
      <span className="truncate font-semibold" style={{ fontSize: 13, color: 'var(--tf-text)' }}>
        {user.name}
      </span>
      <span className="truncate" style={{ fontSize: 12, color: 'var(--tf-text-muted)' }}>
        {user.email}
      </span>
    </span>
  );
}

/**
 * Campo "E-mail de usuário": e-mail com sugestões de usuários do sistema (nome e e-mail de cada
 * um). Sem a trava, aceita qualquer e-mail digitado; com "só e-mails sugeridos", é preciso
 * escolher alguém da lista.
 */
export function UserEmailField({
  field,
  value,
  formId,
  invalid,
  onChange,
  inputStyle,
}: {
  field: PublicFormField;
  value: PublicAnswerValue;
  formId?: string;
  invalid?: boolean;
  onChange: (value: PublicAnswerValue) => void;
  inputStyle: React.CSSProperties;
}) {
  const onlySuggested = field.settingsJson.userSuggestions?.onlySuggested === true;
  const current = typeof value === 'string' ? value : '';
  const listId = useId();

  // Com a trava, o texto é só a pesquisa (o valor é o e-mail escolhido); sem ela, é o próprio valor.
  const [searchText, setSearchText] = useState('');
  const text = onlySuggested ? searchText : current;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // Nome de quem foi escolhido — a pesquisa remota pode não ter mais a pessoa na lista.
  const [picked, setPicked] = useState<SuggestedUser | null>(null);

  const { known, matches, minChars, loading, error } = useSuggestedUsers(field, formId, text);
  const selectedUser =
    (picked && picked.email.toLowerCase() === current.trim().toLowerCase() ? picked : undefined) ??
    findUserByEmail(known, current);

  // Sem a trava: não mostra a lista quando o texto já é exatamente o e-mail de uma sugestão.
  const visible =
    open &&
    matches.length > 0 &&
    !(matches.length === 1 && matches[0].email.toLowerCase() === text.trim().toLowerCase());

  useEffect(() => setActive(0), [text]);

  const choose = (user: SuggestedUser) => {
    setPicked(user);
    setSearchText('');
    setOpen(false);
    onChange(user.email);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(index + 1, Math.max(matches.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      if (visible && matches[active]) {
        event.preventDefault();
        choose(matches[active]);
      } else if (onlySuggested) {
        event.preventDefault();
      }
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    }
  };

  if (onlySuggested && current) {
    return (
      <div
        className="flex items-center gap-2.5"
        style={{
          padding: '8px 10px 8px 12px',
          borderRadius: 8,
          border: '1px solid var(--tf-primary)',
          background: 'var(--tf-primary-light)',
        }}
      >
        <UserRound aria-hidden className="h-4 w-4 shrink-0" style={{ color: 'var(--tf-primary)' }} />
        <div className="min-w-0 flex-1">
          {selectedUser ? (
            <PersonLine user={selectedUser} />
          ) : (
            <span className="truncate font-semibold" style={{ fontSize: 13, color: 'var(--tf-text)' }}>
              {current}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setPicked(null);
            onChange(null);
          }}
          className="shrink-0 bg-[color:var(--tf-surface)] text-[color:var(--tf-primary)] transition-colors hover:bg-[color:var(--tf-primary)] hover:text-white"
          style={{
            height: 28,
            padding: '0 10px',
            borderRadius: 6,
            border: '1px solid var(--tf-primary)',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Trocar
        </button>
      </div>
    );
  }

  const trimmed = text.trim();
  const waitingForChars = open && trimmed.length > 0 && trimmed.length < minChars;
  const showEmpty = open && !loading && !error && trimmed.length >= Math.max(minChars, 1) && matches.length === 0;
  const activeId = visible ? `${listId}-${active}` : undefined;

  return (
    <div className="grid gap-1.5">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
          style={{ color: 'var(--tf-text-muted)' }}
        />
        <input
          type={onlySuggested ? 'search' : 'email'}
          role="combobox"
          aria-expanded={visible}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-label={onlySuggested ? `Pesquisar ${field.label}` : field.label}
          aria-invalid={invalid || undefined}
          autoComplete="off"
          value={text}
          placeholder={onlySuggested ? 'Pesquise pelo nome ou e-mail' : 'Digite o nome ou o e-mail'}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(event) => {
            setOpen(true);
            if (onlySuggested) setSearchText(event.target.value);
            else onChange(event.target.value);
          }}
          onKeyDown={onKeyDown}
          className="placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[color:var(--tf-primary)]/30"
          style={{ ...inputStyle, paddingLeft: 34, paddingRight: 34 }}
        />
        {loading ? (
          <Loader2
            aria-label="Carregando sugestões"
            className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin"
            style={{ color: 'var(--tf-primary)' }}
          />
        ) : null}
      </div>

      {visible ? (
        <div
          id={listId}
          role="listbox"
          aria-label={`Sugestões de ${field.label}`}
          className="grid gap-1 overflow-y-auto"
          style={{
            maxHeight: 260,
            padding: 4,
            borderRadius: 8,
            border: '1px solid var(--tf-border)',
            background: 'var(--tf-surface)',
          }}
        >
          {matches.map((user, index) => (
            <div
              key={user.email}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              // mousedown: escolhe antes do blur do campo fechar a lista.
              onMouseDown={(event) => {
                event.preventDefault();
                choose(user);
              }}
              onMouseEnter={() => setActive(index)}
              className="flex cursor-pointer items-center gap-2.5"
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                background: index === active ? 'var(--tf-primary-light)' : 'transparent',
              }}
            >
              <UserRound aria-hidden className="h-4 w-4 shrink-0" style={{ color: 'var(--tf-text-muted)' }} />
              <PersonLine user={user} />
            </div>
          ))}
        </div>
      ) : null}

      {!onlySuggested && selectedUser && !visible ? (
        <small className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--tf-text-muted)' }}>
          <UserRound aria-hidden className="h-3.5 w-3.5" />
          {selectedUser.name}
        </small>
      ) : null}

      {waitingForChars ? (
        <small className="text-xs" style={{ color: 'var(--tf-text-muted)' }}>
          Digite pelo menos {minChars} caracteres.
        </small>
      ) : null}

      {error && open ? (
        <small className="text-xs" style={{ color: 'var(--tf-text-muted)' }}>
          {describeError(error)}
        </small>
      ) : null}

      {showEmpty ? (
        <small className="text-xs" style={{ color: 'var(--tf-text-muted)' }}>
          Ninguém encontrado para "{trimmed}".
          {onlySuggested ? '' : ' Você pode digitar o e-mail completo.'}
        </small>
      ) : null}

      {onlySuggested && trimmed && !open ? (
        <small className="text-xs" style={{ color: 'var(--tf-text-muted)' }}>
          Escolha uma pessoa da lista — este campo só aceita e-mails sugeridos.
        </small>
      ) : null}
    </div>
  );
}
