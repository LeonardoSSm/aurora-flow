import { SolicitationOriginType } from '../../common/enums/solicitation-origin-type.enum';
import { SolicitationPriority } from '../../common/enums/solicitation-priority.enum';
import { buildProcessPanel, panelReason, type ProcessPanelCard } from './process-panel';
import type { KanbanCard } from './solicitation-transitions';

const ME = { sub: 'user-me', role: 'operador' };

const TRIAGEM = { id: 'p1', label: 'Triagem', color: 'blue', actors: null, actorRoleCode: null };
const PRODUCAO = {
  id: 'p2',
  label: 'Produção',
  color: 'amber',
  actors: { roleCodes: ['operador'], userIds: [] },
  actorRoleCode: null,
};

function entry(
  id: string,
  overrides: {
    formId?: string;
    formName?: string;
    phase?: ProcessPanelCard['phase'];
    responsibleUserId?: string | null;
    priority?: SolicitationPriority;
    sla?: 'on_track' | 'warning' | 'breached';
    enteredAt?: string;
  } = {},
): ProcessPanelCard {
  const card: KanbanCard = {
    id,
    title: `Solicitação ${id}`,
    formId: overrides.formId ?? 'form-a',
    formName: overrides.formName ?? 'Cancelamento',
    requesterName: null,
    requesterEmail: null,
    responsibleUserId: overrides.responsibleUserId ?? null,
    responsibleName: null,
    priority: overrides.priority ?? SolicitationPriority.MEDIUM,
    slaDueAt: null,
    currentStage: null,
    phaseId: (overrides.phase ?? TRIAGEM).id,
    updatedAt: new Date('2026-10-16T12:00:00Z'),
    originType: SolicitationOriginType.MANUAL,
    hasIntegrationError: false,
    ...(overrides.sla
      ? {
          phaseSla: {
            enteredAt: '2026-10-10T12:00:00Z',
            dueAt: '2026-10-12T12:00:00Z',
            businessHours: false,
            extended: false,
            state: overrides.sla,
            percentUsed: 50,
            minutesRemaining: 0,
          },
        }
      : {}),
  };
  return {
    card,
    formName: overrides.formName ?? 'Cancelamento',
    phase: overrides.phase ?? TRIAGEM,
    enteredAt: new Date(overrides.enteredAt ?? '2026-10-15T12:00:00Z'),
  };
}

describe('panelReason', () => {
  it('aprovação pendente minha vem antes de tudo', () => {
    expect(panelReason(entry('a', { responsibleUserId: 'outro' }), ME, new Set(['a']))).toBe('approval');
  });

  it('sou o responsável', () => {
    expect(panelReason(entry('a', { responsibleUserId: ME.sub }), ME, new Set())).toBe('assigned');
  });

  it('card de outra pessoa não é meu, mesmo na fase do meu perfil', () => {
    expect(
      panelReason(entry('a', { responsibleUserId: 'outro', phase: PRODUCAO }), ME, new Set()),
    ).toBeNull();
  });

  it('sem responsável: é meu só quando a fase escolheu quem atua e eu estou lá', () => {
    expect(panelReason(entry('a', { phase: PRODUCAO }), ME, new Set())).toBe('phase');
    expect(panelReason(entry('a', { phase: TRIAGEM }), ME, new Set())).toBeNull();
    expect(panelReason(entry('a', { phase: PRODUCAO }), { sub: 'x', role: 'gerente' }, new Set())).toBeNull();
  });
});

describe('buildProcessPanel', () => {
  const phasesByForm = new Map([
    ['form-a', [TRIAGEM, PRODUCAO]],
    ['form-b', [{ id: 'q1', label: 'Análise', color: 'green' }]],
  ]);

  it('agrupa por processo e fase, conta atrasos e acha o card parado há mais tempo', () => {
    const panel = buildProcessPanel({
      entries: [
        entry('a', { sla: 'breached', enteredAt: '2026-10-01T00:00:00Z' }),
        entry('b', { phase: PRODUCAO, sla: 'warning' }),
        entry('c', { phase: PRODUCAO, enteredAt: '2026-10-14T00:00:00Z' }),
        entry('d', { formId: 'form-b', formName: 'Embalagens', phase: { ...TRIAGEM, id: 'q1', label: 'Análise' } }),
      ],
      phasesByForm,
      viewer: ME,
      myApprovalSolicitationIds: new Set(),
    });

    expect(panel.processes.map((p) => p.formName)).toEqual(['Cancelamento', 'Embalagens']);
    const [cancelamento] = panel.processes;
    expect(cancelamento).toMatchObject({ active: 3, late: 1, warning: 1 });
    expect(cancelamento.phases.map((p) => [p.label, p.count, p.late])).toEqual([
      ['Triagem', 1, 1],
      ['Produção', 2, 0],
    ]);
    expect(cancelamento.oldest).toEqual({
      phaseId: 'p1',
      phaseLabel: 'Triagem',
      enteredAt: '2026-10-01T00:00:00.000Z',
    });
  });

  it('lista "para mim" do mais urgente para o menos: atrasado, em alerta, urgente, mais antigo', () => {
    const panel = buildProcessPanel({
      entries: [
        entry('velho', { responsibleUserId: ME.sub, enteredAt: '2026-10-01T00:00:00Z' }),
        entry('urgente', { responsibleUserId: ME.sub, priority: SolicitationPriority.URGENT }),
        entry('alerta', { responsibleUserId: ME.sub, sla: 'warning' }),
        entry('atrasado', { phase: PRODUCAO, sla: 'breached' }),
        entry('de-outro', { responsibleUserId: 'outro', sla: 'breached' }),
      ],
      phasesByForm,
      viewer: ME,
      myApprovalSolicitationIds: new Set(),
    });

    expect(panel.forMe.items.map((item) => item.id)).toEqual(['atrasado', 'alerta', 'urgente', 'velho']);
    expect(panel.forMe).toMatchObject({ total: 4, late: 1 });
    expect(panel.forMe.items[0]).toMatchObject({ phaseLabel: 'Produção', reason: 'phase' });
  });
});
