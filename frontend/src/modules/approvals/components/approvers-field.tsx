import { ArrowDown, ArrowUp, Check, Loader2, Search, Shield, User, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '../../../lib/cn';

/** Basta um aprovar, todos aprovam (qualquer ordem) ou todos, um depois do outro. */
export type ApprovalRule = 'any' | 'all' | 'sequential';

/** Quem aprova: perfis e usuários; `order` (chaves `role:`/`user:`) só importa "em ordem". */
export type ApproverSelection = { roleCodes: string[]; userIds: string[]; order?: string[] };

export type ApproverOption = { value: string; label: string; hint?: string };

export const APPROVAL_RULES: ReadonlyArray<{ value: ApprovalRule; label: string; hint: string }> = [
  { value: 'any', label: 'Qualquer um', hint: 'Basta um dos escolhidos aprovar.' },
  { value: 'all', label: 'Todos', hint: 'Todos precisam aprovar, em qualquer ordem.' },
  { value: 'sequential', label: 'Em ordem', hint: 'Todos aprovam, um depois do outro, na ordem da lista.' },
];

/** Chaves na ordem da aprovação: a ordem guardada (só de quem ainda está) e quem faltar no fim. */
export function approverKeys(selection: ApproverSelection): string[] {
  const keys = [
    ...selection.userIds.map((id) => `user:${id}`),
    ...selection.roleCodes.map((code) => `role:${code}`),
  ];
  const known = new Set(keys);
  const ordered = (selection.order ?? []).filter((key, index, all) => known.has(key) && all.indexOf(key) === index);
  return [...ordered, ...keys.filter((key) => !ordered.includes(key))];
}

function Tab({ active, onClick, icon: Icon, label, count }: { active: boolean; onClick: () => void; icon: typeof Shield; label: string; count: number }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold',
        active ? 'border-primary text-tx-primary' : 'border-transparent text-tx-secondary hover:text-tx-primary',
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
      {count > 0 ? <span className="rounded-full bg-primary px-1.5 text-[11px] font-bold text-white">{count}</span> : null}
    </button>
  );
}

/**
 * Janela para escolher vários aprovadores de uma vez: abas Perfis e Usuários, busca e marcação.
 * Um perfil vale como um aprovador — basta uma pessoa dele decidir.
 */
