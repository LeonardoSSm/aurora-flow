const resolve4 = jest.fn();

jest.mock('node:dns/promises', () => ({
  Resolver: jest.fn().mockImplementation(() => ({ resolve4 })),
}));

import { ServiceMapProbe } from './service-map.probe';

function dnsError(code: string): Error {
  return Object.assign(new Error(`queryA ${code}`), { code });
}

describe('ServiceMapProbe — resolução de nome antes da chamada', () => {
  const probe = new ServiceMapProbe();
  const fetchSpy = jest.spyOn(global, 'fetch');

  beforeEach(() => {
    resolve4.mockReset();
    fetchSpy.mockReset();
  });

  afterAll(() => fetchSpy.mockRestore());

  it('IP, localhost e host.docker.internal não passam pelo DNS', async () => {
    await probe.ensureResolvable('127.0.0.1');
    await probe.ensureResolvable('localhost');
    await probe.ensureResolvable('host.docker.internal');
    expect(resolve4).not.toHaveBeenCalled();
  });

  it('nome de container parado (DNS sem resposta) falha como endereço não encontrado, sem chamar o serviço', async () => {
    resolve4.mockRejectedValue(dnsError('ETIMEOUT'));

    await expect(probe.httpGet('http://pgadmin:80/misc/ping', { timeoutMs: 2500 })).rejects.toMatchObject({
      code: 'ENOTFOUND',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('nome inexistente ou só no /etc/hosts segue para a chamada normal', async () => {
    resolve4.mockRejectedValue(dnsError('ENOTFOUND'));
    fetchSpy.mockResolvedValue(new Response('ok', { status: 200 }));

    await expect(probe.httpGet('http://algum-host:80/', { timeoutMs: 2500 })).resolves.toMatchObject({
      status: 200,
    });
  });

  it('nome resolvido: chama o serviço e lê o JSON', async () => {
    resolve4.mockResolvedValue(['172.18.0.5']);
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ db: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(probe.httpGet('http://erp-lookup:3100/health', { timeoutMs: 2500 })).resolves.toMatchObject({
      status: 200,
      json: { db: 'ok' },
    });
    expect(resolve4).toHaveBeenCalledWith('erp-lookup');
  });
});
