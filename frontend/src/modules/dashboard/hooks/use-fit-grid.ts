import { useEffect, useState, type RefObject } from 'react';

type FitOptions = {
  /** Altura fixa de cada item, em px. */
  rowHeight: number;
  /** Espaço entre itens (linhas e colunas), em px. */
  gap: number;
  /** Largura mínima de uma coluna; sem ela, uma coluna só. */
  minColumnWidth?: number;
  /** Quantos itens mostrar quando o espaço não é medido (telas pequenas, onde a página rola). */
  fallback: number;
};

/**
 * Quantos itens de altura fixa cabem no contêiner sem rolar: mede a área disponível e recalcula a
 * cada mudança de tamanho. Contêiner sem altura medida (ex.: celular) usa `fallback`.
 */
export function useFitGrid(ref: RefObject<HTMLElement | null>, options: FitOptions) {
  const { rowHeight, gap, minColumnWidth, fallback } = options;
  const [fit, setFit] = useState({ columns: 1, capacity: fallback });

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const { height, width } = element.getBoundingClientRect();
      const columns = minColumnWidth
        ? Math.max(1, Math.floor((width + gap) / (minColumnWidth + gap)))
        : 1;
      const rows = height > 0 ? Math.max(1, Math.floor((height + gap) / (rowHeight + gap))) : 0;
      const capacity = rows > 0 ? rows * columns : fallback;
      setFit((prev) => (prev.columns === columns && prev.capacity === capacity ? prev : { columns, capacity }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, rowHeight, gap, minColumnWidth, fallback]);

  return fit;
}
