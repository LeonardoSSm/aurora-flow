import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadErpTableField } from '../../erp-lookup/erp-lookup-api';
import type * as ErpLookupApi from '../../erp-lookup/erp-lookup-api';
import { isErpTableAnswer } from '../erp-table';
import type { ErpTableAnswer, PublicAnswerValue, PublicFormField } from '../types';
import { ErpTableField } from './erp-table-field';

vi.mock('../../erp-lookup/erp-lookup-api', async (importOriginal) => {
  const original = await importOriginal<typeof ErpLookupApi>();
  return { ...original, loadErpTableField: vi.fn() };
});
const load = vi.mocked(loadErpTableField);

const FIELD: PublicFormField = {
  id: 'f-itens',
  code: 'itens',
  label: 'Itens do pedido',
  fieldType: 'erp_table',
  required: true,
  order: 2,
  settingsJson: {
    dependsOn: ['pedido'],
    sourceColumns: [
      { key: 'produto', label: 'Produto', type: 'text' },
      { key: 'qtde', label: 'Qtd. pedida', type: 'number' },
    ],
    inputColumns: [{ id: 'conferida', label: 'Qtd. conferida', type: 'number', required: true }],
  },
  conditionsJson: {},
  visibilityRules: null,
  options: [],
};

const CARGA = {
  schemaVersion: 1 as const,
  sourceHash: 'sha256-1',
  fetchedAt: '2026-10-08T15:30:00.000Z',
  rows: [
    { key: 'A', values: { produto: 'Ovos', qtde: 10 } },
    { key: 'B', values: { produto: 'Leite', qtde: 5 } },
  ],
};

/** O formulário de verdade guarda a resposta no hook; aqui um estado local faz o papel. */
function Harness({
  pedido,
  initial = null,
  formId = 'form-1',
  onValue,
}: {
  pedido: PublicAnswerValue;
  initial?: PublicAnswerValue;
  formId?: string;
  onValue?: (value: PublicAnswerValue) => void;
}) {
  const [value, setValue] = useState<PublicAnswerValue>(initial);
  return (
    <ErpTableField
      field={FIELD}
      value={value}
      formId={formId}
      answersByCode={{ pedido }}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
    />
  );
}

beforeEach(() => {
  load.mockReset();
});

describe('ErpTableField', () => {
  it('sem o pedido não consulta o ERP', () => {
    render(<Harness pedido={null} />);
    expect(screen.getByText(/Preencha os campos anteriores/)).toBeInTheDocument();
    expect(load).not.toHaveBeenCalled();
  });

  it('carrega com o código do pedido, mostra colunas do ERP só leitura e uma linha por item', async () => {
    load.mockResolvedValue(CARGA);
    render(<Harness pedido={{ value: '123', label: 'Pedido 123' }} />);

    await waitFor(() => expect(screen.getAllByText('Ovos').length).toBeGreaterThan(0));
    expect(load).toHaveBeenCalledWith('form-1', 'itens', { pedido: '123' }, expect.any(AbortSignal));
    const table = screen.getByRole('table');
    expect(within(table).getAllByText('ERP')).toHaveLength(2);
    expect(within(table).getAllByRole('spinbutton')).toHaveLength(2);
    expect(within(table).queryByDisplayValue('Ovos')).toBeNull();
  });

  it('preencher uma célula grava a resposta pela chave da linha', async () => {
    load.mockResolvedValue(CARGA);
    const onValue = vi.fn();
    render(<Harness pedido="123" onValue={onValue} />);
    const table = await screen.findByRole('table');

    fireEvent.change(within(table).getByLabelText('Qtd. conferida — item 1'), {
      target: { value: '8' },
    });

    const last = onValue.mock.calls.at(-1)?.[0] as ErpTableAnswer;
    expect(last.answers.A).toEqual({ conferida: 8 });
    expect(last.sourceHash).toBe('sha256-1');
  });

  it('troca de pedido com tabela preenchida pede confirmação antes de apagar', async () => {
    load.mockResolvedValue(CARGA);
    const preenchida: ErpTableAnswer = {
      kind: 'erp_table',
      dependencyKey: JSON.stringify([['pedido', '123']]),
      sourceHash: 'sha256-1',
      fetchedAt: '',
      rows: CARGA.rows,
      answers: { A: { conferida: 8 }, B: {} },
    };
    const onValue = vi.fn();
    render(<Harness pedido="999" initial={preenchida} onValue={onValue} />);

    expect(await screen.findByText(/O registro mudou/)).toBeInTheDocument();
    expect(load).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Carregar itens do novo registro/ }));
    await waitFor(() =>
      expect(load).toHaveBeenCalledWith('form-1', 'itens', { pedido: '999' }, expect.any(AbortSignal)),
    );
  });

  it('depois de um 409 recarrega, mantém o que foi digitado e pede conferência', async () => {
    load.mockResolvedValue({
      ...CARGA,
      sourceHash: 'sha256-2',
      rows: [CARGA.rows[0], { key: 'C', values: { produto: 'Queijo', qtde: 1 } }],
    });
    const stale: ErpTableAnswer = {
      kind: 'erp_table',
      dependencyKey: JSON.stringify([['pedido', '123']]),
      sourceHash: 'sha256-1',
      fetchedAt: '',
      rows: CARGA.rows,
      answers: { A: { conferida: 8 }, B: { conferida: 5 } },
      stale: true,
    };
    const onValue = vi.fn();
    render(<Harness pedido="123" initial={stale} onValue={onValue} />);

    expect(await screen.findByText(/Os itens foram alterados no ERP/)).toBeInTheDocument();
    const reloaded = onValue.mock.calls.at(-1)?.[0] as ErpTableAnswer;
    expect(reloaded.answers.A).toEqual({ conferida: 8 });
    expect(reloaded.review?.added).toEqual(['C']);
    expect(screen.getByText('Leite - 5')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Conferi os itens' }));
    const confirmed = onValue.mock.calls.at(-1)?.[0];
    expect(isErpTableAnswer(confirmed) && confirmed.review).toBeNull();
  });

  it('ERP fora: mostra a mensagem e deixa tentar de novo', async () => {
    load.mockRejectedValueOnce(
      new AxiosError('fora', 'ERR', undefined, undefined, {
        status: 503,
        statusText: 'Service Unavailable',
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: { code: 'ERP_INDISPONIVEL', message: 'O banco de dados do ERP está fora do ar.' },
      }),
    );
    load.mockResolvedValueOnce(CARGA);
    render(<Harness pedido="123" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('O banco de dados do ERP está fora do ar.');
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('pedido sem itens mostra o estado vazio', async () => {
    load.mockResolvedValue({ ...CARGA, rows: [] });
    render(<Harness pedido="123" />);
    expect(await screen.findByText(/Nenhum item encontrado no ERP/)).toBeInTheDocument();
  });

  it('sem formId (construtor) mostra só a estrutura, sem consultar', () => {
    render(<ErpTableField field={FIELD} value={null} onChange={() => {}} />);
    expect(screen.getByText('Qtd. conferida')).toBeInTheDocument();
    expect(screen.getByText(/Uma linha por item do ERP/)).toBeInTheDocument();
    expect(load).not.toHaveBeenCalled();
  });
});
