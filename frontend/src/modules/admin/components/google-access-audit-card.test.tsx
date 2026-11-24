import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoogleAccessAuditReport } from '../services/google-access-api';
import { GoogleAccessAuditCard, shortScope } from './google-access-audit-card';

const mocks = vi.hoisted(() => ({
  auditGoogleAccess: vi.fn(),
  revokeBroadGoogleAccess: vi.fn(),
  permissions: new Set<string>(),
}));

vi.mock('../services/google-access-api', () => ({
  auditGoogleAccess: mocks.auditGoogleAccess,
  revokeBroadGoogleAccess: mocks.revokeBroadGoogleAccess,
}));
vi.mock('../../../app/auth-context', () => ({
  useAuth: () => ({ hasPermission: (code: string) => mocks.permissions.has(code) }),
}));

const SHEETS = 'https://www.googleapis.com/auth/spreadsheets';

function report(overrides: Partial<GoogleAccessAuditReport> = {}): GoogleAccessAuditReport {
  return {
    dryRun: true,
    checked: 3,
    withBroadAccess: 2,
    revoked: 0,
    clearedInvalid: 0,
    ok: 1,
    failed: 0,
    users: [
      { userId: 'u1', email: 'ana@tijucaalimentos.com', action: 'would_revoke', excessScopes: [SHEETS] },
      { userId: 'u2', email: 'bia@tijucaalimentos.com', action: 'would_revoke', excessScopes: [SHEETS, 'https://www.googleapis.com/auth/drive'] },
      { userId: 'u3', email: 'caio@tijucaalimentos.com', action: 'ok', excessScopes: [] },
    ],
    ...overrides,
  };
}

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <GoogleAccessAuditCard />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.auditGoogleAccess.mockReset();
  mocks.revokeBroadGoogleAccess.mockReset();
  mocks.permissions = new Set(['system.maintenance']);
});

describe('GoogleAccessAuditCard', () => {
  it('só aparece para quem tem system.maintenance', () => {
    mocks.permissions = new Set(['flows.manage']);
    const { container } = renderCard();
    expect(container).toBeEmptyDOMElement();
  });

  it('não faz nada sozinho: só audita quando o admin pede', () => {
    renderCard();
    expect(screen.getByRole('button', { name: /Verificar permissões/ })).toBeInTheDocument();
    expect(mocks.auditGoogleAccess).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Revogar/ })).not.toBeInTheDocument();
  });

  it('a verificação lista quem tem acesso amplo (com os escopos) e quem está certo fica de fora', async () => {
    mocks.auditGoogleAccess.mockResolvedValue(report());
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Verificar permissões/ }));

    const result = await screen.findByTestId('google-access-report');
    expect(within(result).getByText(/3 conectado\(s\): 2 com acesso amplo, 1 certo\(s\)/)).toBeInTheDocument();
    expect(within(result).getByText('ana@tijucaalimentos.com')).toBeInTheDocument();
    expect(within(result).getByText(/Acesso amplo — será revogado \(spreadsheets\)/)).toBeInTheDocument();
    expect(within(result).getByText(/\(spreadsheets, drive\)/)).toBeInTheDocument();
    expect(within(result).queryByText('caio@tijucaalimentos.com')).not.toBeInTheDocument();
    expect(mocks.revokeBroadGoogleAccess).not.toHaveBeenCalled(); // auditar não altera nada
  });

  it('revogar exige confirmação explícita, com o número de usuários afetados e o aviso de reconexão', async () => {
    mocks.auditGoogleAccess.mockResolvedValue(report());
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Verificar permissões/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Revogar acessos amplos \(2\)/ }));

    const dialog = screen.getByRole('alertdialog', { name: 'Confirmar revogação' });
    expect(within(dialog).getByText('2')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Conectar Google');
    expect(mocks.revokeBroadGoogleAccess).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mocks.revokeBroadGoogleAccess).not.toHaveBeenCalled();
  });

  it('confirmar revoga e mostra o resultado', async () => {
    mocks.auditGoogleAccess.mockResolvedValue(report());
    mocks.revokeBroadGoogleAccess.mockResolvedValue(
      report({
        dryRun: false,
        revoked: 2,
        users: [
          { userId: 'u1', email: 'ana@tijucaalimentos.com', action: 'revoked', excessScopes: [SHEETS] },
          { userId: 'u2', email: 'bia@tijucaalimentos.com', action: 'revoked', excessScopes: [SHEETS] },
          { userId: 'u3', email: 'caio@tijucaalimentos.com', action: 'ok', excessScopes: [] },
        ],
      }),
    );
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Verificar permissões/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Revogar acessos amplos/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Sim, revogar' }));

    expect(await screen.findByText('Revogado para 2 usuário(s).')).toBeInTheDocument();
    expect(mocks.revokeBroadGoogleAccess).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText(/Revogado — precisa reconectar/)).toHaveLength(2);
    // depois de aplicar não oferece revogar de novo
    expect(screen.queryByRole('button', { name: /Revogar acessos amplos/ })).not.toBeInTheDocument();
  });

  it('tudo certo: mensagem positiva e nenhum botão de revogar', async () => {
    mocks.auditGoogleAccess.mockResolvedValue(
      report({ withBroadAccess: 0, ok: 3, users: [{ userId: 'u3', email: 'caio@tijucaalimentos.com', action: 'ok', excessScopes: [] }] }),
    );
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Verificar permissões/ }));
    expect(await screen.findByText(/0 com acesso amplo, 3 certo\(s\)/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Revogar/ })).not.toBeInTheDocument();
  });

  it('nenhum usuário conectado', async () => {
    mocks.auditGoogleAccess.mockResolvedValue(report({ checked: 0, withBroadAccess: 0, ok: 0, users: [] }));
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Verificar permissões/ }));
    expect(await screen.findByText('Nenhum usuário com o Google conectado.')).toBeInTheDocument();
  });

  it('token inválido também entra na limpeza e as falhas de consulta são mostradas', async () => {
    mocks.auditGoogleAccess.mockResolvedValue(
      report({
        withBroadAccess: 0,
        ok: 0,
        failed: 1,
        users: [
          { userId: 'u1', email: 'ana@tijucaalimentos.com', action: 'would_clear_invalid', excessScopes: [] },
          { userId: 'u2', email: 'bia@tijucaalimentos.com', action: 'error', excessScopes: [], error: 'Google respondeu 503' },
        ],
      }),
    );
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Verificar permissões/ }));
    expect(await screen.findByText(/Token inválido — será limpo/)).toBeInTheDocument();
    expect(screen.getByText(/Falha — Google respondeu 503/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Revogar acessos amplos \(1\)/ })).toBeInTheDocument();
  });

  it('mostra o erro do servidor se a operação falhar', async () => {
    mocks.auditGoogleAccess.mockRejectedValue(
      new AxiosError('x', 'ERR', undefined, undefined, { status: 403, data: { message: 'Acesso negado.' } } as AxiosResponse),
    );
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Verificar permissões/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Acesso negado.');
    await waitFor(() => expect(screen.queryByTestId('google-access-report')).not.toBeInTheDocument());
  });

  it('shortScope abrevia as URLs de escopo do Google', () => {
    expect(shortScope(SHEETS)).toBe('spreadsheets');
    expect(shortScope('openid')).toBe('openid');
  });
});
