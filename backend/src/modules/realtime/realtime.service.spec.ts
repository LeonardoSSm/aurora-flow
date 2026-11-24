import type { JwtPayload } from '../auth/types/jwt-payload.type';
import type { SolicitationsService } from '../solicitations/solicitations.service';
import {
  CHANGED_COALESCE_MS,
  MAX_CONNECTIONS_PER_USER,
  RealtimeService,
  type RealtimeClient,
  type RealtimeEvent,
} from './realtime.service';

function actor(sub: string, role = 'operador'): JwtPayload {
  return { sub, role, email: `${sub}@x`, fullName: sub, tokenVersion: 1 };
}

function client(sub: string): RealtimeClient & { events: RealtimeEvent[]; closed: boolean } {
  const c = {
    actor: actor(sub),
    events: [] as RealtimeEvent[],
    closed: false,
    send: (event: RealtimeEvent) => c.events.push(event),
    close: () => {
      c.closed = true;
    },
  };
  return c;
}

const SUMMARY = { id: 's1', title: 'Pedido 123', formId: 'f1', formName: 'Cancelamento' };

describe('RealtimeService', () => {
  let describeIfVisible: jest.Mock;
  let service: RealtimeService;

  beforeEach(() => {
    jest.useFakeTimers();
    describeIfVisible = jest.fn();
    service = new RealtimeService({ describeIfVisible } as unknown as SolicitationsService);
  });

  afterEach(() => {
    service.onApplicationShutdown();
    jest.useRealTimers();
  });

  it('junta uma rajada de mudanças num aviso só para cada conexão', () => {
    const a = client('a');
    const b = client('b');
    service.add(a);
    service.add(b);

    service.broadcastChanged();
    service.broadcastChanged();
    service.broadcastChanged();
    expect(a.events).toEqual([]);

    jest.advanceTimersByTime(CHANGED_COALESCE_MS);
    expect(a.events).toEqual([{ type: 'solicitations.changed' }]);
    expect(b.events).toEqual([{ type: 'solicitations.changed' }]);
  });

  it('conexão removida não recebe mais nada', () => {
    const a = client('a');
    const id = service.add(a);
    service.remove(id);
    service.broadcastChanged();
    jest.advanceTimersByTime(CHANGED_COALESCE_MS);
    expect(a.events).toEqual([]);
  });

  it('solicitação nova vai só para quem a vê, uma checagem por usuário, e não para quem criou', async () => {
    const aTab1 = client('a');
    const aTab2 = client('a');
    const semAcesso = client('b');
    const criador = client('c');
    [aTab1, aTab2, semAcesso, criador].forEach((c) => service.add(c));
    describeIfVisible.mockImplementation(async (_id: string, who: JwtPayload) =>
      who.sub === 'a' ? SUMMARY : null,
    );

    await service.notifyCreated('s1', 'c');

    expect(describeIfVisible).toHaveBeenCalledTimes(2);
    expect(describeIfVisible.mock.calls.map(([, who]) => (who as JwtPayload).sub).sort()).toEqual(['a', 'b']);
    expect(aTab1.events).toEqual([{ type: 'solicitation.created', solicitation: SUMMARY }]);
    expect(aTab2.events).toEqual([{ type: 'solicitation.created', solicitation: SUMMARY }]);
    expect(semAcesso.events).toEqual([]);
    expect(criador.events).toEqual([]);
  });

  it('erro ao checar um usuário não impede os outros', async () => {
    const a = client('a');
    const b = client('b');
    service.add(a);
    service.add(b);
    describeIfVisible.mockImplementation(async (_id: string, who: JwtPayload) => {
      if (who.sub === 'a') throw new Error('db');
      return SUMMARY;
    });

    await service.notifyCreated('s1', null);

    expect(a.events).toEqual([]);
    expect(b.events).toHaveLength(1);
  });

  it(`fecha a aba mais antiga quando o usuário passa de ${MAX_CONNECTIONS_PER_USER} conexões`, () => {
    const tabs = Array.from({ length: MAX_CONNECTIONS_PER_USER + 1 }, () => client('a'));
    tabs.forEach((tab) => service.add(tab));

    expect(tabs[0].closed).toBe(true);
    expect(tabs.slice(1).every((tab) => !tab.closed)).toBe(true);
    expect(service.connectionCount).toBe(MAX_CONNECTIONS_PER_USER);
  });
});
