import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Search, Trash2, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '../../../app/auth-context';
import { Button, useToast } from '../../../components/ui';
import { cn } from '../../../lib/cn';
import { queryKeys } from '../../../lib/query-keys';
import { fetchAssignableUsers } from '../../users/services/users-api';
import {
  fetchProcessAccessCatalog,
  fetchProcessMembers,
  type ProcessAccessCatalog,
  type ProcessGrants,
  type ProcessMember,
  removeProcessMember,
  setProcessMember,
} from '../services/process-access-api';
import { PhaseParticipation } from './phase-participation';
import { describeGrants, ProcessGrantsEditor } from './process-grants-editor';

function MemberRow({
  formId,
  member,
  catalog,
  isSelf,
  saving,
  onSave,
  onRemove,
}: {
  formId: string;
  member: ProcessMember;
  catalog: ProcessAccessCatalog;
  isSelf: boolean;
  saving: boolean;
  onSave: (grants: ProcessGrants) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ProcessGrants>(member.grants);
  const dirty = JSON.stringify(draft) !== JSON.stringify(member.grants);

  return (
    <li className="min-w-0 rounded-[10px] border border-border-default bg-bg-surface">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            setDraft(member.grants);
            setOpen((value) => !value);
          }}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-tx-muted transition-transform', open && 'rotate-180')} aria-hidden />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-tx-primary">
              {member.user.fullName}
              {isSelf ? <span className="ml-1.5 text-xs font-medium text-tx-muted">(você)</span> : null}
              {!member.user.isActive ? <span className="ml-1.5 text-xs font-medium text-tx-muted">· inativo</span> : null}
            </span>
            <span className="block truncate text-xs text-tx-muted">{describeGrants(member.grants, catalog.presets)}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={saving || isSelf}
          aria-label={`Tirar o acesso de ${member.user.fullName}`}
          title={isSelf ? 'Você não pode tirar o próprio acesso por aqui' : 'Tirar o acesso'}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-tx-muted transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-950/40"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {open ? (
        <div className="grid gap-3 border-t border-border-default px-3 py-3">
          <ProcessGrantsEditor catalog={catalog} value={draft} onChange={setDraft} disabled={saving} />
          <PhaseParticipation formId={formId} person={{ id: member.user.id, role: member.user.role }} />
          {/* Grudado no pé da tela enquanto a pessoa está aberta: as caixinhas são longas e o botão
              sumia lá embaixo — a pessoa marcava, não via o "Salvar" e achava que não gravava. */}
          <div className="sticky bottom-0 z-10 -mx-3 -mb-3 flex flex-wrap items-center justify-end gap-x-2 gap-y-1.5 rounded-b-[10px] border-t border-border-default bg-bg-surface px-3 py-2.5">
            {dirty ? (
              <span role="status" className="mr-auto text-xs font-semibold text-amber-700 dark:text-amber-300">
                Alterações não salvas
              </span>
            ) : null}
            <span className="flex shrink-0 gap-2">
              <Button variant="subtle" size="sm" disabled={!dirty || saving} onClick={() => setDraft(member.grants)}>
                Desfazer
              </Button>
              <Button size="sm" disabled={!dirty || saving} onClick={() => onSave(draft)}>
                {saving ? 'Salvando…' : 'Salvar permissões'}
              </Button>
            </span>
          </div>
        </div>
      ) : null}
    </li>
  );
}

/**
 * "Pessoas com acesso" do processo: quem tem vínculo e o que pode fazer nele. Grava na hora, fora do
 * "Salvar" do Criador. Só aparece para quem gerencia o acesso a este processo.
 */
export function ProcessMembersPanel({ formId }: { formId: string }) {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');

  const catalogQuery = useQuery({ queryKey: queryKeys.processAccess.catalog(), queryFn: fetchProcessAccessCatalog });
  const membersQuery = useQuery({
    queryKey: queryKeys.processAccess.members(formId),
    queryFn: () => fetchProcessMembers(formId),
  });
  const usersQuery = useQuery({ queryKey: ['users', 'assignable', 'all'], queryFn: () => fetchAssignableUsers() });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.processAccess.members(formId) });
  const saveMutation = useMutation({
    mutationFn: ({ userId, grants }: { userId: string; grants: ProcessGrants }) => setProcessMember(formId, userId, grants),
    onSuccess: () => {
      showToast({ title: 'Acesso salvo', variant: 'success' });
      void invalidate();
    },
    onError: () => showToast({ title: 'Não foi possível salvar o acesso', variant: 'error' }),
  });
  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeProcessMember(formId, userId),
    onSuccess: () => {
      showToast({ title: 'Acesso retirado', variant: 'success' });
      void invalidate();
    },
    onError: () => showToast({ title: 'Não foi possível tirar o acesso', variant: 'error' }),
  });

  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);
  const candidates = useMemo(() => {
    const memberIds = new Set(members.map((member) => member.user.id));
    const term = search.trim().toLowerCase();
    return (usersQuery.data ?? []).filter(
      (user) => !memberIds.has(user.id) && (!term || `${user.fullName} ${user.email}`.toLowerCase().includes(term)),
    );
  }, [members, usersQuery.data, search]);

  if (membersQuery.isError) {
    return (
      <p className="text-xs font-medium text-tx-secondary">
        Só quem gerencia o acesso a este processo vê e muda quem tem acesso a ele.
      </p>
    );
  }
  const catalog = catalogQuery.data;
  if (!catalog || membersQuery.isLoading) return <p className="text-sm text-tx-muted">Carregando…</p>;

  const operator = catalog.presets.find((preset) => preset.key === 'operador')?.grants ?? {};
  const saving = saveMutation.isPending || removeMutation.isPending;

  return (
    <div className="flex min-h-[260px] min-w-0 flex-1 flex-col gap-3 rounded-[10px] border border-border-default bg-bg-s2 p-3">
      <ul className="grid min-w-0 grid-cols-1 gap-2">
        {members.map((member) => (
          <MemberRow
            key={member.user.id}
            formId={formId}
            member={member}
            catalog={catalog}
            isSelf={member.user.id === me?.id}
            saving={saving}
            onSave={(grants) => saveMutation.mutate({ userId: member.user.id, grants })}
            onRemove={() => removeMutation.mutate(member.user.id)}
          />
        ))}
      </ul>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-tx-secondary" aria-hidden />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Dar acesso a… (buscar por nome ou e-mail)"
          aria-label="Buscar pessoa para dar acesso"
          className="h-9 w-full rounded-[8px] border border-border-default bg-bg-surface pl-9 pr-3 text-sm font-medium text-tx-primary outline-none placeholder:text-tx-muted focus:border-primary"
        />
      </div>
      {search.trim() ? (
        <ul className="grid max-h-52 content-start gap-1 overflow-y-auto">
          {candidates.length === 0 ? (
            <li className="px-1 text-xs text-tx-secondary">Ninguém encontrado com esse termo.</li>
          ) : (
            candidates.map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    saveMutation.mutate({ userId: user.id, grants: { ...operator } });
                    setSearch('');
                  }}
                  className="flex w-full min-w-0 items-center gap-2 rounded-[8px] px-2.5 py-2 text-left transition-colors hover:bg-bg-hover"
                >
                  <UserPlus className="h-4 w-4 shrink-0 text-tx-secondary" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-tx-primary">{user.fullName}</span>
                    <span className="block truncate text-xs text-tx-secondary">{user.email}</span>
                  </span>
                  <span className="text-xs font-semibold text-tx-muted">como Operador</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
