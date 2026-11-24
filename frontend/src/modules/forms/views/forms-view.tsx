import { useAuth } from '../../../app/auth-context';
import { Button } from '../../../components/ui';
import { FormsTable } from '../components/forms-table';
import { FormsToolbar } from '../components/forms-toolbar';
import { useFormsManagement } from '../hooks/use-forms-management';

export function FormsView() {
  const { permissions, can } = useAuth();
  const {
    query,
    statusFilter,
    forms,
    totalForms,
    statusCounts,
    currentPage,
    totalPages,
    loading,
    creating,
    updatingFormId,
    error,
    loadForms,
    createQuickForm,
    updateStatus,
    handleDuplicate,
    handleDelete,
    goToBuilder,
    goToPublicView,
    goToKanban,
    goToRecords,
    setQuery,
    setStatusFilter,
  } = useFormsManagement();
  const isOwnScope = permissions['forms.view'] === 'own';
  // Por processo: o vínculo com cada um diz o que dá para fazer nele.
  const canEditForm = (formId: string) => can('forms.edit', formId);
  const canManageLifecycle = (formId: string) => can('forms.publish', formId);

  return (
    <section className="grid gap-5">
      <FormsToolbar
        query={query}
        onQueryChange={setQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        statusCounts={statusCounts}
        showingCount={forms.length}
        totalCount={totalForms}
        onQuickCreate={createQuickForm}
        onReload={() => loadForms(currentPage)}
        onCreateWithBuilder={() => goToBuilder()}
        canCreate={can('forms.create')}
        loading={loading}
        creating={creating}
        isOwnScope={isOwnScope}
      />

      {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}

      <FormsTable
        forms={forms}
        loading={loading}
        updatingFormId={updatingFormId}
        canEditForm={canEditForm}
        canManageLifecycle={canManageLifecycle}
        onStatusChange={updateStatus}
        onOpenBuilder={goToBuilder}
        onOpenPublicView={goToPublicView}
        onOpenKanban={goToKanban}
        onOpenRecords={goToRecords}
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            size="sm"
            variant="subtle"
            disabled={currentPage <= 1 || loading}
            onClick={() => loadForms(currentPage - 1)}
          >
            ← Anterior
          </Button>
          <span className="text-sm text-tx-secondary">
            Página {currentPage} de {totalPages}
          </span>
          <Button
            size="sm"
            variant="subtle"
            disabled={currentPage >= totalPages || loading}
            onClick={() => loadForms(currentPage + 1)}
          >
            Próximo →
          </Button>
        </div>
      )}
    </section>
  );
}
