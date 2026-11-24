import { SlaAdminController } from './sla-admin.controller';

describe('SlaAdminController', () => {
  it('POST /admin/sla/check delega para SlaCalculatorService', async () => {
    const result = { processed: 2, warned: 1, breached: 1 };
    const slaCalculatorService = {
      checkSlaDeadlines: jest.fn().mockResolvedValue(result),
    };
    const controller = new SlaAdminController(slaCalculatorService as never);

    await expect(controller.checkSlaDeadlines()).resolves.toBe(result);
    expect(slaCalculatorService.checkSlaDeadlines).toHaveBeenCalledTimes(1);
  });
});
