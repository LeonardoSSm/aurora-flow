import { fireEvent, render, screen } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import { vi } from 'vitest';
import type { FlowNodeData } from '../types/flow.types';
import { AiAgentActionForm } from './NodeConfigPanel';

const mocks = vi.hoisted(() => ({
  state: {
    data: [] as unknown[],
    isLoading: false,
    isError: false,
    error: null as unknown,
    isFetching: false,
    refetch: vi.fn(),
  },
}));

vi.mock('../hooks/use-lops-ai-agents', () => ({
  useLopsAiAgentsQuery: () => mocks.state,
}));

const validador = {
  slug: 'validador-de-etiquetas',
  name: 'WMS - Validador de Etiquetas',
  model: 'gemini-3.5-flash',
  visionModel: 'gemini-3.5-flash',
  source: 'agent',
};
const outro = { slug: 'classificador', name: 'Classificador de Notas', model: null, visionModel: null, source: 'agent' };

function renderForm(d: FlowNodeData = {}) {
  const set = vi.fn();
  render(<AiAgentActionForm d={d} set={set} />);
  return { set };
}

function apiError(message: string): AxiosError {
  return new AxiosError('Request failed', 'ERR_BAD_RESPONSE', undefined, undefined, {
    status: 503,
    data: { message },
  } as AxiosResponse);
}

describe('AiAgentActionForm (nó LOPS IA)', () => {
  beforeEach(() => {
    mocks.state.data = [validador, outro];
    mocks.state.isLoading = false;
    mocks.state.isError = false;
    mocks.state.error = null;
    mocks.state.isFetching = false;
    mocks.state.refetch = vi.fn();
  });

  it('lista os agentes da LOPS IA pelo nome para escolher, no lugar de URL base e slug', () => {
    renderForm();

    const select = screen.getByRole('combobox', { name: 'Agente' });
    const options = Array.from(select.querySelectorAll('option')).map((option) => option.textContent);
    expect(options).toEqual(['Selecionar agente', 'WMS - Validador de Etiquetas', 'Classificador de Notas']);

    expect(screen.queryByText(/URL base/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Slug do agente/i)).not.toBeInTheDocument();
  });

  it('mantém o campo de chave de API no nó (campo de senha), com o aviso do papel da chave do servidor', () => {
    renderForm({ apiKey: 'chave-do-no' });

    const input = document.querySelector('input[type="password"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('chave-do-no');
    expect(screen.getByText(/A chave do servidor só é usada para listar os agentes/)).toBeInTheDocument();
  });

  it('digitar a chave grava apiKey no nó', () => {
    const { set } = renderForm({});

    fireEvent.change(document.querySelector('input[type="password"]') as HTMLInputElement, {
      target: { value: 'minha-chave' },
    });

    expect(set).toHaveBeenCalledWith('apiKey', 'minha-chave');
  });

  it('pede a chave de API quando o nó ainda não tem uma e some quando preenchida', () => {
    const { rerender } = (() => {
      const set = vi.fn();
      const view = render(<AiAgentActionForm d={{ agentSlug: 'validador-de-etiquetas' }} set={set} />);
      return { rerender: view.rerender, set };
    })();
    expect(screen.getByText('Informe a chave de API.')).toBeInTheDocument();

    rerender(<AiAgentActionForm d={{ agentSlug: 'validador-de-etiquetas', apiKey: 'k' }} set={vi.fn()} />);
    expect(screen.queryByText('Informe a chave de API.')).not.toBeInTheDocument();
  });

  it('ao escolher um agente grava slug e nome e NÃO mexe na chave nem na URL já salvas no nó', () => {
    const { set } = renderForm({ apiKey: 'chave-do-no', baseUrl: 'https://legado.example.com' });

    fireEvent.change(screen.getByRole('combobox', { name: 'Agente' }), {
      target: { value: 'validador-de-etiquetas' },
    });

    expect(set).toHaveBeenCalledWith('agentSlug', 'validador-de-etiquetas');
    expect(set).toHaveBeenCalledWith('agentName', 'WMS - Validador de Etiquetas');
    expect(set.mock.calls.map(([key]) => key).sort()).toEqual(['agentName', 'agentSlug']);
  });

  it('mostra slug e modelo do agente escolhido', () => {
    renderForm({ agentSlug: 'validador-de-etiquetas' });

    expect(screen.getByText('slug: validador-de-etiquetas · modelo: gemini-3.5-flash')).toBeInTheDocument();
  });

  it('pede para escolher o agente quando o nó ainda não tem um', () => {
    renderForm({});

    expect(screen.getByText('Escolha o agente.')).toBeInTheDocument();
  });

  it('mantém visível, com aviso, um agente salvo que não existe mais na lista', () => {
    renderForm({ agentSlug: 'removido', agentName: 'Agente Antigo' });

    const select = screen.getByRole('combobox', { name: 'Agente' }) as HTMLSelectElement;
    expect(select.value).toBe('removido');
    expect(screen.getByRole('option', { name: 'Agente Antigo (não encontrado na LOPS IA)' })).toBeInTheDocument();
  });

  it('desabilita o select enquanto carrega a lista', () => {
    mocks.state.data = [];
    mocks.state.isLoading = true;

    renderForm({ agentSlug: 'validador-de-etiquetas' });

    expect(screen.getByRole('combobox', { name: 'Agente' })).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Carregando agentes...' })).toBeInTheDocument();
    expect(screen.queryByText('Escolha o agente.')).not.toBeInTheDocument();
  });

  it('mostra o motivo do servidor quando a lista falha e permite tentar de novo', () => {
    mocks.state.data = [];
    mocks.state.isError = true;
    mocks.state.error = apiError('LOPS_AI_API_KEY não está configurada no servidor.');

    renderForm({ agentSlug: 'validador-de-etiquetas' });

    expect(screen.getByRole('alert')).toHaveTextContent('LOPS_AI_API_KEY não está configurada no servidor.');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(mocks.state.refetch).toHaveBeenCalledTimes(1);
    // com a lista indisponível, o agente já salvo não é tratado como "removido"
    expect(screen.queryByText(/não encontrado na LOPS IA/)).not.toBeInTheDocument();
  });

  it('mantém mensagem e timeout, com o padrão vindo do servidor', () => {
    const { set } = renderForm({ message: 'Analise essa imagem.' });

    expect(screen.getByDisplayValue('Analise essa imagem.')).toBeInTheDocument();
    expect(screen.getByText(/LOPS_AI_TIMEOUT_MS/)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('30000'), { target: { value: '45000' } });
    expect(set).toHaveBeenCalledWith('timeoutMs', 45000);
  });
});
