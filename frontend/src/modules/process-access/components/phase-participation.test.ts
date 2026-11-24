import type { KanbanPhase } from '../../kanban-phases/types';
import { phaseParticipation } from './phase-participation';

const phase = (overrides: Partial<KanbanPhase>): KanbanPhase =>
  ({
    id: 'p',
    formId: 'f',
    key: 'k',
    label: 'Fase',
    color: 'blue',
    description: null,
    order: 0,
    isTerminal: false,
    actorRoleCode: null,
    requiresApproval: false,
    approverRoleCode: null,
    fields: [],
    ...overrides,
  }) as KanbanPhase;

describe('phaseParticipation — onde a pessoa entra nas fases', () => {
  const person = { id: 'u1', role: 'logistica' };

  it('atua pela pessoa ou pelo perfil; fase sem lista fica aberta a quem atua no processo', () => {
    const result = phaseParticipation(
      [
        phase({ label: 'Triagem', actors: { roleCodes: [], userIds: ['u1'] } }),
        phase({ label: 'Separação', actors: { roleCodes: ['logistica'], userIds: [] } }),
        phase({ label: 'Financeiro', actors: { roleCodes: ['financeiro'], userIds: [] } }),
        phase({ label: 'Aberta' }),
        phase({ label: 'Concluído', isTerminal: true }),
      ],
      person,
    );
    expect(result).toEqual({ acts: ['Triagem', 'Separação'], open: ['Aberta'], approves: [] });
  });

  it('aprova só onde a fase pede aprovação e a nomeia; fase antiga (perfil único) vale', () => {
    const result = phaseParticipation(
      [
        phase({ label: 'Liberação', requiresApproval: true, approvers: { roleCodes: [], userIds: ['u1'] } }),
        phase({ label: 'Antiga', requiresApproval: true, approverRoleCode: 'logistica', actorRoleCode: 'logistica' }),
        phase({
          label: 'Sem aprovação',
          requiresApproval: false,
          approvers: { roleCodes: ['logistica'], userIds: [] },
        }),
      ],
      person,
    );
    expect(result.approves).toEqual(['Liberação', 'Antiga']);
    expect(result.acts).toEqual(['Antiga']);
  });
});
