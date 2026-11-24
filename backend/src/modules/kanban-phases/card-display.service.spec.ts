import { NotFoundException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import {
  FormFieldEntity,
  FormVersionEntity,
  KanbanPhaseFieldEntity,
  KanbanPhaseFieldValueEntity,
  SubmissionItemEntity,
} from '../../database/entities';
import { SOLICITATION_FORM_FIELD_VALUES_KEY } from '../flows/types/flow.types';
import { CardDisplayService } from './card-display.service';

const FORM_ID = 'form-1';
const PHASE_ID = 'phase-1';

function item(fieldCode: string, value: Partial<Record<'valueText' | 'valueNumber' | 'valueBoolean' | 'valueJson', unknown>>) {
  return { fieldCode, valueText: null, valueNumber: null, valueBoolean: null, valueJson: null, ...value };
}

function setup() {
  const repos = new Map<unknown, { find: jest.Mock; findOne: jest.Mock }>();
  const repo = (entity: unknown) => {
    let found = repos.get(entity);
    if (!found) {
      found = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn() };
      repos.set(entity, found);
    }
    return found;
  };
  repo(FormVersionEntity).findOne.mockResolvedValue({ id: 'v2' });
  repo(FormFieldEntity).find.mockResolvedValue([
    {
      code: 'cidade',
      label: 'Cidade',
      fieldType: 'single_select',
      settingsJson: {},
      options: [{ internalValue: 'sp', displayLabel: 'São Paulo' }],
    },
    { code: 'total', label: 'Valor total', fieldType: 'currency', settingsJson: {}, options: [] },
    { code: 'anexo', label: 'Anexo', fieldType: 'file_upload', settingsJson: {}, options: [] },
  ]);
  repo(KanbanPhaseFieldEntity).find.mockResolvedValue([
    { code: 'nf', label: 'Nº da NF', fieldType: 'short_text', settingsJson: null, optionsJson: null, phase: { label: 'Faturamento' } },
    // Código repetido: o do formulário ganha.
    { code: 'total', label: 'Total (fase)', fieldType: 'number', settingsJson: null, optionsJson: null, phase: { label: 'X' } },
  ]);
  const dataSource = { getRepository: (entity: unknown) => repo(entity) } as unknown as DataSource;
  const phasesRepository = {
    findOne: jest.fn().mockResolvedValue({ id: PHASE_ID, formId: FORM_ID, cardDisplay: null }),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const personalRepository = {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    upsert: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const service = new CardDisplayService(dataSource, phasesRepository as never, personalRepository as never);
  return { service, repo, phasesRepository, personalRepository };
}

describe('CardDisplayService', () => {
  it('catálogo: campos do formulário e depois das fases, sem arquivo, formulário ganha no código repetido', async () => {
    const { service } = setup();
    const view = await service.getForPhase(FORM_ID, PHASE_ID, 'user-1');
    expect(view.fields).toEqual([
      { code: 'cidade', label: 'Cidade', fieldType: 'single_select', phaseLabel: null },
      { code: 'total', label: 'Valor total', fieldType: 'currency', phaseLabel: null },
      { code: 'nf', label: 'Nº da NF', fieldType: 'short_text', phaseLabel: 'Faturamento' },
    ]);
    expect(view.source).toBe('default');
    expect(view.personal).toBeNull();
  });

  it('fase de outro processo não existe', async () => {
    const { service, phasesRepository } = setup();
    phasesRepository.findOne.mockResolvedValue(null);
    await expect(service.getForPhase(FORM_ID, PHASE_ID, 'user-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('ajuste pessoal grava por (pessoa, fase) e null apaga', async () => {
    const { service, personalRepository } = setup();
    await service.savePersonal(FORM_ID, PHASE_ID, 'user-1', {
      indicators: ['priority', 'nope'],
      fields: [{ fieldCode: 'cidade', label: '' }],
    });
    expect(personalRepository.upsert).toHaveBeenCalledWith(
      { userId: 'user-1', phaseId: PHASE_ID, config: { indicators: ['priority'], fields: [{ fieldCode: 'cidade', label: null }] } },
      ['userId', 'phaseId'],
    );
    await service.savePersonal(FORM_ID, PHASE_ID, 'user-1', null);
    expect(personalRepository.delete).toHaveBeenCalledWith({ userId: 'user-1', phaseId: PHASE_ID });
  });

  it('padrão da fase grava normalizado e null volta ao padrão do sistema', async () => {
    const { service, phasesRepository } = setup();
    await service.savePhaseDefault(FORM_ID, PHASE_ID, { indicators: ['requester'], fields: [] }, 'user-1');
    expect(phasesRepository.update).toHaveBeenCalledWith(PHASE_ID, {
      cardDisplay: { indicators: ['requester'], fields: [] },
    });
    await service.savePhaseDefault(FORM_ID, PHASE_ID, null, 'user-1');
    expect(phasesRepository.update).toHaveBeenLastCalledWith(PHASE_ID, { cardDisplay: null });
  });

  it('valores do card: formulário > fluxo > fase, formatados, na ordem escolhida, com rótulo próprio', async () => {
    const { service, repo } = setup();
    repo(SubmissionItemEntity).find.mockResolvedValue([
      { submissionId: 'sub-1', ...item('cidade', { valueText: 'sp' }) },
      { submissionId: 'sub-1', ...item('total', { valueNumber: 1500 }) },
    ]);
    repo(KanbanPhaseFieldValueEntity).find.mockResolvedValue([
      { solicitationId: 'sol-1', ...item('nf', { valueText: '123' }) },
      { solicitationId: 'sol-2', ...item('nf', { valueText: '999' }) },
      // Perde para o formulário.
      { solicitationId: 'sol-1', ...item('total', { valueNumber: 1 }) },
    ]);
    const cards = [
      { id: 'sol-1', submissionId: 'sub-1', metadata: null },
      { id: 'sol-2', submissionId: null, metadata: { [SOLICITATION_FORM_FIELD_VALUES_KEY]: { cidade: 'sp' } } },
      { id: 'sol-3', submissionId: null, metadata: null },
    ];
    const display = {
      indicators: [],
      fields: [
        { fieldCode: 'nf', label: 'NF' },
        { fieldCode: 'cidade', label: null },
        { fieldCode: 'total', label: null },
        { fieldCode: 'sumiu', label: null },
      ],
    };
    const result = await service.loadCardFields(FORM_ID, cards as never, () => display as never);
    expect(result.get('sol-1')).toEqual([
      { code: 'nf', label: 'NF', text: '123' },
      { code: 'cidade', label: 'Cidade', text: 'São Paulo' },
      { code: 'total', label: 'Valor total', text: 'R$ 1.500,00' },
    ]);
    // Valor dado por um fluxo (metadata) entra quando não há resposta do formulário.
    expect(result.get('sol-2')).toEqual([
      { code: 'nf', label: 'NF', text: '999' },
      { code: 'cidade', label: 'Cidade', text: 'São Paulo' },
    ]);
    // Sem nenhuma resposta: o card não ganha a lista.
    expect(result.has('sol-3')).toBe(false);
  });

  it('nenhuma fase pede campo: não consulta o banco', async () => {
    const { service, repo } = setup();
    const result = await service.loadCardFields(FORM_ID, [{ id: 'sol-1', submissionId: 'sub-1', metadata: null }] as never, () => ({
      indicators: ['priority'],
      fields: [],
    }));
    expect(result.size).toBe(0);
    expect(repo(SubmissionItemEntity).find).not.toHaveBeenCalled();
  });
});
