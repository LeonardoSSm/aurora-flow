import { ExternalLink, KanbanSquare, TableProperties } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { Button, Card } from '../../../components/ui';
import type { FormStatus, FormSummary } from '../types';
import { formStatusLabel, formStatusStyles } from '../types';
import { FormActionsCell } from './form-actions-cell';

type FormsTableProps = {
  forms: FormSummary[];
  loading: boolean;
  updatingFormId: string | null;
  /** Pode editar ESTE processo (permissão do vínculo com ele). */
  canEditForm: (formId: string) => boolean;
  /** Pode publicar, pausar e arquivar ESTE processo. */
  canManageLifecycle: (formId: string) => boolean;
  onStatusChange: (formId: string, status: FormStatus) => void;
  onOpenBuilder: (formId: string) => void;
  onOpenPublicView: (formId: string) => void;
  onOpenKanban: (formId: string) => void;
  onOpenRecords: (formId: string) => void;
  onDuplicate: (formId: string) => void;
  onDelete: (formId: string) => void;
};

type ProcessTag = { label: string; kind: 'category' | 'area' };

/** Categoria e área viram etiquetas numa coluna só. */
function processTags(form: FormSummary): ProcessTag[] {
  const tags: ProcessTag[] = [];
  if (form.category?.trim()) tags.push({ label: form.category.trim(), kind: 'category' });
  if (form.area?.trim()) tags.push({ label: form.area.trim(), kind: 'area' });
  return tags;
}

/** Cor do ponto ao lado do status. */
const formStatusDot: Record<FormStatus, string> = {
  published: 'bg-emerald-500',
  draft: 'bg-blue-500',
  paused: 'bg-amber-500',
  archived: 'bg-slate-500',
  expired: 'bg-rose-500',
};

const quickButtonCls =
  'inline-flex h-8 items-center gap-1.5 rounded-lg border border-border-default bg-bg-surface px-2 text-xs font-bold text-tx-secondary transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 dark:hover:text-blue-300';

