import { describe, expect, it } from 'vitest';
import type { DraftKanbanPhase } from '../types';
import { draftSaveIssue, newDraftField, toDraft, toSavePayload } from './phase-draft';

function draft(overrides: Partial<DraftKanbanPhase> = {}): DraftKanbanPhase {
  return {
    id: 'p1',
    serverId: 'p1',
    key: 'logistica',
    label: 'Logística',
    color: 'amber',
    description: '',
    isTerminal: false,
    actors: { roleCodes: [], userIds: [] },
    requiresApproval: false,
    approvers: { roleCodes: [], userIds: [] },
    approvalMode: 'any',
    approvalRequest: 'manual',
    approvalOnApproved: 'stay',
    approvalOnRejected: 'stay',
    requireFieldsToExit: false,
    requireAssigneeToExit: false,
    blockMoveBack: false,
    restrictVisibility: false,
    visibleTo: { roleCodes: [], areaIds: [], userIds: [] },
    slaHours: null,
    slaBusinessHours: false,
    slaWarningPercent: null,
    fields: [],
    sectionFlow: {},
    ...overrides,
  };
}

describe('phase-draft', () => {
  it('toDraft → toSavePayload devolve a mesma configuração, com obrigatório preservado', () => {
    const payload = toSavePayload(
      toDraft([
        {
          id: 'p1',
          formId: 'f',
          key: 'logistica',
          label: 'Logística',
          color: 'amber',
          description: null,
          order: 0,
          isTerminal: false,
          actorRoleCode: 'logistica',
          requiresApproval: false,
          approverRoleCode: 'gerente',
          fields: [
            {
              id: 'c1',
              code: 'retirado_de_rota',
              label: 'Retirado de rota',
              fieldType: 'checkbox',
              required: true,
              order: 0,
              settingsJson: null,
              optionsJson: null,
            },
          ],
        },
      ]),
    );
    expect(payload).toEqual([
      expect.objectContaining({
        id: 'p1',
        // fase antiga (perfil único) vira lista; sem exigir aprovação, quem aprova não vai
        actors: { roleCodes: ['logistica'], userIds: [] },
        approvers: null,
        description: null,
        fields: [expect.objectContaining({ id: 'c1', code: 'retirado_de_rota', required: true, order: 0 })],
      }),
    ]);
  });

  it('draftSaveIssue aponta aprovador faltando e código repetido', () => {
    expect(draftSaveIssue([])).toMatch(/pelo menos uma fase/);
    expect(draftSaveIssue([draft({ requiresApproval: true })])).toMatch(/ninguém foi escolhido para aprovar/);
    expect(
      draftSaveIssue([draft({ requiresApproval: true, approvers: { roleCodes: [], userIds: ['u-diretor'] } })]),
    ).toBeNull();
    const a = { ...newDraftField(1), code: 'romaneio', label: 'Romaneio' };
    const b = { ...newDraftField(2), code: 'romaneio', label: 'Romaneio 2' };
    expect(draftSaveIssue([draft({ fields: [a, b] })])).toMatch(/"romaneio"/);
    expect(draftSaveIssue([draft({ fields: [a] })])).toBeNull();
  });

  it('o que a fase faz sozinha com a aprovação vai e volta; sem aprovação, volta ao padrão', () => {
    const automatic = {
      requiresApproval: true,
      approvers: { roleCodes: ['supervisor'], userIds: [] },
      approvalRequest: 'on_complete',
      approvalOnApproved: 'next',
      approvalOnRejected: 'close',
    } as const;
    const [saved] = toSavePayload([draft(automatic)]);
    expect(saved).toMatchObject({ approvalRequest: 'on_complete', approvalOnApproved: 'next', approvalOnRejected: 'close' });
    expect(toDraft([{ ...saved, id: 'p1', formId: 'f', fields: [] } as never])[0]).toMatchObject({
      approvalRequest: 'on_complete',
      approvalOnApproved: 'next',
      approvalOnRejected: 'close',
    });
    expect(toSavePayload([draft({ ...automatic, requiresApproval: false })])[0]).toMatchObject({
      approvalRequest: 'manual',
      approvalOnApproved: 'stay',
      approvalOnRejected: 'stay',
    });
    // Fase gravada antes das opções existirem: padrão de antes (pelo botão, card parado).
    expect(toDraft([{ id: 'p1', formId: 'f', key: 'k', label: 'L', color: 'blue', description: null, order: 0, isTerminal: false, actorRoleCode: null, requiresApproval: false, approverRoleCode: null, fields: [] }])[0]).toMatchObject({
      approvalRequest: 'manual',
      approvalOnApproved: 'stay',
      approvalOnRejected: 'stay',
    });
  });

  it('"só avançar com os obrigatórios preenchidos" e "com responsável" vão e voltam; fase antiga fica desligada', () => {
    const [saved] = toSavePayload([draft({ requireFieldsToExit: true, requireAssigneeToExit: true })]);
    expect(saved).toMatchObject({ requireFieldsToExit: true, requireAssigneeToExit: true });
    expect(toDraft([{ ...saved, id: 'p1', formId: 'f', fields: [] } as never])[0]).toMatchObject({
      requireFieldsToExit: true,
      requireAssigneeToExit: true,
    });
    expect(toDraft([{ id: 'p1', formId: 'f', key: 'k', label: 'L', color: 'blue', description: null, order: 0, isTerminal: false, actorRoleCode: null, requiresApproval: false, approverRoleCode: null, fields: [] }])[0]).toMatchObject({
      requireFieldsToExit: false,
      requireAssigneeToExit: false,
    });
  });

  it('"ponto sem volta" vai e volta; fase antiga fica desligada', () => {
    const [saved] = toSavePayload([draft({ blockMoveBack: true })]);
    expect(saved).toMatchObject({ blockMoveBack: true });
    expect(toDraft([{ ...saved, id: 'p1', formId: 'f', fields: [] } as never])[0]).toMatchObject({ blockMoveBack: true });
    expect(toDraft([{ id: 'p1', formId: 'f', key: 'k', label: 'L', color: 'blue', description: null, order: 0, isTerminal: false, actorRoleCode: null, requiresApproval: false, approverRoleCode: null, fields: [] }])[0]).toMatchObject({
      blockMoveBack: false,
    });
  });

  it('prazo da fase vai e volta; fase final ou sem horas não manda prazo nem opções', () => {
    expect(toSavePayload([draft({ slaHours: 20, slaBusinessHours: true, slaWarningPercent: 70 })])[0]).toMatchObject({
      slaHours: 20,
      slaBusinessHours: true,
      slaWarningPercent: 70,
    });
    expect(toSavePayload([draft({ isTerminal: true, slaHours: 20, slaBusinessHours: true })])[0]).toMatchObject({
      slaHours: null,
      slaBusinessHours: false,
      slaWarningPercent: null,
    });
    expect(toSavePayload([draft({ slaHours: null, slaBusinessHours: true, slaWarningPercent: 70 })])[0]).toMatchObject({
      slaBusinessHours: false,
      slaWarningPercent: null,
    });
  });

  it('draftSaveIssue cobra a fórmula do cálculo de fase', () => {
    const calc = { ...newDraftField(1), label: 'Total', fieldType: 'calculated' as const };
    expect(draftSaveIssue([draft({ fields: [{ ...calc, settingsJson: {} }] })])).toBe(
      'O cálculo "Total" da fase "Logística": Escreva uma fórmula.',
    );
    expect(draftSaveIssue([draft({ fields: [{ ...calc, settingsJson: { formula: '{a} *' } }] })])).toMatch(
      /O cálculo "Total" da fase "Logística": /,
    );
    expect(draftSaveIssue([draft({ fields: [{ ...calc, settingsJson: { formula: '{a} * 2' } }] })])).toBeNull();
  });

  it('draftSaveIssue cobra a lista e uma coluna para preencher no "Pedido de itens"', () => {
    const order = { ...newDraftField(1), label: 'Pedido', fieldType: 'item_order' as const };
    expect(draftSaveIssue([draft({ fields: [{ ...order, settingsJson: { inputColumns: [] } }] })])).toBe(
      'Escolha a lista de itens do campo "Pedido" (fase "Logística").',
    );
    expect(
      draftSaveIssue([draft({ fields: [{ ...order, settingsJson: { itemListId: 'list-1', inputColumns: [] } }] })]),
    ).toMatch(/pelo menos uma coluna para preencher/);
    const quantity = { id: 'quantidade', label: 'Quantidade', type: 'number' as const, required: true };
    expect(
      draftSaveIssue([draft({ fields: [{ ...order, settingsJson: { itemListId: 'list-1', inputColumns: [quantity] } }] })]),
    ).toBeNull();
  });

  it('draftSaveIssue cobra nome do campo e opções de campos de seleção (divisor pode ficar sem nome)', () => {
    const unnamed = newDraftField(1);
    expect(draftSaveIssue([draft({ fields: [unnamed] })])).toMatch(/campo sem nome/);
    expect(draftSaveIssue([draft({ fields: [{ ...unnamed, fieldType: 'divider' }] })])).toBeNull();

    const select = { ...newDraftField(1), label: 'Motivo', fieldType: 'single_select' as const };
    expect(draftSaveIssue([draft({ fields: [select] })])).toMatch(/pelo menos uma opção/);
    expect(
      draftSaveIssue([draft({ fields: [{ ...select, options: [{ value: 'a', label: ' ' }] }] })]),
    ).toMatch(/opção sem nome/);
    expect(
      draftSaveIssue([
        draft({ fields: [{ ...select, options: [{ value: 'a', label: 'A' }, { value: 'a', label: 'A de novo' }] }] }),
      ]),
    ).toMatch(/duas opções iguais/);
  });

  it('toSavePayload não manda a marca interna isNew das opções e tira espaços do nome', () => {
    const field = {
      ...newDraftField(1),
      label: 'Motivo',
      fieldType: 'single_select' as const,
      options: [{ value: 'cliente_desistiu', label: ' Cliente desistiu ', isNew: true }],
    };
    expect(toSavePayload([draft({ fields: [field] })])[0].fields[0].options).toEqual([
      { value: 'cliente_desistiu', label: 'Cliente desistiu' },
    ]);
  });

  it('visibilidade: restrita sem ninguém escolhido não salva; não restrita vai como null', () => {
    expect(draftSaveIssue([draft({ restrictVisibility: true })])).toMatch(/ninguém foi escolhido/);
    const restrita = draft({
      restrictVisibility: true,
      visibleTo: { roleCodes: ['logistica'], areaIds: [], userIds: ['u1'] },
    });
    expect(draftSaveIssue([restrita])).toBeNull();
    expect(toSavePayload([restrita])[0].visibleTo).toEqual({ roleCodes: ['logistica'], areaIds: [], userIds: ['u1'] });
    // listas preenchidas, mas "Todos com acesso" escolhido: grava sem restrição
    expect(toSavePayload([{ ...restrita, restrictVisibility: false }])[0].visibleTo).toBeNull();
  });

  it('toDraft liga a restrição só quando a fase tem alguém escolhido', () => {
    const phase = {
      id: 'p',
      formId: 'f',
      key: 'k',
      label: 'L',
      color: 'blue',
      description: null,
      order: 0,
      isTerminal: false,
      actorRoleCode: null,
      requiresApproval: false,
      approverRoleCode: null,
      fields: [],
    };
    expect(toDraft([{ ...phase, visibleTo: null }])[0]).toMatchObject({
      restrictVisibility: false,
      visibleTo: { roleCodes: [], areaIds: [], userIds: [] },
    });
    expect(toDraft([{ ...phase, visibleTo: { roleCodes: [], areaIds: ['a1'], userIds: [] } }])[0].restrictVisibility).toBe(true);
  });
});
