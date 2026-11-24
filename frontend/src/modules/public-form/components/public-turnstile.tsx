import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
          theme?: 'light' | 'dark' | 'auto';
        },
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

let turnstileScriptPromise: Promise<void> | null = null;

function loadTurnstileScript() {
  if (window.turnstile) {
    return Promise.resolve();
  }

  if (turnstileScriptPromise) {
    return turnstileScriptPromise;
  }

  turnstileScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-turnstile-script="true"]',
    );
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('Falha ao carregar o Turnstile.')),
        {
          once: true,
        },
      );
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.dataset.turnstileScript = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Falha ao carregar o Turnstile.'));
    document.head.appendChild(script);
  });

  return turnstileScriptPromise;
}

type PublicTurnstileProps = {
  siteKey: string;
  resetKey: number;
  onVerify: (token: string) => void;
  onExpire: () => void;
};

export function PublicTurnstile({ siteKey, resetKey, onVerify, onExpire }: PublicTurnstileProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    async function mountWidget() {
      if (!containerRef.current) {
        return;
      }

      try {
        await loadTurnstileScript();
        if (disposed || !containerRef.current || !window.turnstile) {
          return;
        }

        if (widgetIdRef.current) {
          window.turnstile.remove(widgetIdRef.current);
          widgetIdRef.current = null;
        }

        containerRef.current.innerHTML = '';
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: onVerify,
          'expired-callback': onExpire,
          'error-callback': onExpire,
          theme: 'light',
        });
        setLoadError(null);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Falha ao carregar o CAPTCHA.');
      }
    }

    mountWidget();

    return () => {
      disposed = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [onExpire, onVerify, resetKey, siteKey]);

  return (
    <div className="grid gap-2">
      <div ref={containerRef} />
      {loadError ? <span className="text-xs font-semibold text-error">{loadError}</span> : null}
    </div>
  );
}
