import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { SolicitationPriority } from '../../common/enums/solicitation-priority.enum';
import { SolicitationStatus } from '../../common/enums/solicitation-status.enum';
import type { SolicitationEntity } from '../../database/entities';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { SolicitationsController } from './solicitations.controller';

const actor: JwtPayload = {
  sub: 'actor-id',
  email: 'actor@formhub.local',
  fullName: 'Actor',
  role: 'admin',
  tokenVersion: 0,
};

describe('SolicitationsController', () => {
  function makeController() {
    const service = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      createManual: jest.fn(),
      updateStatus: jest.fn(),
      updateAssignee: jest.fn(),
      updatePriority: jest.fn(),
      findHistory: jest.fn(),
      getKanbanBoard: jest.fn(),
      moveCard: jest.fn(),
    };
    const slaCalculatorService = {
      getSlaStatus: jest.fn(),
    };
    const erpLookupFieldService = { detailsForAnswers: jest.fn().mockResolvedValue([]) };
    return {
      controller: new SolicitationsController(
        service as never,
        slaCalculatorService as never,
        erpLookupFieldService as never,
      ),
      service,
      slaCalculatorService,
      erpLookupFieldService,
    };
  }

  it('fichas do ERP: confere o acesso pela solicitação e monta a ficha das respostas dela', async () => {
    const { controller, service, erpLookupFieldService } = makeController();
    const items = [{ fieldCode: 'pedido', valueJson: { value: '1000', label: 'Pedido 1000' } }];
    service.findOne.mockResolvedValue({ id: 'sol-1', submission: { items } });
    erpLookupFieldService.detailsForAnswers.mockResolvedValue([{ fieldCode: 'pedido', status: 'ok' }]);

    await expect(controller.getErpDetails('sol-1', actor)).resolves.toEqual([{ fieldCode: 'pedido', status: 'ok' }]);
    expect(service.findOne).toHaveBeenCalledWith('sol-1', actor);
    expect(erpLookupFieldService.detailsForAnswers).toHaveBeenCalledWith(items);
  });

  it('delegates listagem para o service com usuario atual', async () => {
    const { controller, service } = makeController();
    const page = PaginatedResponseDto.of<SolicitationEntity>([], 0, 1, 20);
    service.findAll.mockResolvedValue(page);

    await expect(controller.findAll({ page: 1, limit: 20 }, actor)).resolves.toBe(page);
    expect(service.findAll).toHaveBeenCalledWith({ page: 1, limit: 20 }, actor);
  });

  it('delegates criacao manual para o service', async () => {
    const { controller, service } = makeController();
    const solicitation = { id: 'solicitation-id' };
    service.createManual.mockResolvedValue(solicitation);

    await expect(
      controller.create({ title: 'Nova solicitacao', priority: SolicitationPriority.HIGH }, actor),
    ).resolves.toBe(solicitation);
    expect(service.createManual).toHaveBeenCalledWith(
      { title: 'Nova solicitacao', priority: SolicitationPriority.HIGH },
      actor,
    );
  });

  it('delegates alteracao de status para o service', async () => {
    const { controller, service } = makeController();
    const solicitation = { id: 'solicitation-id', status: SolicitationStatus.RESOLVED };
    service.updateStatus.mockResolvedValue(solicitation);

    await expect(
      controller.updateStatus(
        'solicitation-id',
        { status: SolicitationStatus.RESOLVED },
        actor,
      ),
    ).resolves.toBe(solicitation);
    expect(service.updateStatus).toHaveBeenCalledWith(
      'solicitation-id',
      { status: SolicitationStatus.RESOLVED },
      actor,
    );
  });

  it('delegates getKanbanBoard para o service', async () => {
    const { controller, service } = makeController();
    const board = { columns: [] };
    service.getKanbanBoard.mockResolvedValue(board);

    await expect(controller.getKanbanBoard(undefined, actor)).resolves.toBe(board);
    expect(service.getKanbanBoard).toHaveBeenCalledWith(actor, undefined);
  });

  it('delegates moveCard para o service', async () => {
    const { controller, service } = makeController();
    const solicitation = { id: 'solicitation-id', status: SolicitationStatus.IN_ANALYSIS };
    service.moveCard.mockResolvedValue(solicitation);

    await expect(
      controller.moveCard('solicitation-id', { status: SolicitationStatus.IN_ANALYSIS }, actor),
    ).resolves.toBe(solicitation);
    expect(service.moveCard).toHaveBeenCalledWith(
      'solicitation-id',
      { status: SolicitationStatus.IN_ANALYSIS },
      actor,
    );
  });

  it('GET /:id/sla retorna status de SLA calculado', async () => {
    const { controller, service, slaCalculatorService } = makeController();
    const solicitation = { id: 'solicitation-id', status: SolicitationStatus.IN_PROGRESS };
    const slaStatus = {
      status: 'warning',
      percentUsed: 85,
      minutesRemaining: 30,
      isBreached: false,
      isWarning: true,
    };

    service.findOne.mockResolvedValue(solicitation);
    slaCalculatorService.getSlaStatus.mockReturnValue(slaStatus);

    await expect(controller.getSlaStatus('solicitation-id', actor)).resolves.toBe(slaStatus);
    expect(service.findOne).toHaveBeenCalledWith('solicitation-id', actor);
    expect(slaCalculatorService.getSlaStatus).toHaveBeenCalledWith(solicitation);
  });
});
