import type { Request, Response } from 'express';
import { PublicExternalApprovalsController } from './public-external-approvals.controller';

const TOKEN = 'T'.repeat(43);

function makeController() {
  const view = { state: 'pending', orgName: 'Tijuca Flow' };
  const service = {
    getForToken: jest.fn().mockResolvedValue(view),
    decide: jest.fn().mockResolvedValue({ state: 'decided', orgName: 'Tijuca Flow' }),
  };
  const res = { setHeader: jest.fn() } as unknown as Response;
  return { controller: new PublicExternalApprovalsController(service as never), service, res, view };
}

function expectSealed(res: Response): void {
  const headers = new Map((res.setHeader as jest.Mock).mock.calls.map(([k, v]: [string, string]) => [k, v]));
  expect(headers.get('Cache-Control')).toBe('no-store');
  expect(headers.get('Referrer-Policy')).toBe('no-referrer');
  expect(headers.get('X-Robots-Tag')).toContain('noindex');
}

describe('PublicExternalApprovalsController', () => {
  it('GET delega ao serviço e responde com cabeçalhos sem cache/referrer/indexação', async () => {
    const { controller, service, res, view } = makeController();

    await expect(controller.getByToken(TOKEN, res)).resolves.toBe(view);

    expect(service.getForToken).toHaveBeenCalledWith(TOKEN);
    expectSealed(res);
  });

  it('POST passa o IP da requisição e também sela a resposta', async () => {
    const { controller, service, res } = makeController();
    const dto = { decision: 'approved' as const, confirmEmail: 'a@x.com' };

    await controller.decide(TOKEN, dto, { ip: '203.0.113.7' } as Request, res);

    expect(service.decide).toHaveBeenCalledWith(TOKEN, dto, '203.0.113.7');
    expectSealed(res);
  });

  it('POST sem IP na requisição passa null', async () => {
    const { controller, service, res } = makeController();

    await controller.decide(TOKEN, { decision: 'approved', confirmEmail: 'a@x.com' }, {} as Request, res);

    expect(service.decide).toHaveBeenCalledWith(TOKEN, expect.anything(), null);
  });

  it('não tem guarda de autenticação (rota pública: a prova é o token + e-mail)', () => {
    const guards = Reflect.getMetadata('__guards__', PublicExternalApprovalsController) as unknown[] | undefined;

    expect(guards ?? []).toHaveLength(0);
  });
});
