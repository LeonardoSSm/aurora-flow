import { HealthCheckError } from '@nestjs/terminus';
import { AdminSeedIndicator } from './health.controller';
import type { UsersService } from '../users/users.service';

/**
 * AdminSeedIndicator alimenta GET /health/ready — usado por probe de orquestrador
 * (o processo só recebe tráfego se isso responder saudável). O e-mail que ele
 * procura precisa bater com o que UsersService.ensureSeedAdmin() de fato cria; já
 * divergiu uma vez (sobrou "admin@formhub.local" de antes do rebrand pra Tijuca
 * Flow) e /health/ready ficou sempre "não pronto", em qualquer ambiente, sem
 * nenhum teste acusando.
 */
function makeUsersService(found: unknown): jest.Mocked<Pick<UsersService, '_internalFindByEmail'>> {
  return {
    _internalFindByEmail: jest.fn().mockResolvedValue(found),
  };
}

describe('AdminSeedIndicator', () => {
  it('fica saudável quando o admin semente atual (admin@aurora-flow.local) existe', async () => {
    const usersService = makeUsersService({ id: 'admin-id' });
    const indicator = new AdminSeedIndicator(usersService as unknown as UsersService);

    const result = await indicator.isHealthy('admin_seed');

    expect(usersService._internalFindByEmail).toHaveBeenCalledWith('admin@aurora-flow.local');
    expect(result.admin_seed.status).toBe('up');
  });

  it('lança HealthCheckError quando o admin semente não é encontrado', async () => {
    const usersService = makeUsersService(null);
    const indicator = new AdminSeedIndicator(usersService as unknown as UsersService);

    await expect(indicator.isHealthy('admin_seed')).rejects.toThrow(HealthCheckError);
  });
});