export function ApproversPickerModal({
  initial,
  roleOptions,
  userOptions,
  usersLoading = false,
  onConfirm,
  onClose,
}: {
  initial: ApproverSelection;
  roleOptions: ApproverOption[];
  userOptions: ApproverOption[];
  usersLoading?: boolean;
  onConfirm: (next: ApproverSelection) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'roles' | 'users'>(initial.userIds.length > 0 && initial.roleCodes.length === 0 ? 'users' : 'roles');
  const [search, setSearch] = useState('');
  const [roleCodes, setRoleCodes] = useState(initial.roleCodes);
  const [userIds, setUserIds] = useState(initial.userIds);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const options = tab === 'roles' ? roleOptions : userOptions;
  const selected = tab === 'roles' ? roleCodes : userIds;
  const setSelected = tab === 'roles' ? setRoleCodes : setUserIds;
  const term = search.trim().toLowerCase();
  const filtered = useMemo(
    () => (term ? options.filter((option) => `${option.label} ${option.hint ?? ''}`.toLowerCase().includes(term)) : options),
    [options, term],
  );

  function toggle(value: string) {
    setSelected((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));
  }

  return (
    <div
      className="fixed inset-0 z-[120] grid place-items-center bg-[#071a38]/50 px-4 py-6"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Escolher aprovadores"
        className="flex max-h-[85dvh] w-full max-w-[520px] flex-col overflow-hidden rounded-[14px] bg-bg-surface shadow-2xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-border-default px-5 py-4">
          <div>
            <h3 className="text-base font-bold text-tx-primary">Escolher aprovadores</h3>
            <p className="text-xs text-tx-secondary">Marque quantos quiser. Um perfil conta como um aprovador.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="grid h-9 w-9 place-items-center rounded-full hover:bg-bg-hover">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div role="tablist" className="flex gap-1 border-b border-border-default px-3">
          <Tab active={tab === 'roles'} onClick={() => { setTab('roles'); setSearch(''); }} icon={Shield} label="Perfis" count={roleCodes.length} />
          <Tab active={tab === 'users'} onClick={() => { setTab('users'); setSearch(''); }} icon={User} label="Usuários" count={userIds.length} />
        </div>

        <div className="grid gap-2 px-5 py-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-tx-muted" />
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={tab === 'roles' ? 'Buscar perfil' : 'Buscar por nome ou e-mail'}
              aria-label={tab === 'roles' ? 'Buscar perfil' : 'Buscar usuário'}
              className="h-9 w-full rounded-[8px] border border-border-default bg-bg-s2 pl-8 pr-2 text-sm text-tx-primary outline-none focus:border-primary"
            />
          </label>
        </div>

        <div className="min-h-[180px] flex-1 overflow-y-auto px-3 pb-3">
          {tab === 'users' && usersLoading ? (
            <p className="flex items-center gap-1.5 px-2 py-3 text-sm text-tx-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando usuários…
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-3 text-sm text-tx-muted">Nada encontrado.</p>
          ) : (
            <ul role="listbox" aria-multiselectable="true" aria-label={tab === 'roles' ? 'Perfis' : 'Usuários'} className="grid gap-0.5">
              {filtered.map((option) => {
                const checked = selected.includes(option.value);
                return (
                  <li key={option.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={checked}
                      onClick={() => toggle(option.value)}
                      className={cn('flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left hover:bg-bg-hover', checked && 'bg-primary/5')}
                    >
                      <span className={cn('grid h-4 w-4 shrink-0 place-items-center rounded border', checked ? 'border-primary bg-primary text-white' : 'border-border-strong')}>
                        {checked ? <Check className="h-3 w-3" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-tx-primary">{option.label}</span>
                        {option.hint ? <span className="block truncate text-xs text-tx-muted">{option.hint}</span> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border-default px-5 py-3">
          <span className="text-xs text-tx-secondary">
            {roleCodes.length + userIds.length === 0
              ? 'Ninguém escolhido'
              : `${roleCodes.length} perfil(is) · ${userIds.length} usuário(s)`}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="h-9 rounded-[8px] px-3 text-sm font-bold text-tx-secondary hover:bg-bg-hover">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirm({ roleCodes, userIds, order: initial.order });
                onClose();
              }}
              className="h-9 rounded-[8px] bg-primary px-4 text-sm font-bold text-white"
            >
              Confirmar
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

/**
 * Quem aprova + a regra: resumo dos escolhidos, botão que abre a janela de escolha e, "em ordem",
 * a fila com setas para reordenar.
 */
export function ApproversField({
  value,
  onChange,
  rule,
  onRuleChange,
  roleOptions,
  userOptions,
  usersLoading,
}: {
  value: ApproverSelection;
  onChange: (next: ApproverSelection) => void;
  rule: ApprovalRule;
  onRuleChange: (next: ApprovalRule) => void;
  roleOptions: ApproverOption[];
  userOptions: ApproverOption[];
  usersLoading?: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const keys = approverKeys(value);
  const roleLabel = new Map(roleOptions.map((option) => [option.value, option.label]));
  const userLabel = new Map(userOptions.map((option) => [option.value, option.label]));
  const describe = (key: string) => {
    const [kind, ...rest] = key.split(':');
    const id = rest.join(':');
    return kind === 'role'
      ? { icon: Shield, label: roleLabel.get(id) ?? `${id} (não encontrado)`, hint: 'qualquer pessoa do perfil' }
      : { icon: User, label: userLabel.get(id) ?? (usersLoading ? 'Carregando…' : 'Usuário não encontrado'), hint: '' };
  };

  function remove(key: string) {
    const [kind, ...rest] = key.split(':');
    const id = rest.join(':');
    onChange({
      roleCodes: kind === 'role' ? value.roleCodes.filter((code) => code !== id) : value.roleCodes,
      userIds: kind === 'user' ? value.userIds.filter((userId) => userId !== id) : value.userIds,
      order: keys.filter((item) => item !== key),
    });
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= keys.length) return;
    const next = [...keys];
    [next[index], next[target]] = [next[target], next[index]];
    onChange({ ...value, order: next });
  }

  return (
    <div className="grid gap-3">
      <div role="radiogroup" aria-label="Regra da aprovação" className="grid gap-1.5 sm:grid-cols-3">
        {APPROVAL_RULES.map((option) => (
          <label
            key={option.value}
            className={cn(
              'flex cursor-pointer items-start gap-2 rounded-[8px] border px-2.5 py-2',
              rule === option.value ? 'border-primary bg-primary/5' : 'border-border-default hover:border-primary/50',
            )}
          >
            <input
              type="radio"
              name="approval-rule"
              value={option.value}
              checked={rule === option.value}
              onChange={() => onRuleChange(option.value)}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-semibold text-tx-primary">{option.label}</span>
              <span className="block text-[11px] leading-snug text-tx-secondary">{option.hint}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="grid gap-2 rounded-[10px] border border-border-default p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-tx-primary">
            <Users className="h-4 w-4 text-tx-secondary" />
            {rule === 'sequential' ? 'Ordem de aprovação' : 'Aprovadores'}
            {keys.length > 0 ? <span className="rounded-full bg-bg-s2 px-1.5 text-[11px] font-semibold text-tx-secondary">{keys.length}</span> : null}
          </span>
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="h-8 rounded-[8px] border border-primary/40 px-3 text-xs font-bold text-primary hover:bg-primary/5 dark:text-blue-300"
          >
            {keys.length ? 'Alterar aprovadores' : 'Escolher aprovadores'}
          </button>
        </div>
        {keys.length === 0 ? (
          <p className="text-xs text-tx-muted">Nenhum aprovador escolhido.</p>
        ) : (
          <ol className="grid gap-1" aria-label="Aprovadores escolhidos">
            {keys.map((key, index) => {
              const item = describe(key);
              const Icon = item.icon;
              return (
                <li key={key} className="flex items-center gap-2 rounded-[8px] bg-bg-s2 px-2 py-1.5">
                  {rule === 'sequential' ? <span className="w-5 text-right text-xs font-bold text-tx-muted">{index + 1}.</span> : null}
                  <Icon className="h-4 w-4 shrink-0 text-tx-secondary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-tx-primary">{item.label}</span>
                    {item.hint ? <span className="block text-[11px] text-tx-muted">{item.hint}</span> : null}
                  </span>
                  {rule === 'sequential' ? (
                    <>
                      <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Subir ${item.label}`} className="grid h-7 w-7 place-items-center rounded-md text-tx-muted hover:bg-bg-hover disabled:opacity-30">
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => move(index, 1)} disabled={index === keys.length - 1} aria-label={`Descer ${item.label}`} className="grid h-7 w-7 place-items-center rounded-md text-tx-muted hover:bg-bg-hover disabled:opacity-30">
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : null}
                  <button type="button" onClick={() => remove(key)} aria-label={`Tirar ${item.label}`} className="grid h-7 w-7 place-items-center rounded-md text-tx-muted hover:bg-error/10 hover:text-error">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {picking ? (
        <ApproversPickerModal
          initial={{ ...value, order: keys }}
          roleOptions={roleOptions}
          userOptions={userOptions}
          usersLoading={usersLoading}
          onConfirm={onChange}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </div>
  );
}
