import { Check, Search, UserPlus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AssignableUser } from '../../users/services/users-api';

type FormAssigneesPickerProps = {
  users: AssignableUser[];
  loading: boolean;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Ocupa a altura do contêiner: a lista de pessoas cresce até o fim, em vez da caixa fixa. */
  fill?: boolean;
};

/**
 * Escolha das pessoas atribuídas ao formulário. A atribuição é o que dá acesso
 * ao formulário e a tudo que pende dele — respostas, solicitações, kanban e
 * fluxos — independentemente da área de cada uma.
 */
export function FormAssigneesPicker({
  users,
  loading,
  selectedIds,
  onChange,
  fill = false,
}: FormAssigneesPickerProps) {
  const [search, setSearch] = useState('');

  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const selected = useMemo(
    () => selectedIds.map((id) => usersById.get(id)).filter((user): user is AssignableUser => !!user),
    [selectedIds, usersById],
  );

  const available = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((user) => {
      if (selectedIds.includes(user.id)) return false;
      if (!term) return true;
      return `${user.fullName} ${user.email}`.toLowerCase().includes(term);
    });
  }, [users, selectedIds, search]);

  function toggle(userId: string) {
    onChange(
      selectedIds.includes(userId)
        ? selectedIds.filter((id) => id !== userId)
        : [...selectedIds, userId],
    );
  }

  return (
    <div
      className={[
        'min-w-0 gap-3 rounded-[10px] border border-border-default bg-bg-s2 p-3',
        fill ? 'flex min-h-[260px] flex-1 flex-col' : 'grid',
      ].join(' ')}
    >
      {selected.length === 0 ? (
        <p className="text-xs font-medium text-tx-secondary">
          Ninguém escolhido ainda — só você (quem cria) e quem tem acesso total pelo perfil verão o
          processo.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {selected.map((user) => (
            <li key={user.id}>
              <span
                className="flex max-w-full items-center gap-1.5 rounded-full bg-primary/10 py-1 pl-3 pr-1.5 text-xs font-semibold text-primary"
                title={user.email}
              >
                <span className="truncate">{user.fullName}</span>
                <button
                  type="button"
                  aria-label={`Remover ${user.fullName}`}
                  onClick={() => toggle(user.id)}
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-full hover:bg-primary/20"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-tx-secondary" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={loading ? 'Carregando usuários...' : 'Buscar pessoa por nome ou e-mail...'}
          disabled={loading}
          className="h-9 w-full rounded-[8px] border border-border-default bg-bg-surface pl-9 pr-3 text-sm font-medium text-tx-primary outline-none placeholder:text-tx-muted focus:border-primary disabled:opacity-60"
        />
      </div>

      {!loading && available.length > 0 ? (
        <ul
          className={[
            'grid content-start gap-1 overflow-y-auto',
            fill ? 'min-h-0 flex-1' : 'max-h-52',
          ].join(' ')}
        >
          {available.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                onClick={() => toggle(user.id)}
                className="flex w-full min-w-0 items-center gap-2 rounded-[8px] px-2.5 py-2 text-left transition-colors hover:bg-bg-hover"
              >
                <UserPlus className="h-4 w-4 shrink-0 text-tx-secondary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-tx-primary">
                    {user.fullName}
                  </span>
                  <span className="block truncate text-xs font-medium text-tx-secondary">
                    {user.email}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {!loading && available.length === 0 && search.trim() ? (
        <p className="text-xs font-medium text-tx-secondary">Ninguém encontrado com esse termo.</p>
      ) : null}

      {!loading && available.length === 0 && !search.trim() && users.length > 0 ? (
        <p className="flex items-center gap-1.5 text-xs font-medium text-tx-secondary">
          <Check className="h-3.5 w-3.5" />
          Todos os usuários disponíveis já estão atribuídos.
        </p>
      ) : null}
    </div>
  );
}
