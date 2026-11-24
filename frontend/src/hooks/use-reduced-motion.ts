import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Segue a preferencia de movimento do sistema operacional. Animacoes em CSS dao
 * conta disso sozinhas com uma media query; este hook existe para o que CSS nao
 * alcanca — animacoes SMIL dentro de SVG (<animateMotion>, <animate>), que
 * precisam simplesmente nao ser renderizadas.
 */
export function usePrefersReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(() => {
    // Sem matchMedia (jsdom nos testes): segue sem preferência de movimento reduzido.
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const media = window.matchMedia(QUERY);
    const onChange = (event: MediaQueryListEvent) => setPrefersReduced(event.matches);

    setPrefersReduced(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return prefersReduced;
}
