import { AlertTriangle, Check, ChevronDown, Plus, Shield, Trash2, Users, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Card } from '../../../components/ui';
import { useToast } from '../../../components/ui/toast-provider';
import { useEscapeKey } from '../../../hooks/use-escape-key';
import { AdminHeaderActions } from '../components/admin-modal-context';
import {
  useCreateRoleMutation,
  useDeleteRoleMutation,
  usePermissionCatalogQuery,
  useRoleDetailQuery,
  useRolesQuery,
  useUpdateRoleMutation,
  useUpdateRolePermissionsMutation,
  useUpdateUserRoleMutation,
} from '../hooks/use-roles';
import type {
  PermissionDefinition,
  PermissionScope,
  Role,
  RolePermissionEntry,
  RoleUserSummary,
} from '../services/roles-api';

// ─── Scope vocabulary ──────────────────────────────────────────────────────────

const SCOPE_LABEL: Record<PermissionScope, string> = {
  none: 'Nenhum',
  own: 'Próprios',
  assigned: 'Atribuídos',
  area: 'Área',
  all: 'Todos',
};

const SCOPABLE_ORDER: PermissionScope[] = ['none', 'own', 'assigned', 'area', 'all'];

const MODULE_LABEL: Record<string, string> = {
  forms: 'Formulários',
  responses: 'Respostas',
  solicitations: 'Solicitações',
  comments: 'Comentários',
  flows: 'Fluxos',
  analytics: 'Analytics',
  approvals: 'Aprovações',
  areas: 'Áreas',
  users: 'Usuários',
  roles: 'Perfis',
  settings: 'Configurações',
  attachments: 'Anexos',
  integrations: 'Integrações',
  automations: 'Automações',
  audit: 'Auditoria',
  reports: 'Relatórios',
  dashboard: 'Resumo',
  observability: 'Observabilidade',
  kanban_phases: 'Fases do Kanban',
  system: 'Sistema',
};

function moduleLabel(module: string): string {
  return MODULE_LABEL[module] ?? module;
}

// ─── Color map ──────────────────────────────────────────────────────────────

