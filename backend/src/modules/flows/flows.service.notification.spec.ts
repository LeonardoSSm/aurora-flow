import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FlowsService } from './flows.service';
import type { FlowNodeDto } from './dto/flow-node.dto';
import { fakeProcessAccess } from '../access/testing/fake-process-access';

/**
 * Validação do nó `action_notification` no ciclo de vida do fluxo (salvar, atualizar, ativar) e o
 * controle de acesso usado pelos endpoints de notificações. As regras de cada campo estão em
 * notification-node.validation.spec.ts; aqui o foco é ONDE a validação é aplicada e que os
 * fluxos antigos não são afetados.
 */

const USER_ID = '3f6c1e2a-0000-4000-8000-000000000001';


function makeService() {
  const qb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getExists: jest.fn().mockResolvedValue(false),
  };
  const flowsRepo = {
    createQueryBuilder: jest.fn(() => qb),
    create: jest.fn((data: object) => ({ ...data })),
    save: jest.fn((data: object) => Promise.resolve({ id: 'flow-1', ...data })),
    findOne: jest.fn(),
  };
  // Acesso total para admin; o resto pelo vínculo: "leitor" vê os fluxos do processo, "gestor" gerencia.
  const permissionsService = fakeProcessAccess({
    fullAccessRoles: ['admin'],
    members: {
      leitor: { 'form-1': { 'flows.view': 'all' } },
      gestor: { 'form-1': { 'flows.view': 'all', 'flows.manage': 'all' } },
    },
  });
  const service = new FlowsService(
    flowsRepo as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    permissionsService as never,
    {} as never,
  );
  return { service, flowsRepo };
}

const trigger = (): FlowNodeDto => ({ id: 'trigger', type: 'trigger_form_submit', position: { x: 0, y: 0 }, data: {} }) as never;

const notification = (data: Record<string, unknown> = {}): FlowNodeDto =>
  ({
    id: 'n1',
    type: 'action_notification',
    position: { x: 0, y: 0 },
    data: {
      channel: 'email',
      title: 'Assunto',
      content: 'Corpo {{solicitation_title}}',
      recipients: [{ type: 'users', userIds: [USER_ID] }],
      ...data,
    },
  }) as never;

const storedFlow = (nodes: unknown[], isActive: boolean) => ({
  id: 'flow-1',
  createdBy: 'owner',
  formId: null,
  form: null,
  isActive,
  nodes,
  edges: [],
});

