import { useQuery } from '@tanstack/react-query';
import { Check, Loader2, Plus, Search, Shield, User, X, type LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '../../../lib/cn';
import { fetchAssignableUsers } from '../../users/services/users-api';
import type { KanbanPhasePeople } from '../types';

type Option = { value: string; label: string; hint?: string };

/**
 * Seleção múltipla com busca: os escolhidos viram chips; "Adicionar" abre a lista para marcar
 * vários de uma vez. Valor escolhido que não existe mais (perfil/usuário removido) continua
 * aparecendo, marcado, para poder ser tirado.
 */
export function ChipMultiSelect({
  icon: Icon,
  title,
  options,
  selected,
  onChange,
  loading,
  error,
  searchPlaceholder,
}: {
  icon: LucideIcon;
  title: string;
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
  loading?: boolean;
  error?: string | null;
  searchPlaceholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const byValue = useMemo(() => new Map(options.map((option) => [option.value, option])), [options]);
  const term = search.trim().toLowerCase();
  const filtered = term
    ? options.filter((option) => `${option.label} ${option.hint ?? ''}`.toLowerCase().includes(term))
    : options;

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  }

  return (
    <div className="grid content-start gap-2 rounded-[10px] border border-border-default p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-tx-primary">
          <Icon className="h-4 w-4 text-tx-secondary" />
          {title}
          {selected.length > 0 ? (
            <span className="rounded-full bg-bg-s2 px-1.5 text-[11px] font-semibold text-tx-secondary">
              {selected.length}
            </span>
          ) : null}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline dark:text-blue-300"
        >
          {open ? 'Fechar' : (
            <>
              <Plus className="h-3 w-3" /> Adicionar
            </>
          )}
        </button>
      </div>

      {selected.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={`${title} escolhidos`}>
          {selected.map((value) => {
            const option = byValue.get(value);
            return (
              <li
                key={value}
                className={cn(
                  'inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
                  option
                    ? 'border-primary/40 bg-primary/10 text-tx-primary dark:bg-blue-900/40'
                    : 'border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
                )}
              >
                <span className="truncate">{option ? option.label : `${value} (não encontrado)`}</span>
                <button
                  type="button"
                  onClick={() => toggle(value)}
                  aria-label={`Tirar ${option?.label ?? value}`}
                  className="grid h-4 w-4 shrink-0 place-items-center rounded-full hover:bg-black/10"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[11px] text-tx-muted">Nenhum escolhido.</p>
      )}

      {open ? (
        <div className="grid gap-1.5 rounded-[8px] bg-bg-s2 p-2">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-tx-muted" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="h-8 w-full rounded-[6px] border border-border-default bg-bg-surface pl-7 pr-2 text-xs text-tx-primary outline-none focus:border-primary"
            />
          </label>
          {loading ? (
            <p className="flex items-center gap-1.5 px-1 py-2 text-xs text-tx-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando...
            </p>
          ) : error ? (
            <p role="alert" className="px-1 py-2 text-xs text-[#ef4444]">
              {error}
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-1 py-2 text-xs text-tx-muted">Nada encontrado.</p>
          ) : (
            <ul role="listbox" aria-multiselectable="true" aria-label={title} className="grid max-h-44 gap-0.5 overflow-y-auto">
              {filtered.map((option) => {
                const checked = selected.includes(option.value);
                return (
                  <li key={option.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={checked}
                      onClick={() => toggle(option.value)}
                      className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left hover:bg-bg-hover"
                    >
                      <span
                        className={cn(
                          'grid h-4 w-4 shrink-0 place-items-center rounded border',
                          checked ? 'border-primary bg-primary text-white' : 'border-border-strong',
                        )}
                      >
                        {checked ? <Check className="h-3 w-3" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-tx-primary">{option.label}</span>
                        {option.hint ? (
                          <span className="block truncate text-[11px] text-tx-muted">{option.hint}</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Usuários ativos como opções (nome; e-mail e perfil como dica). Mesmo cache para todos os
 * seletores do modal; só busca quando `enabled`.
 */
export function usePhaseUserOptions(
  roleOptions: ReadonlyArray<{ code: string; name: string }>,
  enabled = true,
) {
  const query = useQuery({
    queryKey: ['users', 'assignable', 'all'],
    queryFn: () => fetchAssignableUsers(),
    enabled,
    staleTime: 5 * 60_000,
  });
  const roleName = new Map(roleOptions.map((role) => [role.code, role.name]));
  const options: Option[] = (query.data ?? []).map((user) => ({
    value: user.id,
    label: user.fullName,
    hint: [user.email, roleName.get(user.role) ?? user.role].filter(Boolean).join(' · '),
  }));
  return { options, isLoading: query.isLoading, isError: query.isError };
}

/**
 * Perfis e usuários lado a lado — "quem atua" e "quem aprova" na fase. Basta casar um: ter um dos
 * perfis ou ser um dos usuários.
 */
export function PhasePeoplePicker({
  label,
  value,
  onChange,
  roleOptions,
  enabled = true,
}: {
  label: string;
  value: KanbanPhasePeople;
  onChange: (next: KanbanPhasePeople) => void;
  roleOptions: ReadonlyArray<{ code: string; name: string }>;
  enabled?: boolean;
}) {
  const users = usePhaseUserOptions(roleOptions, enabled);
  return (
    <div className="grid gap-2 sm:grid-cols-2" aria-label={label} role="group">
      <ChipMultiSelect
        icon={Shield}
        title="Perfis"
        options={roleOptions.map((role) => ({ value: role.code, label: role.name }))}
        selected={value.roleCodes}
        onChange={(roleCodes) => onChange({ ...value, roleCodes })}
        searchPlaceholder="Buscar perfil"
      />
      <ChipMultiSelect
        icon={User}
        title="Usuários"
        options={users.options}
        selected={value.userIds}
        onChange={(userIds) => onChange({ ...value, userIds })}
        loading={users.isLoading}
        error={users.isError ? 'Não foi possível carregar os usuários.' : null}
        searchPlaceholder="Buscar por nome ou e-mail"
      />
    </div>
  );
}
