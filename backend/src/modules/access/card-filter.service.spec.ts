import { ForbiddenException } from '@nestjs/common';
import { SolicitationEntity, SubmissionItemEntity } from '../../database/entities';
import { CardFilterService, type CardFilterTarget } from './card-filter.service';
import { fakeProcessAccess, grantsFor } from './testing/fake-process-access';

const RULES = [{ fieldCode: 'filial', values: ['SP'], roleCodes: ['comercial'], userIds: [] }];
const PHASES = [
  { id: 'triagem', formId: 'form-a', order: 0, cardVisibility: { rules: RULES, othersSeeAll: false } },
  { id: 'fim', formId: 'form-a', order: 1, cardVisibility: null },
];

const card = (data: Partial<CardFilterTarget>): CardFilterTarget => ({
  id: 'sol-x',
  formId: 'form-a',
  currentPhaseId: 'triagem',
  submissionId: null,
  metadata: null,
  createdBy: 'outra-pessoa',
  assigneeId: null,
  ...data,
});

/** Card de SP, de RJ e sem resposta (todos na triagem) e um na fase sem filtro. */
const CARDS = [
  card({ id: 'sol-sp', submissionId: 'sub-sp' }),
  card({ id: 'sol-rj', submissionId: 'sub-rj' }),
  card({ id: 'sol-vazio' }),
  card({ id: 'sol-fim', currentPhaseId: 'fim', submissionId: 'sub-rj' }),
];

function setup(phases: unknown[] = PHASES) {
  const phasesRepo = { find: jest.fn().mockResolvedValue(phases) };
  const phaseValuesRepo = { find: jest.fn().mockResolvedValue([]) };
  const items = {
    find: jest.fn().mockResolvedValue([
      { submissionId: 'sub-sp', fieldCode: 'filial', valueText: 'SP', valueNumber: null, valueBoolean: null, valueJson: null },
      { submissionId: 'sub-rj', fieldCode: 'filial', valueText: 'RJ', valueNumber: null, valueBoolean: null, valueJson: null },
    ]),
  };
  const cardsQb = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(CARDS),
  };
  const dataSource = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === SubmissionItemEntity) return items;
      if (entity === SolicitationEntity) return { createQueryBuilder: () => cardsQb };
      throw new Error('Unexpected repository');
    }),
  };
  const service = new CardFilterService(dataSource as never, phasesRepo as never, phaseValuesRepo as never);
  return { service, phasesRepo, items, cardsQb };
}

const comercial = { sub: 'u-com', role: 'comercial' };
const member = grantsFor('u-com', false, { 'form-a': { 'solicitations.view': 'all', 'responses.view': 'all' } });
const manager = grantsFor('u-com', false, { 'form-a': { 'solicitations.view': 'all', 'kanban_phases.manage': 'all' } });

describe('CardFilterService.hides — um card', () => {
  it('esconde o card cuja resposta não casa com a regra da pessoa; mostra o que casa', async () => {
    const { service } = setup();
    await expect(service.hides(CARDS[1], comercial, member)).resolves.toBe(true);
    await expect(service.hides(CARDS[0], comercial, member)).resolves.toBe(false);
    // Sem resposta não casa com nada.
    await expect(service.hides(CARDS[2], comercial, member)).resolves.toBe(true);
  });

  it('não esconde: fase sem filtro, card sem processo, o próprio card, quem configura as fases', async () => {
    const { service, phasesRepo } = setup();
    await expect(service.hides(CARDS[3], comercial, member)).resolves.toBe(false);
    await expect(service.hides(card({ id: 'sol-avulso', formId: null }), comercial, member)).resolves.toBe(false);
    await expect(service.hides({ ...CARDS[1], assigneeId: 'u-com' }, comercial, member)).resolves.toBe(false);
    await expect(service.hides({ ...CARDS[1], createdBy: 'u-com' }, comercial, member)).resolves.toBe(false);
    phasesRepo.find.mockClear();
    await expect(service.hides(CARDS[1], comercial, manager)).resolves.toBe(false);
    // Nem consulta as fases quando já se sabe a resposta.
    expect(phasesRepo.find).not.toHaveBeenCalled();
  });

  it('card sem fase gravada (ou com fase apagada) é julgado pela primeira fase', async () => {
    const { service } = setup();
    await expect(service.hides({ ...CARDS[1], currentPhaseId: null }, comercial, member)).resolves.toBe(true);
    await expect(service.hides({ ...CARDS[1], currentPhaseId: 'apagada' }, comercial, member)).resolves.toBe(true);
  });
});

describe('CardFilterService.hiddenCards — listas', () => {
  it('devolve os cards escondidos com a resposta de que nasceram', async () => {
    const { service } = setup();
    await expect(service.hiddenCards(comercial, member, 'form-a')).resolves.toEqual([
      { id: 'sol-rj', submissionId: 'sub-rj' },
      { id: 'sol-vazio', submissionId: null },
    ]);
  });

  it('sem buscar cards: quem configura as fases, e quem não está em regra numa fase que deixa ver todos', async () => {
    const { service, cardsQb } = setup([
      { ...PHASES[0], cardVisibility: { rules: RULES, othersSeeAll: true } },
      PHASES[1],
    ]);
    await expect(service.hiddenCards(comercial, manager)).resolves.toEqual([]);
    await expect(service.hiddenCards({ sub: 'u-fin', role: 'financeiro' }, member)).resolves.toEqual([]);
    expect(cardsQb.getMany).not.toHaveBeenCalled();
  });
});

describe('ProcessAccessService com o filtro de cards', () => {
  it('quem vê as respostas do processo não abre a resposta de um card escondido; o aprovador dele abre', async () => {
    const { service: cardFilter } = setup();
    const cardsOfSubmission = { find: jest.fn().mockResolvedValue([{ ...CARDS[1] }]) };
    const isApprover = { value: false };
    const solicitationsRepository = {
      ...cardsOfSubmission,
      createQueryBuilder: () => ({
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getExists: jest.fn(() => Promise.resolve(isApprover.value)),
      }),
    };
    const access = fakeProcessAccess({
      members: { 'u-com': { 'form-a': { 'solicitations.view': 'all', 'responses.view': 'all' } } },
      formsRepository: { findOne: jest.fn().mockResolvedValue({ id: 'form-a' }) },
      solicitationsRepository,
      cardFilter,
    });

    await expect(
      access.assertSubmissionReadable({ id: 'sub-rj', formId: 'form-a' }, comercial),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(access.canAccessSolicitation(CARDS[1], comercial, 'solicitations.view')).resolves.toBe(false);

    isApprover.value = true;
    await expect(access.assertSubmissionReadable({ id: 'sub-rj', formId: 'form-a' }, comercial)).resolves.toBeUndefined();

    cardsOfSubmission.find.mockResolvedValue([{ ...CARDS[0] }]);
    isApprover.value = false;
    await expect(access.assertSubmissionReadable({ id: 'sub-sp', formId: 'form-a' }, comercial)).resolves.toBeUndefined();
  });
});
