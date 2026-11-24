import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';
import { ToastProvider } from '../../../components/ui';
import { CreateApprovalModal } from './create-approval-modal';

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  users: [
    { id: 'user-1', fullName: 'Maria Souza', email: 'maria@tijucaalimentos.com' },
    { id: 'user-2', fullName: 'João Lima', email: 'joao@tijucaalimentos.com' },
  ],
}));

vi.mock('../hooks/use-create-approval-mutation', () => ({
  useCreateApprovalMutation: () => ({ mutate: mocks.mutate, isPending: false }),
}));
vi.mock('../../users/services/users-api', () => ({
  fetchAssignableUsers: () => Promise.resolve(mocks.users),
}));
vi.mock('../../admin/hooks/use-roles', () => ({
  useRoleOptionsQuery: () => ({ data: [{ code: 'diretoria', name: 'Diretoria' }] }),
}));

/** Abre a janela de aprovadores, marca os usuários/perfis e confirma. */
async function pick({ users = [] as RegExp[], roles = [] as RegExp[] }) {
  fireEvent.click(screen.getByRole('button', { name: /aprovadores/ }));
  const janela = screen.getByRole('dialog', { name: 'Escolher aprovadores' });
  for (const role of roles) fireEvent.click(within(janela).getByRole('option', { name: role }));
  if (users.length) fireEvent.click(within(janela).getByRole('tab', { name: /Usuários/ }));
  for (const user of users) fireEvent.click(await within(janela).findByRole('option', { name: user }));
  fireEvent.click(within(janela).getByRole('button', { name: 'Confirmar' }));
}

function renderModal() {
  const onClose = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <CreateApprovalModal solicitationId="sol-1" onClose={onClose} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { onClose };
}

const fillTitle = () =>
  fireEvent.change(screen.getByPlaceholderText('Ex: Aprovar compra de equipamento'), { target: { value: 'Aprovar pedido' } });
const emails = () => screen.getByRole('textbox', { name: 'Aprovadores por e-mail' });
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Criar aprovacao' }));

describe('CreateApprovalModal — aprovadores externos', () => {
  beforeEach(() => mocks.mutate.mockReset());

  it('só com e-mails (sem usuário) cria a aprovação, enviando a lista normalizada', async () => {
    renderModal();
    fillTitle();

    fireEvent.change(emails(), { target: { value: 'Gestor@Externo.com, outro@externo.com' } });
    submit();

    await waitFor(() => expect(mocks.mutate).toHaveBeenCalled());
    expect(mocks.mutate.mock.calls[0][0]).toEqual({
      title: 'Aprovar pedido',
      description: undefined,
      assignedUserIds: [],
      assignedEmails: ['gestor@externo.com', 'outro@externo.com'],
      mode: 'parallel',
    });
  });

  it('usuários e e-mails juntos são enviados juntos', async () => {
    renderModal();
    fillTitle();
    await pick({ users: [/Maria Souza/] });

    fireEvent.change(emails(), { target: { value: 'gestor@externo.com' } });
    submit();

    await waitFor(() => expect(mocks.mutate).toHaveBeenCalled());
    expect(mocks.mutate.mock.calls[0][0]).toMatchObject({
      assignedUserIds: ['user-1'],
      assignedEmails: ['gestor@externo.com'],
    });
  });

  it('sem e-mails, não envia a chave assignedEmails (comportamento anterior)', async () => {
    renderModal();
    fillTitle();
    await pick({ users: [/Maria Souza/] });

    submit();

    await waitFor(() => expect(mocks.mutate).toHaveBeenCalled());
    expect(mocks.mutate.mock.calls[0][0]).not.toHaveProperty('assignedEmails');
  });

  it('sem usuário nem e-mail, cobra um aprovador e não chama a API', () => {
    renderModal();
    fillTitle();

    submit();

    expect(screen.getByText('Selecione pelo menos um aprovador.')).toBeInTheDocument();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it('e-mail inválido é apontado e bloqueia o envio', () => {
    renderModal();
    fillTitle();

    fireEvent.change(emails(), { target: { value: 'gestor@externo.com, lixo' } });
    expect(screen.getByText('E-mail inválido: lixo')).toBeInTheDocument();
    submit();

    expect(screen.getAllByText('E-mail inválido: lixo.').length).toBeGreaterThan(0);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it('mais de 10 e-mails é barrado', () => {
    renderModal();
    fillTitle();

    fireEvent.change(emails(), {
      target: { value: Array.from({ length: 11 }, (_, i) => `a${i}@externo.com`).join(', ') },
    });
    submit();

    expect(screen.getByText('No máximo 10 aprovadores por e-mail.')).toBeInTheDocument();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it('modo sequencial lista os e-mails depois dos usuários na ordem de aprovação', async () => {
    renderModal();
    await pick({ users: [/Maria Souza/] });
    fireEvent.change(emails(), { target: { value: 'gestor@externo.com' } });

    fireEvent.click(screen.getByRole('radio', { name: /^Em ordem/ }));

    expect(screen.getByText('gestor@externo.com (por e-mail)')).toBeInTheDocument();
    expect(screen.getByText('2.')).toBeInTheDocument();
  });

  it('explica que quem não tem usuário decide por link, sem login', () => {
    renderModal();

    expect(screen.getByText(/recebe um link pessoal por e-mail e decide por ele, sem/)).toBeInTheDocument();
  });

  it('perfis e a regra "todos" vão para a aprovação; em ordem, a fila escolhida com os e-mails no fim', async () => {
    renderModal();
    fillTitle();
    await pick({ roles: [/Diretoria/], users: [/João Lima/] });
    fireEvent.click(screen.getByRole('radio', { name: /^Todos/ }));
    submit();
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalled());
    expect(mocks.mutate.mock.calls[0][0]).toMatchObject({
      assignedUserIds: ['user-2'],
      assignedRoleCodes: ['diretoria'],
      mode: 'parallel',
      requireAll: true,
    });

    mocks.mutate.mockReset();
    fireEvent.click(screen.getByRole('radio', { name: /^Em ordem/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Subir Diretoria' }));
    fireEvent.change(emails(), { target: { value: 'gestor@externo.com' } });
    submit();
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalled());
    expect(mocks.mutate.mock.calls[0][0]).toMatchObject({
      mode: 'sequential',
      requireAll: true,
      assigneeOrder: ['role:diretoria', 'user:user-2', 'email:gestor@externo.com'],
    });
  });
});
