import { GripVertical, Pencil, Trash2 } from 'lucide-react';
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import type { WidgetFormatoGrafico, WidgetResultado } from '../types';
import { WidgetChart } from './widget-chart';

type WidgetCardProps = {
  title: string;
  resultado: WidgetResultado | null;
  erro?: string | null;
  /** Ausente = usa o padrão do tipo do resultado (ver `WidgetChart`). */
  formatoGrafico?: WidgetFormatoGrafico;
  /** Nome de cada métrica na legenda — só aparece quando há uma segunda métrica. */
  tituloSerie1?: string;
  tituloSerie2?: string;
  /** Lado a lado (padrão) ou empilhado — só com duas métricas em barra/área. */
  empilhado?: boolean;
  /** Sem estes callbacks o card fica só de leitura. */
  onEditar?: () => void;
  onRemover?: () => void;
  /**
   * Falso fora da grade (pilha do celular, sem react-grid-layout por perto):
   * a alça de arrastar não teria efeito nenhum ali, então nem aparece.
   */
  arrastavel?: boolean;
  /**
   * Injetados pelo react-grid-layout via `cloneElement` — a grade precisa de um
   * elemento de verdade para medir, posicionar e arrastar. Sem `forwardRef`
   * aqui o React descarta a ref e a grade não sabe onde o bloco está.
   *
   * `children` é o mais fácil de esquecer: é assim que o `react-resizable`
   * injeta o próprio span da alça de redimensionar. E `...resto` (que cai no
   * spread abaixo) é o mais fácil de esquecer *silenciosamente*: é assim que o
   * `react-draggable` injeta `onMouseDown`/`onMouseUp`/`onTouchEnd` para
   * arrastar — sem eles o clique na alça de mover não faz nada, sem nenhum
   * erro no console para apontar o motivo.
   */
  className?: string;
  style?: React.CSSProperties;
  children?: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'children' | 'className' | 'style'>;

/**
 * Um bloco do painel.
 *
 * Arrastável pela alça e redimensionável pelo canto quando editável — a grade
 * em si (posição, tamanho, o handle de resize no canto) é toda do
 * react-grid-layout; este componente só desenha o conteúdo.
 */
export const WidgetCard = forwardRef<HTMLDivElement, WidgetCardProps>(function WidgetCard(
  {
    title,
    resultado,
    erro,
    formatoGrafico,
    tituloSerie1,
    tituloSerie2,
    empilhado,
    onEditar,
    onRemover,
    arrastavel = true,
    className,
    style,
    children,
    ...resto
  },
  ref,
) {
  const editavel = Boolean(onEditar);

  return (
    <div
      ref={ref}
      style={style}
      className={[
        'grid min-w-0 grid-rows-[auto_1fr] gap-3 overflow-hidden rounded-[12px] border border-border-default bg-bg-surface p-4 shadow-sm',
        className ?? '',
      ].join(' ')}
      {...resto}
    >
      <div className="flex min-w-0 items-start gap-2">
        {editavel && arrastavel ? (
          <span
            aria-label={`Mover ${title}`}
            className="widget-drag-handle mt-0.5 grid h-6 w-6 shrink-0 cursor-grab place-items-center rounded text-tx-ph active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </span>
        ) : null}

        <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-tx-primary" title={title}>
          {title}
        </h3>

        {editavel ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              aria-label={`Editar ${title}`}
              onClick={onEditar}
              className="grid h-7 w-7 place-items-center rounded text-tx-secondary hover:bg-bg-hover"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label={`Remover ${title}`}
              onClick={onRemover}
              className="grid h-7 w-7 place-items-center rounded text-tx-secondary hover:bg-[#fff1f1] hover:text-error"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
      </div>

      <WidgetChart
        resultado={resultado}
        erro={erro}
        formatoGrafico={formatoGrafico}
        tituloSerie1={tituloSerie1}
        tituloSerie2={tituloSerie2}
        empilhado={empilhado}
      />
      {children}
    </div>
  );
});
