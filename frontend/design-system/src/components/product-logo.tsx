import { cn } from '../cn';

/**
 * Marca do produto — "arvore-fluxo": a arvore dentro do anel da Tijuca
 * Alimentos redesenhada como grafo (galhos = ramificacoes, pontas = nos do
 * processo). Os tracos usam `currentColor`, entao a marca herda a cor do
 * container (branco na sidebar, primary em fundo claro); os nos e o arco de
 * base usam --color-secondary (definida em css/tokens.css).
 *
 * Sem `label` o SVG e decorativo (aria-hidden) — use assim quando o wordmark
 * ao lado ja anuncia o nome do produto.
 */
export function ProductMark({ className, label }: { className?: string; label?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      className={cn('h-10 w-10 shrink-0', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle cx="32" cy="32" r="26" stroke="currentColor" strokeWidth="3" opacity="0.9" />
      <path d="M32 51V21" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M32 37 21.5 26.5" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M32 31 42.5 20.5" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
      <path
        d="M14 45.5c6 5 11.5 7 18 7s12-2 18-7"
        stroke="var(--color-secondary)"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <circle cx="32" cy="19.5" r="3.6" fill="var(--color-secondary)" />
      <circle cx="20.6" cy="25.6" r="3.6" fill="var(--color-secondary)" />
      <circle cx="43.4" cy="19.6" r="3.6" fill="var(--color-secondary)" />
    </svg>
  );
}

export type WordmarkProps = {
  className?: string;
  /** Parte leve, herda a cor do container. */
  prefix?: string;
  /** Parte em destaque, na cor secundaria da marca. */
  accent?: string;
};

/** Wordmark do produto: prefixo leve herdando a cor do container + acento na cor secundaria. */
export function ProductWordmark({ className, prefix = 'tijuca', accent = 'flow' }: WordmarkProps) {
  return (
    <span
      className={cn(
        'whitespace-nowrap font-body text-[19px] leading-none tracking-[-0.01em]',
        className,
      )}
    >
      <span className="font-light opacity-90">{prefix}</span>
      <span className="font-extrabold text-brand-secondary">{accent}</span>
    </span>
  );
}

/** Lockup horizontal (marca + wordmark) — usado na sidebar aberta. */
export function ProductLogo({
  className,
  markClassName,
  wordmarkClassName,
  prefix,
  accent,
}: {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  prefix?: string;
  accent?: string;
}) {
  return (
    <span className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <ProductMark className={markClassName} />
      <ProductWordmark className={wordmarkClassName} prefix={prefix} accent={accent} />
    </span>
  );
}
