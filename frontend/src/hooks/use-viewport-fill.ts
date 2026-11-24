import { useLayoutEffect, useRef, useState } from 'react';

/** Respiro inferior do <main> no desktop (md:py-6). */
const MAIN_BOTTOM_PADDING = 24;

/**
 * No desktop a página ocupa exatamente o que sobra da janela — nada de rolar; as listas mostram o
 * que cabe e apontam para o resto. Abaixo de `minWidth` (`height` null) a página rola normalmente.
 */
export function useViewportFill<T extends HTMLElement = HTMLElement>({ minHeight = 360, minWidth = 768 } = {}) {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const element = ref.current;
      const isDesktop = typeof window.matchMedia === 'function' && window.matchMedia(`(min-width: ${minWidth}px)`).matches;
      if (!element || !isDesktop) {
        setHeight(null);
        return;
      }
      const top = element.getBoundingClientRect().top + window.scrollY;
      setHeight(Math.max(window.innerHeight - top - MAIN_BOTTOM_PADDING, minHeight));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [minHeight, minWidth]);

  return { ref, height };
}
