import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import type { FieldSettings } from '../../forms/types';
import { filterSuggestedUsers } from '../../public-form/user-email';
import { fetchAssignableUsers } from '../../users/services/users-api';

const INPUT_CLASS =
  'h-[38px] w-full min-w-0 rounded-[8px] border border-border-strong bg-bg-surface px-3 text-sm text-tx-primary outline-none focus:border-primary';

type Mode = 'all' | 'chosen';

/**
 * Configuração do "E-mail de usuário": quem aparece como sugestão (todos os usuários ativos ou só
 * as pessoas escolhidas) e se o campo aceita só e-mails sugeridos. Usado no construtor do
 * formulário e nos campos de fase.
 */
export function UserEmailSettingsEditor({
  settings,
  onChange,
}: {
  settings: FieldSettings;
  onChange: (next: FieldSettings) => void;
}) {
  const suggestions = settings.userSuggestions ?? {};
  const userIds = useMemo(() => suggestions.userIds ?? [], [suggestions.userIds]);
  const onlySuggested = suggestions.onlySuggested === true;
  // "Só as pessoas escolhidas" sem ninguém ainda = continua sugerindo todos; o modo fica aqui
  // para a lista de pessoas não sumir antes da primeira escolha.
  const [mode, setMode] = useState<Mode>(userIds.length > 0 ? 'chosen' : 'all');
  const [search, setSearch] = useState('');
  const radioName = useId();

  const users = useQuery({
    queryKey: ['users', 'assignable', 'all'],
    queryFn: () => fetchAssignableUsers(),
    staleTime: 5 * 60_000,
  });

  const byId = useMemo(() => new Map((users.data ?? []).map((user) => [user.id, user])), [users.data]);
  const chosen = userIds.flatMap((id) => {
    const user = byId.get(id);
    return user ? [user] : [];
  });
  // Pessoa escolhida que foi desativada ou removida: não aparece mais como sugestão.
  const missing = users.isSuccess ? userIds.length - chosen.length : 0;

  const filtered = useMemo(() => {
    const list = (users.data ?? []).map((user) => ({ id: user.id, name: user.fullName, email: user.email }));
    return filterSuggestedUsers(list, search);
  }, [users.data, search]);

  const update = (patch: { userIds?: string[]; onlySuggested?: boolean }) =>
    onChange({
      ...settings,
      userSuggestions: { userIds, onlySuggested, ...patch },
    });

  const toggle = (id: string, checked: boolean) =>
    update({ userIds: checked ? [...userIds, id] : userIds.filter((current) => current !== id) });

  return (
    <div className="grid gap-3 rounded-[10px] border border-border-default bg-bg-s2 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-tx-secondary">Sugestões de usuários</p>

      <fieldset className="grid gap-1.5">
        <legend className="mb-1 text-xs font-semibold text-tx-secondary">Quem aparece como sugestão</legend>
        <label className="flex items-start gap-2 text-sm text-tx-primary">
          <input
            type="radio"
            name={radioName}
            className="mt-1"
            checked={mode === 'all'}
            onChange={() => {
              setMode('all');
              update({ userIds: [] });
            }}
          />
          <span>
            Qualquer usuário do sistema
            <span className="block text-xs text-tx-secondary">
              Quem preenche pesquisa pelo nome ou e-mail. No formulário público, a pesquisa começa com 3
              letras e mostra até 8 pessoas.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-tx-primary">
          <input
            type="radio"
            name={radioName}
            className="mt-1"
            checked={mode === 'chosen'}
            onChange={() => setMode('chosen')}
          />
          <span>
            Só pessoas específicas
            <span className="block text-xs text-tx-secondary">
              Ex.: os gestores. A lista aparece inteira ao clicar no campo.
            </span>
          </span>
        </label>
      </fieldset>

      {mode === 'chosen' ? (
        <div className="grid gap-2">
          {chosen.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Pessoas escolhidas">
              {chosen.map((user) => (
                <li
                  key={user.id}
                  className="flex max-w-full items-center gap-1.5 rounded-full border border-border-strong bg-bg-surface py-1 pl-3 pr-1 text-xs text-tx-primary"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-semibold">{user.fullName}</span>{' '}
                    <span className="text-tx-secondary">{user.email}</span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Tirar ${user.fullName}`}
                    onClick={() => toggle(user.id, false)}
                    className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-tx-secondary hover:bg-bg-s2 hover:text-tx-primary"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
              Escolha pelo menos uma pessoa. Sem ninguém, o campo sugere qualquer usuário do sistema.
            </p>
          )}
          {missing > 0 ? (
            <p className="text-xs text-tx-secondary">
              {missing === 1
                ? '1 pessoa escolhida foi desativada e não aparece mais como sugestão.'
                : `${missing} pessoas escolhidas foram desativadas e não aparecem mais como sugestão.`}
            </p>
          ) : null}

          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tx-secondary"
            />
            <input
              type="search"
              aria-label="Pesquisar pessoas"
              placeholder="Pesquisar pelo nome ou e-mail"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className={`${INPUT_CLASS} pl-9`}
            />
          </div>
          {users.isLoading ? (
            <span className="text-xs text-tx-secondary">Carregando pessoas…</span>
          ) : users.isError ? (
            <span className="text-xs text-error">Não foi possível carregar os usuários.</span>
          ) : (
            <div className="grid max-h-52 gap-1 overflow-y-auto rounded-[8px] border border-border-strong bg-bg-surface px-3 py-2">
              {filtered.map((user) => (
                <label key={user.id} className="flex items-center gap-2 text-sm text-tx-primary">
                  <input
                    type="checkbox"
                    aria-label={`Sugerir ${user.name}`}
                    checked={userIds.includes(user.id)}
                    onChange={(event) => toggle(user.id, event.target.checked)}
                  />
                  <span className="min-w-0 truncate">
                    {user.name} <span className="text-xs text-tx-secondary">{user.email}</span>
                  </span>
                </label>
              ))}
              {filtered.length === 0 ? (
                <span className="text-xs text-tx-secondary">Ninguém encontrado.</span>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      <label className="flex items-start gap-2 text-sm text-tx-primary">
        <input
          type="checkbox"
          className="mt-1"
          checked={onlySuggested}
          onChange={(event) => update({ onlySuggested: event.target.checked })}
        />
        <span>
          Aceitar só e-mails sugeridos
          <span className="block text-xs text-tx-secondary">
            {onlySuggested
              ? 'Quem preenche precisa escolher uma pessoa da lista; outro e-mail é recusado no envio.'
              : 'Sem marcar, quem preenche pode digitar qualquer e-mail — as sugestões só ajudam.'}
          </span>
        </span>
      </label>
    </div>
  );
}
