import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { LegacyResponsesRedirect } from '../../../pages/records-page';
import { EMPTY_FILTERS } from '../lib/records-lib';
import type { RecordsMeta } from '../types';
import { RecordsView } from './records-view';

// O que a pessoa pode no processo e o erro do carregamento mudam por teste.
const state = { canExport: false, error: null as null | 'ACCESS_DENIED' | 'NOT_FOUND' | 'FAILED' };

const meta = (): RecordsMeta => ({
  formId: 'form-1',
  formName: 'Checklist',
  columns: [
    { key: 'sys:title', label: 'Título', group: 'system', filter: 'text' },
    { key: 'form:lote', label: 'Lote', group: 'form', filter: 'text' },
  ],
  defaultColumns: ['sys:title', 'form:lote'],
  canExport: state.canExport,
  maxReportRows: 5000,
});

vi.mock('../hooks/use-records', () => ({
  useRecords: () => {
    const m = meta();
    return {
      meta: m,
      columnByKey: new Map(m.columns.map((column) => [column.key, column])),
      visibleColumns: m.columns,
      visibleColumnKeys: m.defaultColumns,
      setVisibleColumns: vi.fn(),
      filterState: EMPTY_FILTERS,
      setFilterState: vi.fn(),
      requestFilters: {},
      sort: { by: 'sys:createdAt', dir: 'desc' },
      toggleSort: vi.fn(),
      page: 1,
      setPage: vi.fn(),
      records: [{ id: 'sol-1', submissionId: 'sub-1', values: { 'sys:title': 'Pedido 1', 'form:lote': 'L-1' } }],
      total: 1,
      totalPages: 1,
      loadingMeta: false,
      loadingRecords: false,
      fetching: false,
      error: state.error,
      recordsError: null,
      reload: vi.fn(),
    };
  },
}));

vi.mock('../../responses/components/response-detail-modal', () => ({
  ResponseDetailModal: (props: { solicitationId: string; formId: string | null; onClose: () => void }) => (
    <div role="dialog" aria-label="Detalhe do registro">
      {props.solicitationId} · {props.formId}
      <button type="button" onClick={props.onClose}>
        Fechar
      </button>
    </div>
  ),
}));

vi.mock('../components/report-builder-modal', () => ({
  ReportBuilderModal: () => <div role="dialog" aria-label="Montar relatório" />,
}));

function Location() {
  const location = useLocation();
  return <output aria-label="local">{`${location.pathname}${location.search}`}</output>;
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/registros/:formId"
          element={
            <>
              <RecordsView />
              <Location />
            </>
          }
        />
        <Route path="/respostas/:formId" element={<LegacyResponsesRedirect />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.canExport = false;
  state.error = null;
});

describe('RecordsView — abrir um registro', () => {
  it('?solicitacao=<id> abre o registro por cima da lista; fechar tira só esse parâmetro', () => {
    renderAt('/registros/form-1?solicitacao=sol-9&x=1');
    expect(screen.getByRole('dialog', { name: 'Detalhe do registro' })).toHaveTextContent('sol-9 · form-1');

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('local')).toHaveTextContent('/registros/form-1?x=1');
  });

  it('clicar na linha abre o registro', () => {
    renderAt('/registros/form-1');
    fireEvent.click(screen.getByText('Pedido 1'));
    expect(screen.getByRole('dialog', { name: 'Detalhe do registro' })).toHaveTextContent('sol-1');
  });

  it('link antigo de Respostas (e-mail já enviado) cai nos Registros com o mesmo registro aberto', () => {
    renderAt('/respostas/form-1?solicitacao=sol-9');
    expect(screen.getByLabelText('local')).toHaveTextContent('/registros/form-1?solicitacao=sol-9');
    expect(screen.getByRole('dialog', { name: 'Detalhe do registro' })).toHaveTextContent('sol-9');
  });
});

describe('RecordsView — acesso por processo', () => {
  it('sem "exportar respostas" no processo, não há botão de relatório', () => {
    renderAt('/registros/form-1');
    expect(screen.queryByRole('button', { name: /Exportar relatório/ })).not.toBeInTheDocument();
  });

  it('com "exportar respostas", o botão abre o montador', () => {
    state.canExport = true;
    renderAt('/registros/form-1');
    fireEvent.click(screen.getByRole('button', { name: /Exportar relatório/ }));
    expect(screen.getByRole('dialog', { name: 'Montar relatório' })).toBeInTheDocument();
  });

  it('recusado (403): fala de acesso ao processo', () => {
    state.error = 'ACCESS_DENIED';
    renderAt('/registros/form-1');
    expect(
      screen.getByText('Você não tem acesso aos registros deste processo. Peça a quem cuida dele.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Pedido 1')).not.toBeInTheDocument();
  });

  it('o Kanban do processo fica a um clique', () => {
    renderAt('/registros/form-1');
    expect(screen.getByRole('link', { name: /Kanban/ })).toHaveAttribute('href', '/kanban/form-1');
  });
});
