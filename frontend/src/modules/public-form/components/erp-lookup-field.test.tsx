import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchErpLookupFieldDetails,
  searchErpLookupField,
  type ErpLookupDetails,
} from '../../erp-lookup/erp-lookup-api';
import type * as ErpLookupApi from '../../erp-lookup/erp-lookup-api';
import type { PublicAnswerValue, PublicFormField } from '../types';
import {
  ErpDetailsDrawerContext,
  ErpDetailsSlotContext,
  isWideErpSection,
} from './erp-details-slot';
import { ErpLookupField } from './erp-lookup-field';

vi.mock('../../erp-lookup/erp-lookup-api', async (importOriginal) => {
  const original = await importOriginal<typeof ErpLookupApi>();
  return { ...original, searchErpLookupField: vi.fn(), fetchErpLookupFieldDetails: vi.fn() };
});
const search = vi.mocked(searchErpLookupField);
const fetchDetails = vi.mocked(fetchErpLookupFieldDetails);

const FICHA: ErpLookupDetails = {
  value: '3240310',
  titulo: 'Pedido 3240310',
  alertas: [
    { tipo: 'perigo', texto: 'Pedido cancelado em 10/06/2026 15:07.' },
    { tipo: 'aviso', texto: 'Sincronismo com o TOTVS pendente.' },
  ],
  resumo: [
    { label: 'Cliente', valor: 'LAURA DE OLIVEIRA' },
    { label: 'Valor total', valor: 'R$ 439,60' },
    { label: 'Situação', valor: 'Cancelado' },
  ],
  secoes: [
    { titulo: 'Cliente', campos: [{ label: 'CPF/CNPJ', valor: '211.121.853-72' }] },
    { titulo: 'Valores', campos: [{ label: 'Saldo devedor', valor: 'R$ 439,60' }] },
    { titulo: 'Nota fiscal', campos: [{ label: 'Chave de acesso', valor: '2326', largo: true }] },
  ],
  tabelas: [
    {
      titulo: 'Itens',
      colunas: [
        { chave: 'codigo', label: 'Código' },
        { chave: 'produto', label: 'Produto' },
        { chave: 'unidade', label: 'Un.' },
        { chave: 'total', label: 'Total', numerica: true },
      ],
      linhas: [
        { codigo: '833', produto: 'OVO JUMBO', unidade: 'BD', total: 'R$ 444,00' },
        { codigo: '840', produto: 'OVO EXTRA', unidade: 'CX', total: 'R$ 155,34' },
      ],
      total: { produto: 'Total', total: 'R$ 599,34' },
    },
  ],
};

function field(settingsJson: PublicFormField['settingsJson']): PublicFormField {
  return {
    id: 'f-cliente',
    code: 'cliente',
    label: 'Cliente',
    fieldType: 'erp_lookup',
    required: true,
    order: 1,
    settingsJson,
    conditionsJson: {},
    visibilityRules: null,
    options: [],
  };
}

function httpError(status: number, data: unknown): AxiosError {
  const error = new AxiosError('erro', String(status));
  error.response = { status, data, statusText: '', headers: {}, config: { headers: new AxiosHeaders() } };
  return error;
}

function renderField(props: {
  settings?: PublicFormField['settingsJson'];
  value?: PublicAnswerValue;
  formId?: string;
  onChange?: (value: PublicAnswerValue) => void;
  /** Painel ao lado do formulário (tela larga do formulário público). */
  detailsSlot?: HTMLElement;
  /** Gaveta da ficha (etapa com tabela larga). */
  drawerHost?: HTMLElement;
}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ErpDetailsSlotContext.Provider value={props.detailsSlot ?? null}>
        <ErpDetailsDrawerContext.Provider value={props.drawerHost ?? null}>
          {children}
        </ErpDetailsDrawerContext.Provider>
      </ErpDetailsSlotContext.Provider>
    </QueryClientProvider>
  );
  return render(
    <ErpLookupField
      field={field(props.settings ?? { modo: 'pesquisa', minCaracteres: 3 })}
      value={props.value ?? null}
      formId={'formId' in props ? props.formId : 'form-1'}
      onChange={props.onChange ?? (() => {})}
      inputStyle={{}}
    />,
    { wrapper },
  );
}