const COLOR: Record<string, { badge: string; border: string; icon: string; dot: string }> = {
  red: { badge: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300', border: 'border-rose-200', icon: 'text-rose-500', dot: 'bg-rose-500' },
  blue: { badge: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300', border: 'border-blue-200', icon: 'text-blue-500', dot: 'bg-blue-500' },
  green: { badge: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300', border: 'border-green-200', icon: 'text-green-500', dot: 'bg-green-500' },
  gray: { badge: 'bg-gray-100 text-gray-600 dark:bg-slate-500/20 dark:text-slate-300', border: 'border-gray-200', icon: 'text-gray-400', dot: 'bg-gray-400' },
  yellow: { badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300', border: 'border-yellow-200', icon: 'text-yellow-500', dot: 'bg-yellow-500' },
  purple: { badge: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300', border: 'border-violet-200', icon: 'text-violet-500', dot: 'bg-violet-500' },
};

const COLOR_OPTIONS = Object.keys(COLOR);

function colors(color: string) {
  return COLOR[color] ?? COLOR.gray;
}

// ─── Permission matrix editor ───────────────────────────────────────────────

type MatrixState = Record<string, PermissionScope>;

function buildInitialMatrix(catalog: PermissionDefinition[], existing: Record<string, PermissionScope>): MatrixState {
  const matrix: MatrixState = {};
  for (const def of catalog) {
    matrix[def.code] = existing[def.code] ?? 'none';
  }
  return matrix;
}

function matrixToEntries(matrix: MatrixState): RolePermissionEntry[] {
  return Object.entries(matrix).map(([code, scope]) => ({ code, scope }));
}

function PermissionMatrixEditor({
  catalog,
  matrix,
  onChange,
}: {
  catalog: PermissionDefinition[];
  matrix: MatrixState;
  onChange: (code: string, scope: PermissionScope) => void;
}) {
  const grouped = useMemo(() => {
    const byModule = new Map<string, PermissionDefinition[]>();
    for (const def of catalog) {
      if (!byModule.has(def.module)) byModule.set(def.module, []);
      byModule.get(def.module)?.push(def);
    }
    return Array.from(byModule.entries());
  }, [catalog]);

  return (
    <div className="grid gap-4">
      {grouped.map(([module, defs]) => (
        <div key={module} className="grid gap-2">
          <h4 className="text-xs font-bold uppercase tracking-wide text-tx-secondary">
            {moduleLabel(module)}
          </h4>
          <div className="grid gap-1 rounded-xl border border-border">
            {defs.map((def, i) => (
              <div
                key={def.code}
                className={`flex items-center justify-between gap-3 px-3 py-2 ${i > 0 ? 'border-t border-border' : ''}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-tx-primary">{def.label}</p>
                  <p className="truncate text-xs text-tx-secondary">{def.code}</p>
                </div>
                {def.scopable ? (
                  <select
                    value={matrix[def.code] ?? 'none'}
                    onChange={(e) => onChange(def.code, e.target.value as PermissionScope)}
                    className="shrink-0 rounded-lg border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  >
                    {SCOPABLE_ORDER.map((scope) => (
                      <option key={scope} value={scope}>
                        {SCOPE_LABEL[scope]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <label className="flex shrink-0 items-center gap-2 text-xs text-tx-secondary">
                    <input
                      type="checkbox"
                      checked={matrix[def.code] === 'all'}
                      onChange={(e) => onChange(def.code, e.target.checked ? 'all' : 'none')}
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                    Permitido
                  </label>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Create role modal ───────────────────────────────────────────────────────

function CreateRoleModal({ catalog, onClose }: { catalog: PermissionDefinition[]; onClose: () => void }) {
  const { showToast } = useToast();
  const createMutation = useCreateRoleMutation();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('blue');
  const [matrix, setMatrix] = useState<MatrixState>(() => buildInitialMatrix(catalog, {}));

  const codeValid = /^[a-z][a-z0-9_]{1,39}$/.test(code);

  function handleSubmit() {
    createMutation.mutate(
      {
        code,
        name,
        description: description || undefined,
        color,
        permissions: matrixToEntries(matrix),
      },
      {
        onSuccess: () => {
          showToast({ title: 'Perfil criado com sucesso.', variant: 'success' });
          onClose();
        },
        onError: (error: unknown) => {
          const message =
            (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
            'Não foi possível criar o perfil.';
          showToast({ title: 'Erro ao criar perfil', description: message, variant: 'error' });
        },
      },
    );
  }

  useEscapeKey(onClose);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
    >
      <Card className="grid max-h-[90vh] w-full max-w-2xl grid-rows-[auto_1fr_auto] gap-4 overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h3 className="text-lg font-bold text-tx-primary">Novo perfil</h3>
          <button type="button" onClick={onClose} className="text-tx-secondary hover:text-tx-primary">
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-4 overflow-y-auto px-6 py-4 [&_*]:min-w-0">
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-sm font-semibold text-tx-secondary">
              Código (identificador único)
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.trim().toLowerCase())}
                placeholder="ex: auditor"
                className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              {code && !codeValid && (
                <span className="text-xs text-rose-600">
                  minúsculas, números e underscore, começando com letra.
                </span>
              )}
            </label>
            <label className="grid gap-1 text-sm font-semibold text-tx-secondary">
              Nome
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex: Auditor"
                className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
          </div>

          <label className="grid gap-1 text-sm font-semibold text-tx-secondary">
            Descrição
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva o propósito deste perfil"
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>

          <div className="grid gap-1 text-sm font-semibold text-tx-secondary">
            Cor
            <div className="flex gap-2">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full ${colors(c).dot} ${color === c ? 'ring-2 ring-offset-2 ring-primary' : ''}`}
                  aria-label={c}
                />
              ))}
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-bold text-tx-primary">Permissões</h4>
            <PermissionMatrixEditor
              catalog={catalog}
              matrix={matrix}
              onChange={(pcode, scope) => setMatrix((prev) => ({ ...prev, [pcode]: scope }))}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!codeValid || !name.trim() || createMutation.isPending}
            onClick={handleSubmit}
          >
            {createMutation.isPending ? 'Criando...' : 'Criar perfil'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ─── Delete confirm ──────────────────────────────────────────────────────────

function DeleteRoleDialog({
  role,
  onConfirm,
  onCancel,
  isPending,
}: {
  role: Role;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  useEscapeKey(onCancel);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
    >
      <Card className="grid w-full max-w-md gap-4">
        <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertTriangle size={16} />
          <span>Esta ação não pode ser desfeita.</span>
        </div>
        <h3 className="text-base font-semibold text-tx-primary">Excluir perfil "{role.name}"?</h3>
        <p className="text-sm text-tx-secondary">
          {role.userCount > 0
            ? `Este perfil ainda tem ${role.userCount} usuário(s) atribuído(s). Reatribua-os antes de excluir.`
            : 'O perfil e sua matriz de permissões serão removidos permanentemente.'}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={role.userCount > 0 || isPending}
            onClick={onConfirm}
            className="!bg-rose-600 hover:!opacity-90"
          >
            {isPending ? 'Excluindo...' : 'Excluir'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ─── Role card ────────────────────────────────────────────────────────────────

function RoleCard({ role, selected, onSelect }: { role: Role; selected: boolean; onSelect: () => void }) {
  const c = colors(role.color);
  const grantedCount = Object.values(role.permissions).filter((s) => s !== 'none').length;
  return (
    <Card
      className={`flex cursor-pointer flex-col gap-3 border-2 transition-all ${
        selected ? c.border + ' ring-2 ring-offset-1' : 'border-transparent hover:border-border'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Shield size={18} className={c.icon} />
          <span className="font-semibold text-tx-primary">{role.name}</span>
        </div>
        <span
          className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${c.badge}`}
        >
          {role.activeUserCount} ativo{role.activeUserCount !== 1 ? 's' : ''}
        </span>
      </div>
      <p className="text-xs text-tx-secondary">{role.description || 'Sem descrição.'}</p>
      <p className="text-xs text-tx-secondary">
        {grantedCount} permiss{grantedCount !== 1 ? 'ões concedidas' : 'ão concedida'}
      </p>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        className={`mt-auto flex items-center gap-1 self-start text-xs font-medium ${c.icon} hover:underline`}
      >
        <Users size={13} />
        Ver detalhes ({role.userCount})
      </button>
    </Card>
  );
}

function CardSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-3 rounded-2xl bg-surface-container p-4">
      <div className="h-4 w-1/2 rounded bg-surface-container-high" />
      <div className="h-3 w-3/4 rounded bg-surface-container-high" />
      <div className="flex gap-1">
        <div className="h-5 w-16 rounded bg-surface-container-high" />
        <div className="h-5 w-20 rounded bg-surface-container-high" />
      </div>
    </div>
  );
}

// ─── User reassignment ────────────────────────────────────────────────────────

type PendingChange = { user: RoleUserSummary; newRole: string };

function ReassignConfirmDialog({
  fromRole,
  toRole,
  userName,
  onConfirm,
  onCancel,
}: {
  fromRole: string;
  toRole: string;
  userName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEscapeKey(onCancel);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
    >
      <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl">
        <h3 className="text-base font-semibold text-tx-primary">Alterar perfil do usuário</h3>
        <p className="mt-2 text-sm text-tx-secondary">
          Tem certeza que deseja alterar o perfil de <strong>{userName}</strong> de{' '}
          <strong>{fromRole}</strong> para <strong>{toRole}</strong>? O usuário precisará entrar
          novamente.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" onClick={onConfirm}>
            Confirmar
          </Button>
        </div>
      </div>
    </div>
  );
}

function UserTable({ selectedRole, allRoles }: { selectedRole: Role; allRoles: Role[] }) {
  const { data: detail, isLoading, isError } = useRoleDetailQuery(selectedRole.code);
  const mutation = useUpdateUserRoleMutation();
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<PendingChange | null>(null);

  const users = detail?.users ?? [];
  const filtered = users.filter(
    (u) =>
      u.fullName.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()),
  );

  function handleRoleChange(user: RoleUserSummary, newRole: string) {
    setPending({ user, newRole });
  }

  function handleConfirm() {
    if (!pending) return;
    mutation.mutate(
      { currentRoleCode: selectedRole.code, userId: pending.user.id, newRole: pending.newRole },
      { onSettled: () => setPending(null) },
    );
  }

  const getRoleName = (code: string) => allRoles.find((r) => r.code === code)?.name ?? code;

  return (
    <>
      {pending && (
        <ReassignConfirmDialog
          fromRole={getRoleName(selectedRole.code)}
          toRole={getRoleName(pending.newRole)}
          userName={pending.user.fullName}
          onConfirm={handleConfirm}
          onCancel={() => setPending(null)}
        />
      )}

      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Buscar por nome ou e-mail..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <span className="whitespace-nowrap text-sm text-tx-secondary">
          {filtered.length} usuário{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-10 text-sm text-tx-secondary">
          Carregando usuários...
        </div>
      )}

      {isError && (
        <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Não foi possível carregar os usuários deste perfil.
        </div>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="py-10 text-center text-sm text-tx-secondary">
          {search ? 'Nenhum resultado para esta busca.' : 'Nenhum usuário neste perfil.'}
        </div>
      )}

      {!isLoading && !isError && filtered.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-container-low text-left text-xs font-semibold text-tx-secondary">
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">E-mail</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Último acesso</th>
                <th className="px-4 py-3">Perfil</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  currentRole={selectedRole.code}
                  allRoles={allRoles}
                  onRoleChange={(newRole) => handleRoleChange(user, newRole)}
                  isPending={mutation.isPending && pending?.user.id === user.id}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function UserRow({
  user,
  currentRole,
  allRoles,
  onRoleChange,
  isPending,
}: {
  user: RoleUserSummary;
  currentRole: string;
  allRoles: Role[];
  onRoleChange: (newRole: string) => void;
  isPending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const c = colors(allRoles.find((r) => r.code === currentRole)?.color ?? 'gray');
  const currentRoleName = allRoles.find((r) => r.code === currentRole)?.name ?? currentRole;
  const lastLogin = user.lastLoginAt
    ? new Date(user.lastLoginAt).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '—';

  return (
    <tr className="bg-surface transition-colors hover:bg-surface-container-low">
      <td className="px-4 py-3 font-medium text-tx-primary">{user.fullName}</td>
      <td className="px-4 py-3 text-tx-secondary">{user.email}</td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
            user.isActive ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-slate-500/20 dark:text-slate-300'
          }`}
        >
          {user.isActive && <Check size={11} />}
          {user.isActive ? 'Ativo' : 'Inativo'}
        </span>
      </td>
      <td className="px-4 py-3 text-tx-secondary">{lastLogin}</td>
      <td className="px-4 py-3">
        <div className="relative inline-block">
          <button
            type="button"
            disabled={isPending}
            onClick={() => setOpen((v) => !v)}
            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-opacity ${c.badge} hover:opacity-80 disabled:opacity-50`}
          >
            {isPending ? 'Salvando...' : currentRoleName}
            <ChevronDown size={11} />
          </button>
          {open && (
            <div className="absolute left-0 top-full z-10 mt-1 w-40 rounded-xl border border-border bg-surface shadow-lg">
              {allRoles.map((r) => (
                <button
                  key={r.code}
                  type="button"
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-surface-container-low ${
                    r.code === currentRole ? 'font-semibold text-tx-primary' : 'text-tx-secondary'
                  }`}
                  onClick={() => {
                    setOpen(false);
                    if (r.code !== currentRole) onRoleChange(r.code);
                  }}
                >
                  <span className={`h-2 w-2 rounded-full ${colors(r.color).dot}`} />
                  {r.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Edit role modal (info + permission matrix + users) ───────────────────────

function EditRoleModal({
  role,
  allRoles,
  catalog,
  onClose,
}: {
  role: Role;
  allRoles: Role[];
  catalog: PermissionDefinition[];
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const updateMutation = useUpdateRoleMutation();
  const updatePermissionsMutation = useUpdateRolePermissionsMutation();
  const deleteMutation = useDeleteRoleMutation();

  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? '');
  const [color, setColor] = useState(role.color);
  const [matrix, setMatrix] = useState<MatrixState>(() => buildInitialMatrix(catalog, role.permissions));
  const [showUsers, setShowUsers] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const infoDirty = name !== role.name || description !== (role.description ?? '') || color !== role.color;
  const matrixDirty = useMemo(() => {
    for (const def of catalog) {
      const current = matrix[def.code] ?? 'none';
      const original = role.permissions[def.code] ?? 'none';
      if (current !== original) return true;
    }
    return false;
  }, [catalog, matrix, role.permissions]);

  function handleSaveInfo() {
    updateMutation.mutate(
      { code: role.code, payload: { name, description: description || undefined, color } },
      {
        onSuccess: () => showToast({ title: 'Perfil atualizado.', variant: 'success' }),
        onError: () => showToast({ title: 'Falha ao atualizar perfil.', variant: 'error' }),
      },
    );
  }

  function handleSavePermissions() {
    updatePermissionsMutation.mutate(
      { code: role.code, permissions: matrixToEntries(matrix) },
      {
        onSuccess: () => showToast({ title: 'Permissões atualizadas.', variant: 'success' }),
        onError: (error: unknown) => {
          const message =
            (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
            'Falha ao atualizar permissões.';
          showToast({ title: 'Erro ao salvar permissões', description: message, variant: 'error' });
        },
      },
    );
  }

  function handleDelete() {
    deleteMutation.mutate(role.code, {
      onSuccess: () => {
        showToast({ title: 'Perfil excluído.', variant: 'success' });
        setConfirmDelete(false);
        onClose();
      },
      onError: (error: unknown) => {
        const message =
          (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          'Falha ao excluir perfil.';
        showToast({ title: 'Erro ao excluir perfil', description: message, variant: 'error' });
        setConfirmDelete(false);
      },
    });
  }

  useEscapeKey(onClose);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
    >
      <Card className="grid max-h-[90vh] w-full max-w-3xl grid-rows-[auto_1fr] gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h3 className="flex items-center gap-2 text-lg font-bold text-tx-primary">
            <span className={`rounded-full px-2 py-0.5 text-sm ${colors(role.color).badge}`}>
              {role.name}
            </span>
            {role.isSystem && (
              <span className="rounded-full bg-surface-container-low px-2 py-0.5 text-xs font-normal text-tx-secondary">
                perfil padrão
              </span>
            )}
          </h3>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="flex items-center gap-1 text-xs font-medium text-rose-600 hover:underline"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={13} />
              Excluir
            </button>
            <button type="button" onClick={onClose} className="text-tx-secondary hover:text-tx-primary">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="grid gap-6 overflow-y-auto px-6 py-5 [&_*]:min-w-0">
          {/* ── Seção: Dados do perfil ── */}
          <section className="grid gap-3">
            <h4 className="text-xs font-bold uppercase tracking-wide text-tx-secondary">
              Dados do perfil
            </h4>
            <div className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-semibold text-tx-secondary">
                Nome
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-tx-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-tx-secondary">
                Cor
                <div className="flex items-center gap-2 py-1">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`h-6 w-6 rounded-full ${colors(c).dot} ${color === c ? 'ring-2 ring-offset-2 ring-primary' : ''}`}
                      aria-label={c}
                    />
                  ))}
                </div>
              </label>
              <label className="grid gap-1 text-sm font-semibold text-tx-secondary sm:col-span-2">
                Descrição
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-tx-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>
              <div className="flex justify-end sm:col-span-2">
                <Button size="sm" disabled={!infoDirty || updateMutation.isPending} onClick={handleSaveInfo}>
                  {updateMutation.isPending ? 'Salvando...' : 'Salvar dados do perfil'}
                </Button>
              </div>
            </div>
          </section>

          {/* ── Seção: Matriz de permissões (já agrupada por módulo) ── */}
          <section className="grid gap-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wide text-tx-secondary">
                Permissões por módulo
              </h4>
              <Button
                size="sm"
                disabled={!matrixDirty || updatePermissionsMutation.isPending}
                onClick={handleSavePermissions}
              >
                {updatePermissionsMutation.isPending ? 'Salvando...' : 'Salvar permissões'}
              </Button>
            </div>
            <div className="rounded-xl border border-border p-4">
              <PermissionMatrixEditor
                catalog={catalog}
                matrix={matrix}
                onChange={(code, scope) => setMatrix((prev) => ({ ...prev, [code]: scope }))}
              />
            </div>
          </section>

          {/* ── Seção: Usuários com este perfil ── */}
          <section className="grid gap-3">
            <button
              type="button"
              className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-tx-secondary hover:text-tx-primary"
              onClick={() => setShowUsers((v) => !v)}
            >
              <Users size={14} />
              Usuários ({role.userCount})
              <ChevronDown
                size={14}
                className={showUsers ? 'rotate-180 transition-transform' : 'transition-transform'}
              />
            </button>
            {showUsers && (
              <div className="rounded-xl border border-border p-4">
                <UserTable selectedRole={role} allRoles={allRoles} />
              </div>
            )}
          </section>
        </div>
      </Card>

      {confirmDelete && (
        <DeleteRoleDialog
          role={role}
          isPending={deleteMutation.isPending}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function AdminPermissionsView() {
  const { data: roles, isLoading, isError } = useRolesQuery();
  const { data: catalog } = usePermissionCatalogQuery();
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const selectedRole = roles?.find((r) => r.code === selectedCode) ?? null;

  return (
    <section className="grid gap-6">
      <AdminHeaderActions>
        <Button size="sm" onClick={() => setShowCreate(true)} disabled={!catalog}>
          <span className="flex items-center gap-1">
            <Plus size={15} />
            Novo perfil
          </span>
        </Button>
      </AdminHeaderActions>

      <p className="rounded-xl border border-border-default bg-bg-s2 px-4 py-3 text-sm text-tx-secondary">
        O perfil decide o que é da plataforma: usuários, perfis, áreas, integrações, relatórios e listas de
        itens. O que cada pessoa pode fazer em cada processo fica no acesso dela ao processo — em Usuários ›
        Processos ou no Criador, em Pessoas com acesso. Quem tem &quot;Acesso total a todos os processos&quot;
        vê todos sem precisar de acesso a cada um.
      </p>

      {isError && (
        <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Não foi possível carregar os perfis. Tente recarregar a página.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)
          : roles?.map((role) => (
              <RoleCard
                key={role.code}
                role={role}
                selected={selectedCode === role.code}
                onSelect={() => setSelectedCode((prev) => (prev === role.code ? null : role.code))}
              />
            ))}
      </div>

      {selectedRole && catalog && roles && (
        <EditRoleModal
          role={selectedRole}
          allRoles={roles}
          catalog={catalog}
          onClose={() => setSelectedCode(null)}
        />
      )}

      {showCreate && catalog && (
        <CreateRoleModal catalog={catalog} onClose={() => setShowCreate(false)} />
      )}
    </section>
  );
}
