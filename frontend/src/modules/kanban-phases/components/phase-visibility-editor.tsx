import { useQuery } from '@tanstack/react-query';
import { Building2, Eye, EyeOff, Shield, User, type LucideIcon } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { visibilityCount } from '../lib/phase-draft';
import { fetchAreaOptions } from '../services/kanban-phases-api';
import type { KanbanPhaseVisibility } from '../types';
import { ChipMultiSelect, usePhaseUserOptions } from './people-multi-select';

/**
 * "Quem vê esta fase no Kanban": todos com acesso ao formulário, ou só quem casar com pelo menos um
 * critério (perfil, área ou usuário). As listas só são buscadas quando a restrição está ligada.
 */
export function PhaseVisibilityEditor({
  restrict,
  visibleTo,
  roleOptions,
  onChange,
}: {
  restrict: boolean;
  visibleTo: KanbanPhaseVisibility;
  roleOptions: ReadonlyArray<{ code: string; name: string }>;
  onChange: (next: { restrictVisibility: boolean; visibleTo: KanbanPhaseVisibility }) => void;
}) {
  const areasQuery = useQuery({
    queryKey: ['areas', 'options'],
    queryFn: fetchAreaOptions,
    enabled: restrict,
    staleTime: 5 * 60_000,
  });
  const usersQuery = usePhaseUserOptions(roleOptions, restrict);

  const set = (patch: Partial<KanbanPhaseVisibility>) =>
    onChange({ restrictVisibility: true, visibleTo: { ...visibleTo, ...patch } });

  const choice = (value: boolean, icon: LucideIcon, title: string, text: string) => {
    const Icon = icon;
    const active = restrict === value;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={active}
        onClick={() => onChange({ restrictVisibility: value, visibleTo })}
        className={cn(
          'flex min-w-0 items-start gap-2.5 rounded-[10px] border p-3 text-left transition-colors',
          active ? 'border-primary bg-primary/10 dark:bg-blue-900/40' : 'border-border-default hover:border-primary/50',
        )}
      >
        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', active ? 'text-primary dark:text-blue-300' : 'text-tx-muted')} />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-tx-primary">{title}</span>
          <span className="block text-xs text-tx-secondary">{text}</span>
        </span>
      </button>
    );
  };

  return (
    <div className="grid gap-3">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-tx-secondary">Quem vê esta fase no Kanban</p>
        <p className="text-xs text-tx-secondary">
          A coluna e os cards desta fase só aparecem para quem estiver liberado.
        </p>
      </div>
      <div role="radiogroup" aria-label="Quem vê esta fase" className="grid gap-2 sm:grid-cols-2">
        {choice(false, Eye, 'Todos com acesso', 'Qualquer pessoa que veja o Kanban deste formulário')}
        {choice(true, EyeOff, 'Só quem eu escolher', 'Perfis, áreas e usuários (pode marcar vários)')}
      </div>

      {restrict ? (
        <>
          <div className="grid gap-2">
            <ChipMultiSelect
              icon={Shield}
              title="Perfis"
              options={roleOptions.map((role) => ({ value: role.code, label: role.name }))}
              selected={visibleTo.roleCodes}
              onChange={(roleCodes) => set({ roleCodes })}
              searchPlaceholder="Buscar perfil"
            />
            <ChipMultiSelect
              icon={Building2}
              title="Áreas"
              options={(areasQuery.data ?? []).map((area) => ({ value: area.id, label: area.name }))}
              selected={visibleTo.areaIds}
              onChange={(areaIds) => set({ areaIds })}
              loading={areasQuery.isLoading}
              error={areasQuery.isError ? 'Não foi possível carregar as áreas.' : null}
              searchPlaceholder="Buscar área"
            />
            <ChipMultiSelect
              icon={User}
              title="Usuários"
              options={usersQuery.options}
              selected={visibleTo.userIds}
              onChange={(userIds) => set({ userIds })}
              loading={usersQuery.isLoading}
              error={usersQuery.isError ? 'Não foi possível carregar os usuários.' : null}
              searchPlaceholder="Buscar por nome ou e-mail"
            />
          </div>
          {visibilityCount(visibleTo) === 0 ? (
            <p role="alert" className="text-xs font-semibold text-[#ef4444]">
              Escolha pelo menos um perfil, área ou usuário — ou volte para “Todos com acesso”.
            </p>
          ) : (
            <p className="text-xs text-tx-secondary">
              Aparece para quem for de um dos perfis, de uma das áreas <em>ou</em> estiver na lista de
              usuários — basta um.
            </p>
          )}
          <p className="text-[11px] text-tx-muted">
            Quem gerencia as fases sempre vê todas. Esconder a fase não impede que cards sejam enviados
            para ela (ex.: a Logística envia para o Financeiro pelo “Mover para fase” ou por um fluxo).
          </p>
        </>
      ) : null}
    </div>
  );
}
