import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import type { FlowNodeData } from '../types/flow.types';
import { ApprovalActionForm } from './NodeConfigPanel';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../../../services/api', () => ({ api: { get: mocks.get } }));

function renderForm(d: FlowNodeData = {}) {
  const set = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ApprovalActionForm d={{ title: 'Aprovação do gestor', ...d }} formId={null} set={set} />
    </QueryClientProvider>,
  );
  return { set };
}

const emailsBox = () => screen.getByRole('textbox', { name: 'Aprovadores por e-mail' });
const lastCall = (set: ReturnType<typeof vi.fn>, key: string) =>
  [...set.mock.calls].reverse().find(([k]) => k === key)?.[1];

describe('ApprovalActionForm — aprovadores externos (por e-mail)', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.get.mockResolvedValue({ data: [] });
  });

  describe('lista fixa', () => {
    it('oferece o campo de e-mails e guarda a lista normalizada, sem repetidos', () => {
      const { set } = renderForm();

      fireEvent.change(emailsBox(), { target: { value: 'Gestor@X.com, outro@y.com; gestor@x.com' } });

      expect(lastCall(set, 'approverEmails')).toEqual(['gestor@x.com', 'outro@y.com']);
    });

    it('mostra o que está salvo no nó ao reabrir', () => {
      renderForm({ approverEmails: ['gestor@x.com', 'outro@y.com'] });

      expect(emailsBox()).toHaveValue('gestor@x.com, outro@y.com');
    });

    it('e-mail inválido é apontado e mantido na lista (a validação do fluxo bloqueia o salvamento)', () => {
      const { set } = renderForm();

      fireEvent.change(emailsBox(), { target: { value: 'gestor@x.com, lixo' } });

      expect(screen.getByText('E-mail inválido: lixo')).toBeInTheDocument();
      expect(lastCall(set, 'approverEmails')).toEqual(['gestor@x.com', 'lixo']);
    });

    it('apagar tudo remove a configuração (undefined), não deixa lista vazia', () => {
      const { set } = renderForm({ approverEmails: ['gestor@x.com'] });

      fireEvent.change(emailsBox(), { target: { value: '' } });

      expect(lastCall(set, 'approverEmails')).toBeUndefined();
    });

    it('cobra um aprovador quando não há usuário nem e-mail', () => {
      renderForm();

      expect(
        screen.getByText('Selecione ao menos um aprovador (perfil, usuário ou e-mail).'),
      ).toBeInTheDocument();
    });

    it('só perfis já basta: some a cobrança de aprovador', () => {
      renderForm({ approverRoleCodes: ['diretor'] });

      expect(screen.queryByText(/Selecione ao menos um aprovador/)).not.toBeInTheDocument();
    });

    it('só e-mails já basta: some a cobrança de aprovador', () => {
      renderForm({ approverEmails: ['gestor@x.com'] });

      expect(screen.queryByText(/Selecione ao menos um aprovador/)).not.toBeInTheDocument();
    });

    it('explica a diferença entre usuário ativo e externo', () => {
      renderForm();

      expect(screen.getByText(/link pessoal por e-mail/)).toBeInTheDocument();
      expect(screen.getByText(/decide\s+dentro do sistema/)).toBeInTheDocument();
    });

    it('não mostra a opção "aprovador externo" (ela é dos modos campo e dinâmico)', () => {
      renderForm();

      expect(screen.queryByLabelText(/Permitir aprovador externo/)).not.toBeInTheDocument();
    });
  });

  describe.each([
    ['campo do formulário', { approverSourceMode: 'field', approverFieldCode: 'email_gestor' }],
    ['dinâmico (webhook)', { approverSourceMode: 'dynamic', approversPath: 'header.aprovadores' }],
  ] as const)('modo %s', (_label, data) => {
    it('vem com "aprovador externo" desligado e o texto antigo (e-mail precisa ser de usuário ativo)', () => {
      renderForm({ ...data });

      expect(screen.getByLabelText(/Permitir aprovador externo/)).not.toBeChecked();
      expect(screen.getByText(/usuários ativos|usuário ativo/)).toBeInTheDocument();
      expect(screen.queryByText(/Atenção: o e-mail informado recebe um link/)).not.toBeInTheDocument();
    });

    it('ligar guarda allowExternalApprovers=true', () => {
      const { set } = renderForm({ ...data });

      fireEvent.click(screen.getByLabelText(/Permitir aprovador externo/));

      expect(set).toHaveBeenCalledWith('allowExternalApprovers', true);
    });

    it('ligado: avisa do risco e exige SMTP', () => {
      renderForm({ ...data, allowExternalApprovers: true });

      expect(screen.getByLabelText(/Permitir aprovador externo/)).toBeChecked();
      expect(screen.getByText(/Atenção: o e-mail informado recebe um link/)).toBeInTheDocument();
      expect(screen.getByText(/SMTP configurado/)).toBeInTheDocument();
    });

    it('desligar guarda false', () => {
      const { set } = renderForm({ ...data, allowExternalApprovers: true });

      fireEvent.click(screen.getByLabelText(/Permitir aprovador externo/));

      expect(set).toHaveBeenCalledWith('allowExternalApprovers', false);
    });
  });
});
