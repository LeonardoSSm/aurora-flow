import { describe, expect, it } from 'vitest';
import { readEventStream } from './realtime-client';
import { formatAlertTitle } from './tab-alert';

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe('readEventStream', () => {
  it('junta pedaços quebrados no meio, ignora comentários e entrega cada data', async () => {
    const received: string[] = [];
    await readEventStream(
      streamOf([
        ': conectado\n\n',
        'event: solicitations.changed\ndata: {"type":"solic',
        'itations.changed"}\n\n: ping\n\n',
        'event: solicitation.created\r\ndata: {"type":"solicitation.created"}\r\n\r\n',
      ]),
      (data) => received.push(data),
    );

    expect(received).toEqual([
      '{"type":"solicitations.changed"}',
      '{"type":"solicitation.created"}',
    ]);
  });
});

describe('formatAlertTitle', () => {
  it('põe a contagem na frente do título e limita em 99+', () => {
    expect(formatAlertTitle(0, 'Aurora Flow')).toBe('Aurora Flow');
    expect(formatAlertTitle(3, 'Aurora Flow')).toBe('(3) Aurora Flow');
    expect(formatAlertTitle(150, 'Aurora Flow')).toBe('(99+) Aurora Flow');
  });
});
