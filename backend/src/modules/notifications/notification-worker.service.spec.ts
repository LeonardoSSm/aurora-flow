import { NotificationWorkerService } from './notification-worker.service';

function makeWorker(options: { enabled?: string; processed?: number[] } = {}) {
  const queue = [...(options.processed ?? [0])];
  const dispatcher = { processDue: jest.fn(async () => queue.shift() ?? 0) };
  const notifications = { purgeExpired: jest.fn().mockResolvedValue(0) };
  const config = {
    get: jest.fn((key: string, fallback?: string) =>
      key === 'NOTIFICATIONS_WORKER_ENABLED' ? (options.enabled ?? fallback) : fallback,
    ),
  };
  const worker = new NotificationWorkerService(dispatcher as never, notifications as never, config as never);
  return { worker, dispatcher, notifications };
}

describe('NotificationWorkerService', () => {
  it('um ciclo processa um lote e para quando ele não vem cheio', async () => {
    const { worker, dispatcher } = makeWorker({ processed: [10] });
    await worker.tick();
    expect(dispatcher.processDue).toHaveBeenCalledTimes(1);
    expect(dispatcher.processDue).toHaveBeenCalledWith(50);
  });

  it('continua enquanto os lotes vierem cheios, até o teto de 5 lotes por ciclo', async () => {
    const { worker, dispatcher } = makeWorker({ processed: [50, 50, 50, 50, 50, 50, 50] });
    await worker.tick();
    expect(dispatcher.processDue).toHaveBeenCalledTimes(5);
  });

  it('para no primeiro lote parcial', async () => {
    const { worker, dispatcher } = makeWorker({ processed: [50, 50, 3, 50] });
    await worker.tick();
    expect(dispatcher.processDue).toHaveBeenCalledTimes(3);
  });

  it('NOTIFICATIONS_WORKER_ENABLED=false desliga o worker e o expurgo', async () => {
    const { worker, dispatcher, notifications } = makeWorker({ enabled: 'false' });
    await worker.tick();
    await worker.purge();
    expect(dispatcher.processDue).not.toHaveBeenCalled();
    expect(notifications.purgeExpired).not.toHaveBeenCalled();
  });

  it('não sobrepõe ciclos: se o anterior ainda roda, o novo pula', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { worker, dispatcher } = makeWorker();
    dispatcher.processDue.mockImplementationOnce(async () => {
      await gate;
      return 0;
    });
    const first = worker.tick();
    await worker.tick(); // pulou
    expect(dispatcher.processDue).toHaveBeenCalledTimes(1);
    release();
    await first;
    await worker.tick(); // libera de novo
    expect(dispatcher.processDue).toHaveBeenCalledTimes(2);
  });

  it('um erro não derruba o worker nem trava os próximos ciclos', async () => {
    const { worker, dispatcher } = makeWorker();
    dispatcher.processDue.mockRejectedValueOnce(new Error('banco fora'));
    await expect(worker.tick()).resolves.toBeUndefined();
    await worker.tick();
    expect(dispatcher.processDue).toHaveBeenCalledTimes(2);
  });

  it('o expurgo diário chama o serviço e engole erros', async () => {
    const { worker, notifications } = makeWorker();
    await worker.purge();
    expect(notifications.purgeExpired).toHaveBeenCalledTimes(1);
    notifications.purgeExpired.mockRejectedValueOnce(new Error('x'));
    await expect(worker.purge()).resolves.toBeUndefined();
  });
});
