import { fireEvent, render, screen } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import { vi } from 'vitest';
import { ToastProvider } from '../../../components/ui';
import type { ApprovalStep } from '../../solicitations/types';
import { ExternalStepActions, externalLinkStatus, stepAssigneeLabel } from './external-step-info';

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
}));

vi.mock('../hooks/use-resend-approval-link-mutation', () => ({
  useResendApprovalLinkMutation: () => ({ mutate: mocks.mutate, isPending: mocks.isPending }),
}));

function makeStep(overrides: Partial<ApprovalStep> = {}): ApprovalStep {
  return {
    id: 'step-1',
    approvalId: 'approval-1',
    assignedUserId: null,
    assignedUser: null,
    assignedRoleCode: null,
    assignedRole: null,
    assignedEmail: 'gestor@externo.com',
    accessLinkSentAt: '2026-10-06T12:00:00.000Z',
    accessTokenExpiresAt: '2099-01-01T00:00:00.000Z',
    status: 'pending',
    order: 1,
    decidedAt: null,
    decision: null,
    ...overrides,
  };
}

function renderActions(step: ApprovalStep, canManage = true) {
  return render(
    <ToastProvider>
      <ExternalStepActions step={step} solicitationId="sol-1" canManage={canManage} />
    </ToastProvider>,
  );
}

describe('stepAssigneeLabel', () => {
  it('usuário nomeado vence', () => {
    const user = { id: 'u1', fullName: 'Maria Souza', email: 'm@x.com' } as ApprovalStep['assignedUser'];
    expect(stepAssigneeLabel(makeStep({ assignedUser: user, assignedEmail: null }))).toBe('Maria Souza');
  });

  it('aprovador externo mostra o e-mail marcado como externo', () => {
    expect(stepAssigneeLabel(makeStep())).toBe('gestor@externo.com (externo)');
  });

  it('perfil e id continuam como antes', () => {
    expect(
      stepAssigneeLabel(makeStep({ assignedEmail: null, assignedRole: { code: 'supervisor', name: 'Supervisor' } })),
    ).toBe('Perfil: Supervisor');
    expect(stepAssigneeLabel(makeStep({ assignedEmail: null, assignedUserId: 'u-9' }))).toBe('u-9');
    expect(stepAssigneeLabel(makeStep({ assignedEmail: null }))).toBe('—');
  });
});

describe('externalLinkStatus', () => {
  const now = new Date('2026-10-07T12:00:00.000Z');

  it('não se aplica a etapa que não é externa nem a etapa já decidida', () => {
    expect(externalLinkStatus(makeStep({ assignedEmail: null }), now)).toBeNull();
    expect(externalLinkStatus(makeStep({ status: 'approved' }), now)).toBeNull();
    expect(externalLinkStatus(makeStep({ status: 'waiting' }), now)).toBeNull();
  });

  it('link ainda não enviado: alerta', () => {
    const status = externalLinkStatus(makeStep({ accessLinkSentAt: null }), now);

    expect(status?.tone).toBe('warn');
    expect(status?.label).toContain('ainda não enviado');
  });

  it('link expirado: alerta', () => {
    const status = externalLinkStatus(makeStep({ accessTokenExpiresAt: '2026-10-07T11:00:00.000Z' }), now);

    expect(status?.tone).toBe('warn');
    expect(status?.label).toContain('expirado');
  });

  it('link enviado e válido: informa envio e validade', () => {
    const status = externalLinkStatus(makeStep(), now);

    expect(status?.tone).toBe('ok');
    expect(status?.label).toMatch(/^Link enviado em .+ \(vale até .+\)$/);
  });
});

describe('ExternalStepActions', () => {
  beforeEach(() => {
    mocks.mutate.mockReset();
    mocks.isPending = false;
  });

  it('não renderiza nada para etapa que não é externa', () => {
    renderActions(makeStep({ assignedEmail: null }));

    expect(screen.queryByText(/Link/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reenviar link' })).not.toBeInTheDocument();
  });

  it('gerente vê o estado do link e o botão de reenvio', () => {
    renderActions(makeStep());

    expect(screen.getByText(/Link enviado em/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reenviar link' })).toBeInTheDocument();
  });

  it('quem não gerencia vê o estado, mas não o botão', () => {
    renderActions(makeStep({ accessLinkSentAt: null }), false);

    expect(screen.getByText(/ainda não enviado/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reenviar link' })).not.toBeInTheDocument();
  });

  it('reenviar chama a API com o id da etapa e confirma com um aviso de sucesso', () => {
    mocks.mutate.mockImplementation((_id: string, options: { onSuccess: (r: unknown) => void }) =>
      options.onSuccess({ sent: true, sentTo: 'gestor@externo.com' }),
    );
    renderActions(makeStep());

    fireEvent.click(screen.getByRole('button', { name: 'Reenviar link' }));

    expect(mocks.mutate).toHaveBeenCalledWith('step-1', expect.any(Object));
    expect(screen.getByText('Link reenviado')).toBeInTheDocument();
    expect(screen.getByText('Enviado para gestor@externo.com.')).toBeInTheDocument();
  });

  it('link gerado mas e-mail que não saiu: avisa com o motivo (não finge sucesso)', () => {
    mocks.mutate.mockImplementation((_id: string, options: { onSuccess: (r: unknown) => void }) =>
      options.onSuccess({ sent: false, sentTo: 'gestor@externo.com', error: 'SMTP fora do ar' }),
    );
    renderActions(makeStep());

    fireEvent.click(screen.getByRole('button', { name: 'Reenviar link' }));

    expect(screen.getByText('O link foi gerado, mas o e-mail não saiu')).toBeInTheDocument();
    expect(screen.getByText('SMTP fora do ar')).toBeInTheDocument();
    expect(screen.queryByText('Link reenviado')).not.toBeInTheDocument();
  });

  it('erro da API: mostra a mensagem do servidor', () => {
    const error = new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 400,
      data: { message: 'Esta etapa não está mais pendente.' },
    } as AxiosResponse);
    mocks.mutate.mockImplementation((_id: string, options: { onError: (e: unknown) => void }) => options.onError(error));
    renderActions(makeStep());

    fireEvent.click(screen.getByRole('button', { name: 'Reenviar link' }));

    expect(screen.getByText('Não foi possível reenviar o link')).toBeInTheDocument();
    expect(screen.getByText('Esta etapa não está mais pendente.')).toBeInTheDocument();
  });

  it('desabilita o botão enquanto envia', () => {
    mocks.isPending = true;
    renderActions(makeStep());

    expect(screen.getByRole('button', { name: 'Enviando...' })).toBeDisabled();
  });
});