describe('ErpLookupField', () => {
  beforeEach(() => {
    search.mockReset();
    fetchDetails.mockReset();
  });

  it('só pesquisa a partir do mínimo de caracteres e escolhe a opção (código + nome)', async () => {
    search.mockResolvedValue([{ value: '001', label: 'ACME LTDA' }]);
    const onChange = vi.fn();
    renderField({ onChange });
    const input = screen.getByRole('searchbox', { name: 'Pesquisar Cliente' });

    fireEvent.change(input, { target: { value: 'ac' } });
    expect(await screen.findByText('Digite pelo menos 3 caracteres.')).toBeInTheDocument();
    expect(search).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'acm' } });
    fireEvent.click(await screen.findByRole('option', { name: 'ACME LTDA' }));

    expect(search).toHaveBeenCalledWith('form-1', 'cliente', 'acm');
    expect(onChange).toHaveBeenCalledWith({ value: '001', label: 'ACME LTDA' });
  });

  it('modo lista carrega tudo e filtra no navegador, ignorando acento', async () => {
    search.mockResolvedValue([
      { value: '1', label: 'São Paulo' },
      { value: '2', label: 'Rio de Janeiro' },
    ]);
    renderField({ settings: { modo: 'lista' } });

    expect(await screen.findByRole('option', { name: 'Rio de Janeiro' })).toBeInTheDocument();
    expect(search).toHaveBeenCalledWith('form-1', 'cliente', '');

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'sao' } });
    expect(screen.getByRole('option', { name: 'São Paulo' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Rio de Janeiro' })).toBeNull();
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('mostra a escolha e permite trocar', () => {
    fetchDetails.mockResolvedValue(null);
    const onChange = vi.fn();
    renderField({ value: { value: '001', label: 'ACME LTDA' }, onChange });

    expect(screen.getByText('ACME LTDA')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Trocar' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('rótulo "Pedido — cliente — empresa" vira duas linhas nas opções', async () => {
    search.mockResolvedValue([{ value: '3240701', label: 'Pedido 3240701 — TIJUCA MATRIZ — TIJUCA LTDA' }]);
    renderField({});
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '3240701' } });

    const option = await screen.findByRole('option');
    expect(option.children[0]).toHaveTextContent(/^Pedido 3240701$/);
    expect(option.children[1]).toHaveTextContent(/^TIJUCA MATRIZ · TIJUCA LTDA$/);
  });

  it('com a escolha feita, mostra a ficha: alertas, resumo, situação e abas (tabelas primeiro)', async () => {
    fetchDetails.mockResolvedValue(FICHA);
    renderField({ value: { value: '3240310', label: 'Pedido 3240310 — LAURA' } });

    expect(screen.getByText('LAURA')).toBeInTheDocument();
    const ficha = await screen.findByRole('region', { name: 'Detalhes: Pedido 3240310' });
    expect(fetchDetails).toHaveBeenCalledWith('form-1', 'cliente', '3240310');
    expect(screen.getByRole('alert')).toHaveTextContent('Pedido cancelado em 10/06/2026 15:07.');
    expect(ficha).toHaveTextContent('Sincronismo com o TOTVS pendente.');
    expect(ficha).toHaveTextContent('LAURA DE OLIVEIRA');
    // Situação sai do resumo e vira selo no cabeçalho.
    expect(within(ficha).getByRole('heading', { name: 'Pedido 3240310' }).parentElement).toHaveTextContent('Cancelado');
    expect(ficha.querySelector('dl')).not.toHaveTextContent('Situação');
    expect(within(ficha).queryByRole('button', { name: 'Expandir tudo' })).toBeNull();

    // Uma aba por tabela (com contador) e uma por seção; a primeira tabela já aberta.
    const tabs = within(ficha).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Itens2', 'Cliente', 'Valores', 'Nota fiscal']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('columnheader', { name: 'Total' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'R$ 599,34' })).toBeInTheDocument();
    // Código e unidade não têm coluna: viram a linha de apoio do produto.
    expect(screen.queryByRole('columnheader', { name: 'Código' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Un.' })).toBeNull();
    expect(screen.getByText('Cód. 833 · BD')).toBeInTheDocument();

    fireEvent.click(tabs[3]);
    expect(tabs[3]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Chave de acesso');
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('tela larga com painel: a ficha vai para o painel ao lado e o X troca a escolha', async () => {
    fetchDetails.mockResolvedValue(FICHA);
    const matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal('matchMedia', matchMedia);
    const slot = document.createElement('div');
    document.body.appendChild(slot);
    try {
      const onChange = vi.fn();
      const { container } = renderField({
        value: { value: '3240310', label: 'Pedido 3240310' },
        detailsSlot: slot,
        onChange,
      });

      await screen.findByRole('region', { name: 'Detalhes: Pedido 3240310' });
      expect(matchMedia).toHaveBeenCalledWith('(min-width: 1100px)');
      // A ficha (marcada para abrir o painel) está no painel, não dentro do campo.
      expect(slot.querySelector('[data-erp-side] section')).toHaveAccessibleName('Detalhes: Pedido 3240310');
      expect(container.querySelector('section')).toBeNull();
      expect(screen.queryByText('Detalhes ao lado')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Fechar detalhes' }));
      expect(onChange).toHaveBeenCalledWith(null);
    } finally {
      vi.unstubAllGlobals();
      slot.remove();
    }
  });

  it('etapa com tabela larga: a ficha fica na gaveta, aberta pelo "Ver ficha"; alertas ficam à vista', async () => {
    fetchDetails.mockResolvedValue(FICHA);
    // Mesmo com o painel lateral disponível, a gaveta manda.
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const slot = document.createElement('div');
    const drawerHost = document.createElement('div');
    document.body.append(slot, drawerHost);
    try {
      const onChange = vi.fn();
      renderField({
        value: { value: '3240310', label: 'Pedido 3240310' },
        detailsSlot: slot,
        drawerHost,
        onChange,
      });

      const open = await screen.findByRole('button', { name: 'Ver ficha' });
      // Fechada: nem painel nem ficha no campo, mas o alerta de perigo aparece sob a escolha.
      expect(slot).toBeEmptyDOMElement();
      expect(screen.queryByRole('region', { name: 'Detalhes: Pedido 3240310' })).toBeNull();
      expect(screen.getByRole('alert')).toHaveTextContent('Pedido cancelado em 10/06/2026 15:07.');

      open.focus();
      fireEvent.click(open);
      const dialog = within(drawerHost).getByRole('dialog', { name: 'Detalhes: Pedido 3240310' });
      expect(dialog).toHaveFocus();
      expect(within(dialog).getAllByRole('tab')[0]).toHaveTextContent('Itens');

      // Esc fecha sem trocar a escolha e devolve o foco ao botão.
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(within(drawerHost).queryByRole('dialog')).toBeNull();
      expect(open).toHaveFocus();

      // O X da ficha, na gaveta, também só fecha.
      fireEvent.click(open);
      fireEvent.click(within(drawerHost).getByRole('button', { name: 'Fechar detalhes' }));
      expect(within(drawerHost).queryByRole('dialog')).toBeNull();
      expect(onChange).not.toHaveBeenCalled();

      // Trocar com a gaveta aberta fecha a gaveta e limpa a escolha.
      fireEvent.click(open);
      fireEvent.click(screen.getByRole('button', { name: 'Trocar' }));
      expect(within(drawerHost).queryByRole('dialog')).toBeNull();
      expect(onChange).toHaveBeenCalledWith(null);
    } finally {
      vi.unstubAllGlobals();
      slot.remove();
      drawerHost.remove();
    }
  });

  it('ficha indisponível (ERP fora) não impede a escolha: só avisa', async () => {
    fetchDetails.mockRejectedValue(httpError(503, { code: 'ERP_INDISPONIVEL', message: 'fora' }));
    renderField({ value: { value: '001', label: 'ACME LTDA' } });

    expect(
      await screen.findByText(
        'Os detalhes não puderam ser carregados: o banco do ERP está fora do ar no momento.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trocar' })).toBeInTheDocument();
  });

  it('ERP fora: avisa dentro do campo', async () => {
    search.mockRejectedValue(httpError(503, { code: 'ERP_INDISPONIVEL', message: 'fora' }));
    renderField({ settings: { modo: 'lista' } });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O banco do ERP está fora do ar no momento.',
    );
  });

  it('exige login: avisa e oferece entrar em outra aba', async () => {
    search.mockRejectedValue(httpError(401, { message: 'Entre na sua conta para pesquisar nesta lista.' }));
    renderField({ settings: { modo: 'lista', exigirLogin: true } });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Entre na sua conta para pesquisar nesta lista.');
    const link = screen.getByRole('link', { name: 'Entrar (abre em outra aba)' });
    expect(link).toHaveAttribute('href', '/login');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('nenhum resultado', async () => {
    search.mockResolvedValue([]);
    renderField({});

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'xyz' } });

    await waitFor(() =>
      expect(screen.getByText('Nenhum resultado para "xyz".')).toBeInTheDocument(),
    );
  });

  it('etapa larga = Lista do ERP + tabela (do ERP, pedido de itens ou produtos) na mesma etapa', () => {
    const types = (...fieldTypes: string[]) => fieldTypes.map((fieldType) => ({ fieldType }));
    expect(isWideErpSection(types('erp_lookup', 'erp_table'))).toBe(true);
    expect(isWideErpSection(types('erp_lookup', 'text', 'item_order'))).toBe(true);
    expect(isWideErpSection(types('product_table', 'erp_lookup'))).toBe(true);
    expect(isWideErpSection(types('erp_lookup', 'text'))).toBe(false);
    expect(isWideErpSection(types('erp_table'))).toBe(false);
  });

  it('sem formulário publicado (pré-visualização) não pesquisa', () => {
    renderField({ formId: undefined });

    expect(screen.getByText('As opções vêm do ERP quando o formulário estiver publicado.')).toBeInTheDocument();
    expect(search).not.toHaveBeenCalled();
    expect(fetchDetails).not.toHaveBeenCalled();
  });
});