export function FormsTable({
  forms,
  loading,
  updatingFormId,
  canEditForm,
  canManageLifecycle,
  onStatusChange,
  onOpenBuilder,
  onOpenPublicView,
  onOpenKanban,
  onOpenRecords,
  onDuplicate,
  onDelete,
}: FormsTableProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // A linha inteira entra no processo; sem permissão de editar, entra no Kanban dele.
  function openRow(formId: string) {
    if (canEditForm(formId)) onOpenBuilder(formId);
    else onOpenKanban(formId);
  }

  function onRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, formId: string) {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openRow(formId);
    }
  }

  return (
    <>
      <Card className="overflow-hidden rounded-[14px] p-0">
        {loading ? (
          <div className="divide-y divide-outline-variant/30">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex animate-pulse items-center gap-4 px-4 py-3">
                <div className="h-4 flex-1 rounded bg-surface-container-high" />
                <div className="h-5 w-20 rounded-full bg-surface-container-high" />
                <div className="h-5 w-32 rounded-full bg-surface-container-high" />
                <div className="h-4 w-20 rounded bg-surface-container-high" />
                <div className="h-8 w-64 rounded-lg bg-surface-container-high" />
              </div>
            ))}
          </div>
        ) : forms.length === 0 ? (
          <p className="p-4 text-sm text-tx-secondary">Nenhum processo encontrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead className="border-b border-border-default text-[11px] font-bold uppercase tracking-wider text-tx-secondary">
                <tr>
                  <th className="min-w-[200px] px-4 py-3">Processo</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Tags</th>
                  <th className="whitespace-nowrap px-4 py-3">Criado em</th>
                  <th className="px-4 py-3">Acesso rápido</th>
                  <th className="w-10 py-3 pl-1 pr-3">
                    <span className="sr-only">Mais ações</span>
                  </th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {forms.map((form) => {
                  const isUpdating = updatingFormId === form.id;
                  const tags = processTags(form);
                  const isPublished = form.status === 'published';

                  return (
                    <tr
                      key={form.id}
                      tabIndex={0}
                      onClick={() => openRow(form.id)}
                      onKeyDown={(event) => onRowKeyDown(event, form.id)}
                      title={canEditForm(form.id) ? 'Abrir o processo' : 'Abrir o Kanban do processo'}
                      className={[
                        'cursor-pointer border-b border-border-default bg-bg-surface transition-colors last:border-b-0 hover:bg-bg-hover focus-visible:bg-bg-hover focus-visible:outline-none',
                      ].join(' ')}
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-tx-primary">{form.name}</p>
                        <p className="mt-0.5 text-xs text-tx-muted">
                          v{form.latestVersionNumber || 1} · {form.submissionCount}{' '}
                          {form.submissionCount === 1 ? 'resposta' : 'respostas'}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={[
                            'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold',
                            formStatusStyles[form.status] ?? 'bg-slate-100 text-slate-700',
                          ].join(' ')}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${formStatusDot[form.status] ?? 'bg-slate-500'}`} />
                          {formStatusLabel[form.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {tags.length === 0 ? (
                          <span className="text-tx-muted">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {tags.map((tag) => (
                              <span
                                key={`${tag.kind}-${tag.label}`}
                                title={tag.kind === 'category' ? 'Categoria' : 'Área'}
                                className={[
                                  'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
                                  tag.kind === 'category'
                                    ? 'bg-primary/10 text-primary dark:bg-blue-900/40 dark:text-blue-300'
                                    : 'bg-bg-s3 text-tx-secondary',
                                ].join(' ')}
                              >
                                {tag.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-tx-secondary">
                        {new Date(form.createdAt).toLocaleDateString('pt-BR')}
                      </td>
                      {/* Os botões não entram no processo: o clique para aqui. Vale também para o
                          menu ⋮, que é um portal mas propaga pela árvore do React. */}
                      <td className="py-3 pl-4 pr-1" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <button type="button" onClick={() => onOpenKanban(form.id)} className={quickButtonCls}>
                            <KanbanSquare className="h-3.5 w-3.5" />
                            Kanban
                          </button>
                          {/* Registros substituiu Respostas: lista, filtra e monta o relatório dos cards. */}
                          <button
                            type="button"
                            onClick={() => onOpenRecords(form.id)}
                            title="Consultar, filtrar e exportar os registros do processo"
                            className={quickButtonCls}
                          >
                            <TableProperties className="h-3.5 w-3.5" />
                            Registros
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenPublicView(form.id)}
                            disabled={!isPublished}
                            title={
                              isPublished
                                ? 'Abrir o formulário de abertura'
                                : 'Publique o processo para abrir o formulário'
                            }
                            className={quickButtonCls}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Formulário
                          </button>
                        </div>
                      </td>
                      <td className="py-3 pl-1 pr-3" onClick={(event) => event.stopPropagation()}>
                        <FormActionsCell
                          status={form.status}
                          isUpdating={isUpdating}
                          canEditForms={canEditForm(form.id)}
                          canManageLifecycle={canManageLifecycle(form.id)}
                          onEdit={() => onOpenBuilder(form.id)}
                          onDuplicate={() => onDuplicate(form.id)}
                          onPublish={() => onStatusChange(form.id, 'published')}
                          onArchive={() => setConfirmDeleteId(form.id)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Confirm archive dialog */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-sm grid gap-4">
            <h2 className="text-lg font-extrabold">Arquivar processo?</h2>
            <p className="text-sm text-tx-secondary">
              O processo ficará inacessível para novos respondentes. Esta ação pode ser revertida
              alterando o status manualmente.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="subtle" size="sm" onClick={() => setConfirmDeleteId(null)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  onDelete(confirmDeleteId);
                  setConfirmDeleteId(null);
                }}
              >
                Confirmar
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