describe('FlowsService — nó action_notification', () => {
  describe('create', () => {
    it('aceita um nó de notificação válido', async () => {
      const { service, flowsRepo } = makeService();
      await expect(
        service.create({ name: 'Fluxo', nodes: [trigger(), notification()], edges: [] } as never, 'owner'),
      ).resolves.toBeDefined();
      expect(flowsRepo.save).toHaveBeenCalledTimes(1);
    });

    it('rejeita configuração inválida com o id do nó e o motivo, e não grava', async () => {
      const { service, flowsRepo } = makeService();
      const promise = service.create(
        { name: 'Fluxo', nodes: [trigger(), notification({ recipients: [], content: '' })], edges: [] } as never,
        'owner',
      );
      await expect(promise).rejects.toBeInstanceOf(BadRequestException);
      await expect(promise).rejects.toThrow(/Nó "n1" \(notificação\):.*requer content\..*requer ao menos um destinatário/);
      expect(flowsRepo.save).not.toHaveBeenCalled();
    });

    it.each([
      [{ channel: 'sms' }, 'channel'],
      [{ title: '' }, 'assunto'],
      [{ content: 'Olá {{nome' }, 'mal formada'],
      [{ delayMinutes: -5 }, 'delayMinutes'],
      [{ retryPolicy: { maxAttempts: 99 } }, 'maxAttempts'],
      [{ recipients: [{ type: 'custom', value: 'sem-arroba' }] }, 'e-mail inválido'],
    ])('rejeita %j', async (override, expected) => {
      const { service } = makeService();
      await expect(
        service.create({ name: 'Fluxo', nodes: [trigger(), notification(override)], edges: [] } as never, 'owner'),
      ).rejects.toThrow(expected);
    });

    it('fluxos sem nós de notificação continuam sendo criados como antes', async () => {
      const { service, flowsRepo } = makeService();
      await service.create({ name: 'Legado', nodes: [trigger()], edges: [] } as never, 'owner');
      expect(flowsRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('update', () => {
    it('rejeita nós inválidos e não grava', async () => {
      const { service, flowsRepo } = makeService();
      flowsRepo.findOne.mockResolvedValue(storedFlow([trigger()], true));
      await expect(
        service.update('flow-1', { nodes: [trigger(), notification({ recipients: [] })] } as never, 'owner', 'admin'),
      ).rejects.toThrow(/Nó "n1" \(notificação\)/);
      expect(flowsRepo.save).not.toHaveBeenCalled();
    });

    it('ativar (isActive: true) revalida os nós de notificação já gravados', async () => {
      const { service, flowsRepo } = makeService();
      // nó editado direto no banco, fora da validação de salvamento
      flowsRepo.findOne.mockResolvedValue(storedFlow([trigger(), notification({ channel: 'sms' })], false));
      await expect(service.update('flow-1', { isActive: true } as never, 'owner', 'admin')).rejects.toThrow(
        /Nó "n1" \(notificação\)/,
      );
      expect(flowsRepo.save).not.toHaveBeenCalled();
    });

    it('desativar não valida nada', async () => {
      const { service, flowsRepo } = makeService();
      flowsRepo.findOne.mockResolvedValue(storedFlow([trigger(), notification({ channel: 'sms' })], true));
      await expect(service.update('flow-1', { isActive: false } as never, 'owner', 'admin')).resolves.toBeDefined();
      expect(flowsRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('toggleActive', () => {
    it('ativar um fluxo com notificação inválida é recusado', async () => {
      const { service, flowsRepo } = makeService();
      flowsRepo.findOne.mockResolvedValue(storedFlow([trigger(), notification({ content: '' })], false));
      await expect(service.toggleActive('flow-1', 'owner', 'admin')).rejects.toBeInstanceOf(BadRequestException);
      expect(flowsRepo.save).not.toHaveBeenCalled();
    });

    it('ativar um fluxo com notificação válida funciona', async () => {
      const { service, flowsRepo } = makeService();
      flowsRepo.findOne.mockResolvedValue(storedFlow([trigger(), notification()], false));
      const result = await service.toggleActive('flow-1', 'owner', 'admin');
      expect(result.isActive).toBe(true);
      expect(flowsRepo.save).toHaveBeenCalledTimes(1);
    });

    it('desativar um fluxo com notificação inválida é permitido (não bloqueia o desligamento)', async () => {
      const { service, flowsRepo } = makeService();
      flowsRepo.findOne.mockResolvedValue(storedFlow([trigger(), notification({ content: '' })], true));
      const result = await service.toggleActive('flow-1', 'owner', 'admin');
      expect(result.isActive).toBe(false);
    });

    it('COMPATIBILIDADE: reativar fluxo antigo com nó legado “incompleto” continua funcionando', async () => {
      const { service, flowsRepo } = makeService();
      // action_notify_users sem usuários: o backend nunca validou isso (ver Diagnóstico P-07);
      // a revalidação na ativação só olha action_notification, então o legado não é barrado.
      const legacyNode = { id: 'legacy', type: 'action_notify_users', position: { x: 0, y: 0 }, data: {} };
      flowsRepo.findOne.mockResolvedValue(storedFlow([trigger(), legacyNode], false));
      const result = await service.toggleActive('flow-1', 'owner', 'admin');
      expect(result.isActive).toBe(true);
    });
  });

  describe('assertFlowAccess', () => {
    it('admin vê e gerencia qualquer fluxo', async () => {
      const { service, flowsRepo } = makeService();
      flowsRepo.findOne.mockResolvedValue(storedFlow([trigger()], true));
      await expect(service.assertFlowAccess('flow-1', 'u-admin', 'admin', 'view')).resolves.toBeDefined();
      await expect(service.assertFlowAccess('flow-1', 'u-admin', 'admin', 'manage')).resolves.toBeDefined();
    });

    it('quem criou acessa; os demais, pelo vínculo com o processo do fluxo', async () => {
      const { service, flowsRepo } = makeService();
      flowsRepo.findOne.mockResolvedValue({ ...storedFlow([trigger()], true), formId: 'form-1' });
      await expect(service.assertFlowAccess('flow-1', 'owner', 'qualquer', 'manage')).resolves.toBeDefined();
      await expect(service.assertFlowAccess('flow-1', 'gestor', 'qualquer', 'manage')).resolves.toBeDefined();
      await expect(service.assertFlowAccess('flow-1', 'leitor', 'qualquer', 'view')).resolves.toBeDefined();
      await expect(service.assertFlowAccess('flow-1', 'outro', 'qualquer', 'view')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('"ver fluxos" não gerencia, e fluxo inexistente é 404', async () => {
      const { service, flowsRepo } = makeService();
      flowsRepo.findOne.mockResolvedValue({ ...storedFlow([trigger()], true), formId: 'form-1' });
      await expect(service.assertFlowAccess('flow-1', 'leitor', 'qualquer', 'manage')).rejects.toBeInstanceOf(NotFoundException);
      flowsRepo.findOne.mockResolvedValue(null);
      await expect(service.assertFlowAccess('x', 'u', 'admin', 'view')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
