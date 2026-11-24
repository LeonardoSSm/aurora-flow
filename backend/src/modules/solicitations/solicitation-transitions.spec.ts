import { SolicitationStatus } from '../../common/enums/solicitation-status.enum';
import { isTransitionAllowed, SOLICITATION_TRANSITIONS } from './solicitation-transitions';

describe('isTransitionAllowed — transições permitidas', () => {
  it('new -> in_analysis é permitida', () => {
    expect(isTransitionAllowed(SolicitationStatus.NEW, SolicitationStatus.IN_ANALYSIS)).toBe(true);
  });

  it('new -> rejected é permitida (ex: reprovação automática por um Flow logo na primeira fase)', () => {
    expect(isTransitionAllowed(SolicitationStatus.NEW, SolicitationStatus.REJECTED)).toBe(true);
  });

  it('waiting_approval -> approved é permitida', () => {
    expect(
      isTransitionAllowed(SolicitationStatus.WAITING_APPROVAL, SolicitationStatus.APPROVED),
    ).toBe(true);
  });

  it('waiting_approval -> rejected é permitida', () => {
    expect(
      isTransitionAllowed(SolicitationStatus.WAITING_APPROVAL, SolicitationStatus.REJECTED),
    ).toBe(true);
  });

  it('in_analysis -> waiting_approval é permitida', () => {
    expect(
      isTransitionAllowed(SolicitationStatus.IN_ANALYSIS, SolicitationStatus.WAITING_APPROVAL),
    ).toBe(true);
  });

  it('in_analysis -> in_progress é permitida', () => {
    expect(
      isTransitionAllowed(SolicitationStatus.IN_ANALYSIS, SolicitationStatus.IN_PROGRESS),
    ).toBe(true);
  });

  it('approved -> in_progress é permitida', () => {
    expect(
      isTransitionAllowed(SolicitationStatus.APPROVED, SolicitationStatus.IN_PROGRESS),
    ).toBe(true);
  });

  it('in_progress -> completed é permitida', () => {
    expect(
      isTransitionAllowed(SolicitationStatus.IN_PROGRESS, SolicitationStatus.COMPLETED),
    ).toBe(true);
  });

  it('in_progress -> waiting_integration é permitida', () => {
    expect(
      isTransitionAllowed(SolicitationStatus.IN_PROGRESS, SolicitationStatus.WAITING_INTEGRATION),
    ).toBe(true);
  });

  it('waiting_integration -> completed é permitida', () => {
    expect(
      isTransitionAllowed(
        SolicitationStatus.WAITING_INTEGRATION,
        SolicitationStatus.COMPLETED,
      ),
    ).toBe(true);
  });

  it('rejected -> cancelled é permitida', () => {
    expect(
      isTransitionAllowed(SolicitationStatus.REJECTED, SolicitationStatus.CANCELLED),
    ).toBe(true);
  });
});

describe('isTransitionAllowed — transições bloqueadas', () => {
  it('new -> completed não é permitida', () => {
    expect(isTransitionAllowed(SolicitationStatus.NEW, SolicitationStatus.COMPLETED)).toBe(false);
  });

  it('approved -> waiting_approval não é permitida (reverso)', () => {
    expect(
      isTransitionAllowed(SolicitationStatus.APPROVED, SolicitationStatus.WAITING_APPROVAL),
    ).toBe(false);
  });

  it('completed -> qualquer status não é permitida (estado terminal)', () => {
    const allStatuses = Object.values(SolicitationStatus);
    for (const to of allStatuses) {
      expect(isTransitionAllowed(SolicitationStatus.COMPLETED, to)).toBe(false);
    }
  });

  it('cancelled -> qualquer status não é permitida (estado terminal)', () => {
    const allStatuses = Object.values(SolicitationStatus);
    for (const to of allStatuses) {
      expect(isTransitionAllowed(SolicitationStatus.CANCELLED, to)).toBe(false);
    }
  });

  it('new -> cancelled não é permitida diretamente', () => {
    expect(isTransitionAllowed(SolicitationStatus.NEW, SolicitationStatus.CANCELLED)).toBe(false);
  });

  it('in_progress -> approved não é permitida', () => {
    expect(
      isTransitionAllowed(SolicitationStatus.IN_PROGRESS, SolicitationStatus.APPROVED),
    ).toBe(false);
  });
});

describe('isTransitionAllowed — qualquer status operacional -> cancelled', () => {
  const operationalStatuses = [
    SolicitationStatus.IN_ANALYSIS,
    SolicitationStatus.WAITING_APPROVAL,
    SolicitationStatus.APPROVED,
    SolicitationStatus.IN_PROGRESS,
    SolicitationStatus.WAITING_INTEGRATION,
    SolicitationStatus.REJECTED,
  ];

  it.each(operationalStatuses)(
    'transição de %s -> cancelled é permitida',
    (fromStatus) => {
      expect(isTransitionAllowed(fromStatus, SolicitationStatus.CANCELLED)).toBe(true);
    },
  );
});

describe('SOLICITATION_TRANSITIONS — integridade do mapa', () => {
  it('todos os destinos declarados são valores válidos do enum', () => {
    const validStatuses = new Set(Object.values(SolicitationStatus));
    for (const [from, targets] of SOLICITATION_TRANSITIONS) {
      expect(validStatuses.has(from)).toBe(true);
      for (const to of targets) {
        expect(validStatuses.has(to)).toBe(true);
      }
    }
  });

  it('nenhum status tem transição para si mesmo', () => {
    for (const [from, targets] of SOLICITATION_TRANSITIONS) {
      expect(targets).not.toContain(from);
    }
  });

  it('isTransitionAllowed retorna false para status sem mapa de transição', () => {
    // OPEN é um status legado sem mapa de transição no Kanban
    expect(isTransitionAllowed(SolicitationStatus.OPEN, SolicitationStatus.IN_ANALYSIS)).toBe(
      false,
    );
  });
});
