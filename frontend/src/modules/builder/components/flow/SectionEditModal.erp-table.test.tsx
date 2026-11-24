import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { useReducer } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../../components/ui';
import { builderReducer, makeInitialState, type BuilderState } from '../../state/builder-reducer';
import { mapDraftToCreatePayload, type DraftField, type DraftSection } from '../../types';
import { SectionEditModal } from './SectionEditModal';

// Caso real (prod, 2026-11-04): a "Tabela dinâmica do ERP" é o 1º campo da seção. O parâmetro
// "pedidoId" não tinha nenhum campo para escolher, nada era associado e a publicação recusava
// com "o parâmetro "pedidoId" precisa de um campo associado".
vi.mock('../../../erp-lookup/erp-lookup-api', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    fetchErpLookupConnectors: vi.fn().mockResolvedValue([{ id: 'c1', name: 'Consultas ERP' }]),
    fetchErpLookupSources: vi.fn().mockResolvedValue([{ id: 'pedidos', label: 'Pedidos de venda' }]),
    fetchErpTables: vi.fn().mockResolvedValue([
      {
        id: 'itens',
        label: 'Itens do pedido',
        parameters: [{ name: 'pedidoId', type: 'number', required: true }],
        columns: [{ key: 'produto', label: 'Produto', type: 'text' }],
        rowKey: 'item',
        maxRows: 500,
      },
    ]),
  };
});

function field(id: string, label: string, overrides: Partial<DraftField> = {}): DraftField {
  return {
    id,
    code: id,
    label,
    fieldType: 'short_text',
    required: false,
    isSensitive: false,
    options: [],
    settingsJson: {},
    conditionsJson: {},
    visibilityRules: null,
    ...overrides,
  };
}

const table = field('numero_do_pedido', 'Numero do Pedido', {
  fieldType: 'erp_table',
  required: true,
  settingsJson: {
    erpConnectorId: 'c1',
    fonte: 'pedidos',
    dataset: 'itens',
    parameterBindings: [],
    sourceColumns: [{ key: 'produto', label: 'Produto', type: 'text' }],
    inputColumns: [],
  },
});

const section: DraftSection = {
  id: 's1',
  serverId: null,
  title: 'Identificação de Reclamação',
  description: '',
  nextSectionId: null,
  nextIsSubmit: true,
  flowPositionX: null,
  flowPositionY: null,
  branches: [],
  fields: [table, field('breve_relato', 'Breve relato')],
};

let latest: BuilderState | null = null;

/** Modal ligado ao reducer de verdade, como no mapa do processo (ProcessMapView). */
function Harness() {
  const [state, dispatch] = useReducer(builderReducer, undefined, () => {
    const initial = makeInitialState();
    return { ...initial, draft: { ...initial.draft, name: 'Registro', sections: [section] } };
  });
  latest = state;
  const current = state.draft.sections[0];
  return (
    <SectionEditModal
      section={current}
      sections={state.draft.sections}
      formId={null}
      availableFields={[]}
      erpTableEnabled
      onClose={() => {}}
      onSelectSection={() => {}}
      onUpdateSection={() => {}}
      onRemoveSection={() => {}}
      canRemoveSection={false}
      onAddField={(fieldType) => {
        const fieldId = `novo_${current.fields.length}`;
        dispatch({ type: 'ADD_FIELD', sectionId: current.id, fieldType, fieldId });
        return fieldId;
      }}
      onRemoveField={(fieldId) => dispatch({ type: 'REMOVE_FIELD', sectionId: current.id, fieldId })}
      onUpdateField={(fieldId, key, value) =>
        dispatch({ type: 'UPDATE_FIELD', sectionId: current.id, fieldId, key, value })
      }
      onMoveField={(fromIndex, toIndex) =>
        dispatch({ type: 'MOVE_FIELD', sectionId: current.id, fromIndex, toIndex })
      }
      onSetSectionFlow={() => {}}
    />
  );
}

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <Harness />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

async function openTableSettings() {
  fireEvent.click(screen.getByRole('button', { name: /^Numero do Pedido —/ }));
  if (!screen.queryByText('Conector de ERP')) {
    fireEvent.click(screen.getByRole('button', { name: /Configurações/ }));
  }
  // A definição da tabela (parâmetros) chega pela consulta ao erp-lookup.
  return screen.findByText(/pedidoId/, { selector: 'span' });
}

afterEach(() => {
  latest = null;
});

describe('SectionEditModal — parâmetro da Tabela dinâmica do ERP', () => {
  it('tabela como 1º campo: avisa que não há campo antes dela e oferece criar um', async () => {
    renderModal();
    await openTableSettings();

    expect(
      screen.getByRole('option', { name: 'Nenhum campo antes da tabela pode ser usado' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/ainda não tem nenhum antes dela/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Criar campo "Pedido id" antes da tabela' }),
    ).toBeInTheDocument();
  });

  it('"Criar campo" põe um Número obrigatório antes da tabela, associa e a associação vai no payload', async () => {
    renderModal();
    await openTableSettings();

    fireEvent.click(screen.getByRole('button', { name: 'Criar campo "Pedido id" antes da tabela' }));

    if (!latest) throw new Error('harness não renderizou');
    const draft = (latest as BuilderState).draft;
    const fields = draft.sections[0].fields;
    expect(fields.map((f) => f.code)).toEqual(['pedido_id', 'numero_do_pedido', 'breve_relato']);
    expect(fields[0]).toMatchObject({ label: 'Pedido id', fieldType: 'number', required: true });

    // O seletor mostra o campo criado e o aviso some.
    expect(screen.getByRole('combobox', { name: /pedidoId/ })).toHaveValue('pedido_id');
    expect(screen.queryByText(/Associe "pedidoId"/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Criar campo/ })).not.toBeInTheDocument();

    // O que vai para o backend (e é conferido na publicação) leva a associação.
    const payload = mapDraftToCreatePayload((latest as BuilderState).draft);
    const sent = payload.sections[0].fields.find((f) => f.code === 'numero_do_pedido');
    expect(sent?.settingsJson?.parameterBindings).toEqual([
      { parameter: 'pedidoId', fieldCode: 'pedido_id' },
    ]);
  });
});
