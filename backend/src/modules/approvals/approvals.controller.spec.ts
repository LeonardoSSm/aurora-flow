import { ForbiddenException } from '@nestjs/common';
import { ApprovalsController } from './approvals.controller';

/** As rotas de aprovação conferem o processo do card antes de chamar o serviço. */
describe('ApprovalsController — processo do card', () => {
  const user = { sub: 'u1', role: 'operador', email: 'u@x', fullName: 'U', tokenVersion: 0 };
  const denied = () => jest.fn().mockRejectedValue(new ForbiddenException('Acesso negado.'));

  function make(access: Record<string, jest.Mock>) {
    const service = {
      createApproval: jest.fn(),
      cancelApproval: jest.fn(),
      resendExternalLink: jest.fn(),
      findBySolicitation: jest.fn(),
      findById: jest.fn(),
      findSolicitationIdOfApproval: jest.fn().mockResolvedValue('sol-b'),
      findSolicitationIdOfStep: jest.fn().mockResolvedValue('sol-b'),
    };
    return { controller: new ApprovalsController(service as never, access as never), service };
  }

  it.each([
    ['criar', (c: ApprovalsController) => c.create('sol-b', { title: 'X' } as never, user as never), 'createApproval'],
    ['cancelar', (c: ApprovalsController) => c.cancel('ap-1', user as never), 'cancelApproval'],
    ['reenviar link', (c: ApprovalsController) => c.resendLink('step-1', user as never), 'resendExternalLink'],
  ] as const)('%s exige "pedir e cancelar aprovações" no processo do card', async (_name, call, method) => {
    const assertSolicitationAccess = denied();
    const { controller, service } = make({ assertSolicitationAccess });

    await expect(call(controller)).rejects.toBeInstanceOf(ForbiddenException);
    expect(assertSolicitationAccess).toHaveBeenCalledWith('sol-b', user, 'approvals.manage');
    expect(service[method]).not.toHaveBeenCalled();
  });

  it('listar e abrir: "ver todas" vem do processo do card', async () => {
    const canOnSolicitation = jest.fn().mockResolvedValue(true);
    const { controller, service } = make({ canOnSolicitation });
    service.findBySolicitation.mockImplementation((_id: string, _u: unknown, canViewAll: () => Promise<boolean>) =>
      canViewAll(),
    );

    await expect(controller.findBySolicitation('sol-b', user as never)).resolves.toBe(true);
    expect(canOnSolicitation).toHaveBeenCalledWith('sol-b', user, 'approvals.view_all');
  });
});
