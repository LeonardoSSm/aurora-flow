import { useState } from 'react';
import { Button, Card } from '../../../components/ui';
import { useEscapeKey } from '../../../hooks/use-escape-key';
import { AdminHeaderActions, useAdminHeader } from '../components/admin-modal-context';
import {
  useAreasQuery,
  useCreateAreaMutation,
  useDeactivateAreaMutation,
  useUpdateAreaMutation,
} from '../hooks/use-areas';
import type { Area, CreateAreaPayload, UpdateAreaPayload } from '../services/areas-api';

// ─── Form Modal ───────────────────────────────────────────────────────────────

function AreaFormModal({
  area,
  parentOptions,
  submitting,
  onSubmit,
  onCancel,
}: {
  area?: Area;
  parentOptions: Area[];
  submitting: boolean;
  onSubmit: (payload: CreateAreaPayload | UpdateAreaPayload) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(area?.name ?? '');
  const [code, setCode] = useState(area?.code ?? '');
  const [description, setDescription] = useState(area?.description ?? '');
  const [parentId, setParentId] = useState<string>(area?.parentId ?? '');
  useEscapeKey(onCancel);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
    >
      <Card className="grid w-full max-w-md gap-4">
        <h2 className="text-xl font-extrabold">{area ? 'Editar Área' : 'Nova Área'}</h2>

        <label className="grid gap-1 text-sm font-semibold">
          Nome <span className="text-red-500">*</span>
          <input
            className="rounded-xl border border-border-default/50 bg-surface-container-low px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Recursos Humanos"
          />
        </label>

        <label className="grid gap-1 text-sm font-semibold">
          Código (opcional)
          <input
            className="rounded-xl border border-border-default/50 bg-surface-container-low px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Ex: RH"
          />
        </label>

        <label className="grid gap-1 text-sm font-semibold">
          Descrição (opcional)
          <textarea
            className="rounded-xl border border-border-default/50 bg-surface-container-low px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descreva a finalidade desta área"
          />
        </label>

        <label className="grid gap-1 text-sm font-semibold">
          Área pai (opcional)
          <select
            className="rounded-xl border border-border-default/50 bg-surface-container-low px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
          >
            <option value="">— Sem área pai —</option>
            {parentOptions
              .filter((a) => a.id !== area?.id)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.code ? ` (${a.code})` : ''}
                </option>
              ))}
          </select>
        </label>

        <div className="flex justify-end gap-2">
          <Button variant="subtle" size="sm" onClick={onCancel} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={submitting || !name.trim()}
            onClick={() => {
              const payload: CreateAreaPayload = {
                name: name.trim(),
                code: code.trim() || null,
                description: description.trim() || null,
                parentId: parentId || null,
              };
              onSubmit(payload);
            }}
          >
            {submitting ? 'Salvando...' : area ? 'Atualizar' : 'Criar'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────────

export function AdminAreasView() {
  const [includeInactive, setIncludeInactive] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingArea, setEditingArea] = useState<Area | null>(null);
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(null);

  const { data: areas = [], isLoading, error } = useAreasQuery(includeInactive);
  const createMutation = useCreateAreaMutation();
  const updateMutation = useUpdateAreaMutation();
  const deactivateMutation = useDeactivateAreaMutation();
  useEscapeKey(() => setConfirmDeactivateId(null), confirmDeactivateId !== null);
  useAdminHeader({
    description: `${areas.length} área(s) cadastrada(s). Organize usuários e formulários por unidades organizacionais.`,
  });

  const submitting =
    createMutation.isPending || updateMutation.isPending || deactivateMutation.isPending;

  const handleCreate = async (payload: CreateAreaPayload | UpdateAreaPayload) => {
    await createMutation.mutateAsync(payload as CreateAreaPayload);
    setShowCreateForm(false);
  };

  const handleUpdate = async (payload: CreateAreaPayload | UpdateAreaPayload) => {
    if (!editingArea) return;
    await updateMutation.mutateAsync({ id: editingArea.id, payload: payload as UpdateAreaPayload });
    setEditingArea(null);
  };

  const handleDeactivate = async (id: string) => {
    await deactivateMutation.mutateAsync(id);
    setConfirmDeactivateId(null);
  };

  const mutationError =
    createMutation.error?.message ??
    updateMutation.error?.message ??
    deactivateMutation.error?.message ??
    null;

  return (
    <section className="grid gap-4">
      <AdminHeaderActions>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-tx-secondary">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="accent-primary"
            />
            Incluir inativas
          </label>
          <Button size="sm" onClick={() => setShowCreateForm(true)}>
            Nova Área
          </Button>
        </div>
      </AdminHeaderActions>

      {error && (
        <p className="text-sm font-semibold text-red-600">
          Não foi possível carregar as áreas. Tente novamente.
        </p>
      )}
      {mutationError && <p className="text-sm font-semibold text-red-600">{mutationError}</p>}

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[560px] border-collapse text-left text-sm">
          <thead className="bg-surface-container-low text-xs uppercase tracking-wide text-tx-secondary">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Descrição</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-tx-secondary">
                  Carregando...
                </td>
              </tr>
            ) : areas.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-tx-secondary">
                  Nenhuma área cadastrada.
                </td>
              </tr>
            ) : (
              areas.map((area, i) => (
                <tr key={area.id} className={i % 2 === 0 ? 'bg-bg-surface' : 'bg-bg-s2'}>
                  <td className="px-4 py-3 font-semibold">{area.name}</td>
                  <td className="px-4 py-3 text-tx-secondary">{area.code ?? '—'}</td>
                  <td className="px-4 py-3 text-tx-secondary">
                    {area.description
                      ? area.description.length > 60
                        ? `${area.description.slice(0, 60)}…`
                        : area.description
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-[11px] font-bold uppercase ${area.isActive ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-500/20 dark:text-slate-200'}`}
                    >
                      {area.isActive ? 'Ativa' : 'Inativa'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Button size="sm" variant="subtle" onClick={() => setEditingArea(area)}>
                        Editar
                      </Button>
                      {area.isActive && (
                        <Button
                          size="sm"
                          variant="subtle"
                          onClick={() => setConfirmDeactivateId(area.id)}
                        >
                          Desativar
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {confirmDeactivateId && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
        >
          <Card className="grid w-full max-w-sm gap-4">
            <h2 className="text-lg font-extrabold">Desativar área?</h2>
            <p className="text-sm text-tx-secondary">
              A área ficará inativa. Usuários e formulários vinculados não serão afetados.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="subtle" size="sm" onClick={() => setConfirmDeactivateId(null)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                disabled={submitting}
                onClick={() => handleDeactivate(confirmDeactivateId)}
              >
                {submitting ? 'Desativando...' : 'Confirmar'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {showCreateForm && (
        <AreaFormModal
          parentOptions={areas.filter((a) => a.isActive)}
          submitting={submitting}
          onSubmit={handleCreate}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {editingArea && (
        <AreaFormModal
          area={editingArea}
          parentOptions={areas.filter((a) => a.isActive)}
          submitting={submitting}
          onSubmit={handleUpdate}
          onCancel={() => setEditingArea(null)}
        />
      )}
    </section>
  );
}
