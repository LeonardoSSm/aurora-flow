import { vi } from 'vitest';

type CameraEnvironment = {
  /** Simula tela de toque (`pointer: coarse`), onde a câmera abre pelo app nativo. */
  touch?: boolean;
  /** Simula `navigator.mediaDevices.getUserMedia` (webcam no computador). */
  getUserMedia?: () => Promise<MediaStream>;
};

/** O jsdom não tem matchMedia nem mediaDevices; devolve a função que restaura o estado original. */
export function mockCameraEnvironment({ touch = false, getUserMedia }: CameraEnvironment = {}): () => void {
  const originalMatchMedia = window.matchMedia;
  const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');

  window.matchMedia = vi.fn((query: string) => ({
    matches: touch && query === '(pointer: coarse)',
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;

  Object.defineProperty(navigator, 'mediaDevices', {
    value: getUserMedia ? { getUserMedia } : undefined,
    configurable: true,
  });

  return () => {
    window.matchMedia = originalMatchMedia;
    if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
    else delete (navigator as { mediaDevices?: unknown }).mediaDevices;
  };
}

/** Câmera falsa: devolve o stream e a função `stop` da trilha, para checar que a câmera é desligada. */
export function makeFakeStream(): { stream: MediaStream; stop: ReturnType<typeof vi.fn> } {
  const stop = vi.fn();
  const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
  return { stream, stop };
}
