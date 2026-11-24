import { ArrowLeft, FileDown, KanbanSquare, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Button, Card } from '../../../components/ui';
import { cn } from '../../../lib/cn';
import { ResponseDetailModal } from '../../responses/components/response-detail-modal';
import { ColumnPicker } from '../components/column-picker';
import { RecordsFilters } from '../components/records-filters';
import { RecordsTable } from '../components/records-table';
import { ReportBuilderModal } from '../components/report-builder-modal';
import { useRecords } from '../hooks/use-records';

/**
 * Registros de um processo: os cards com as respostas, com busca, período, filtros pelas respostas
 * e o relatório PDF montável. Substitui a antiga lista de Respostas.
 */
export function RecordsView() {
  const { formId = '' } = useParams<{ formId: string }>();
  const records = useRecords(formId);
  const { meta } = records;
  const [reportOpen, setReportOpen] = useState(false);

  // `?solicitacao=<id>` (ex.: "Ver a resposta" do aviso de pontuação por e-mail) abre o registro por cima.
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get('solicitacao');
  const openRecord = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('solicitacao', id);
    else next.delete('solicitacao');
    setSearchParams(next, { replace: !id });
  };

  const title = meta?.formName ?? (records.loadingMeta ? 'Carregando…' : 'Registros');
  const firstShown = (records.page - 1) * 25 + 1;
  const lastShown = firstShown + records.records.length - 1;

  return (
    // grid-cols-1 = minmax(0, 1fr): sem isso o título longo (truncate) alarga a tela no celular.
    <section className="grid grid-cols-1 gap-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Link
            to="/formularios"
            className="mb-1 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-tx-secondary hover:text-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Todos os processos
          </Link>
          <h1 className="truncate text-3xl font-extrabold tracking-tight text-tx-primary" title={title}>
            {title}
          </h1>
          <p className="mt-1 text-sm text-tx-secondary">
            Registros do processo — pesquise, filtre pelas respostas e monte relatórios em PDF.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/kanban/${formId}`}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-default bg-bg-surface px-3 text-sm font-semibold text-tx-secondary transition-colors hover:border-primary hover:text-primary dark:hover:text-blue-300"
          >
            <KanbanSquare className="h-4 w-4" />
            Kanban
          </Link>
          <button
            type="button"
            onClick={records.reload}
            disabled={records.fetching}
            title="Atualizar"
            aria-label="Atualizar"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border-default bg-bg-surface text-tx-secondary hover:bg-bg-s2 disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', records.fetching && 'animate-spin')} />
          </button>
          {/* Exportar é permissão própria no processo (o servidor recusa sem ela). */}
          {meta?.canExport ? (
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              disabled={!meta}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
            >
              <FileDown className="h-4 w-4" />
              Exportar relatório
            </button>
          ) : null}
        </div>
      </header>

      {records.error === 'ACCESS_DENIED' || records.error === 'NOT_FOUND' ? (
        <Card className="grid gap-3 text-center">
          <p className="text-sm font-semibold text-red-600">
            {records.error === 'NOT_FOUND'
              ? 'Processo não encontrado.'
              : 'Você não tem acesso aos registros deste processo. Peça a quem cuida dele.'}
          </p>
          <div>
            <Link to="/formularios">
              <Button size="sm" variant="subtle">
                ← Voltar
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <>
          {meta ? (
            <RecordsFilters columns={meta.columns} state={records.filterState} onChange={records.setFilterState} />
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-tx-secondary" aria-live="polite">
              {records.total === 0 ? (
                records.loadingRecords ? 'Carregando registros…' : 'Nenhum registro.'
              ) : (
                <>
                  Exibindo <strong>{firstShown}</strong>–<strong>{lastShown}</strong> de{' '}
                  <strong>{records.total.toLocaleString('pt-BR')}</strong> registro(s)
                </>
              )}
            </p>
            {meta ? (
              <ColumnPicker
                columns={meta.columns}
                visible={records.visibleColumnKeys}
                defaults={meta.defaultColumns}
                onChange={records.setVisibleColumns}
              />
            ) : null}
          </div>

          {records.error === 'FAILED' ? (
            <p className="text-sm font-semibold text-red-600">Não foi possível carregar os registros. Tente atualizar.</p>
          ) : null}

          <RecordsTable
            columns={records.visibleColumns}
            rows={records.records}
            loading={records.loadingMeta || records.loadingRecords}
            sort={records.sort}
            onSort={records.toggleSort}
            onOpen={(row) => openRecord(row.id)}
          />

          {records.totalPages > 1 ? (
            <div className="flex items-center justify-center gap-2">
              <Button
                size="sm"
                variant="subtle"
                disabled={records.page <= 1 || records.fetching}
                onClick={() => records.setPage(records.page - 1)}
              >
                ← Anterior
              </Button>
              <span className="text-sm text-tx-secondary">
                Página {records.page} de {records.totalPages}
              </span>
              <Button
                size="sm"
                variant="subtle"
                disabled={records.page >= records.totalPages || records.fetching}
                onClick={() => records.setPage(records.page + 1)}
              >
                Próxima →
              </Button>
            </div>
          ) : null}
        </>
      )}

      {openId ? <ResponseDetailModal solicitationId={openId} formId={formId || null} onClose={() => openRecord(null)} /> : null}

      {reportOpen && meta ? (
        <ReportBuilderModal
          formId={formId}
          formName={meta.formName}
          columns={meta.columns}
          visibleColumns={records.visibleColumnKeys}
          filters={records.requestFilters}
          total={records.total}
          maxRows={meta.maxReportRows}
          sampleRows={records.records}
          onClose={() => setReportOpen(false)}
        />
      ) : null}
    </section>
  );
}
