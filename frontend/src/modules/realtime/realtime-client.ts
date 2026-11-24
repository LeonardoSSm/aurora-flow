import { apiBaseUrl, currentAccessToken, refreshAccessToken } from '../../services/api';

export type RealtimeSolicitationSummary = {
  id: string;
  title: string;
  formId: string | null;
  formName: string | null;
};

/** Mesmo formato do backend (modules/realtime/realtime.service.ts). */
export type RealtimeEvent =
  | { type: 'solicitation.created'; solicitation: RealtimeSolicitationSummary }
  | { type: 'solicitations.changed' };

type Handlers = {
  onEvent: (event: RealtimeEvent) => void;
  /** Conectou (ou reconectou): o que chegou enquanto estava fora precisa ser buscado de novo. */
  onOpen?: () => void;
};

const MAX_BACKOFF_MS = 30_000;

/** Lê um corpo `text/event-stream` e entrega cada `data:` já convertido. */
export async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onData: (data: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (data) onData(data);
      boundary = buffer.indexOf('\n\n');
    }
  }
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * Conexão SSE com `/realtime/stream`. Usa `fetch` (e não `EventSource`) para mandar o token no
 * cabeçalho, como o resto da API. Cai → reconecta com espera crescente; token vencido → renova
 * pelo cookie de refresh. Devolve a função que encerra.
 */
export function startRealtime({ onEvent, onOpen }: Handlers): () => void {
  const controller = new AbortController();
  const { signal } = controller;

  void (async () => {
    let failures = 0;
    while (!signal.aborted) {
      try {
        const response = await fetch(`${apiBaseUrl}/realtime/stream`, {
          headers: { Accept: 'text/event-stream', Authorization: `Bearer ${currentAccessToken() ?? ''}` },
          credentials: 'include',
          cache: 'no-store',
          signal,
        });
        if (response.status === 401) {
          // Sem sessão: a próxima chamada do app já leva para o login; aqui só espera.
          if (!(await refreshAccessToken())) failures += 1;
        } else if (response.ok && response.body) {
          failures = 0;
          onOpen?.();
          await readEventStream(response.body, (data) => {
            try {
              onEvent(JSON.parse(data) as RealtimeEvent);
            } catch {
              // evento malformado: ignora
            }
          });
          failures += 1;
        } else {
          failures += 1;
        }
      } catch {
        if (signal.aborted) return;
        failures += 1;
      }
      if (failures > 0) {
        const backoff = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(failures, 5));
        await wait(backoff + Math.random() * 1000, signal);
      }
    }
  })();

  return () => controller.abort();
}
