import type { ReactNode } from 'react';
import { cn } from '../../../../design-system/src';
import { useStack } from '../stack';
import { CodeBlock } from './code-block';

export type ExampleCode = {
  /** React (Vite). Também vale para Next.js quando `next` não é dado. */
  react: string;
  next?: string;
  /** HTML com as classes de components.css. Sem ele, o exemplo é marcado como só React. */
  html?: string;
};

type ExampleProps = {
  title: string;
  description?: string;
  /** O componente React funcionando. */
  children: ReactNode;
  code: ExampleCode;
  /**
   * O que aparece no modo HTML/JS puro. Padrão: o próprio `code.html` renderizado — texto fixo
   * desta página, nunca entrada de usuário. Use um ReactNode quando o exemplo precisa de clique.
   */
  htmlPreview?: ReactNode;
  previewClassName?: string;
};

/** Um exemplo da vitrine: o componente funcionando em cima, o código do tipo de sistema escolhido embaixo. */
export function Example({ title, description, children, code, htmlPreview, previewClassName }: ExampleProps) {
  const { stack } = useStack();
  const isHtml = stack === 'html';
  const snippet = isHtml ? code.html : stack === 'next' ? (code.next ?? code.react) : code.react;

  let preview: ReactNode = children;
  if (isHtml) {
    preview =
      htmlPreview ??
      (code.html ? <div className="contents" dangerouslySetInnerHTML={{ __html: code.html }} /> : null);
  }

  return (
    <article className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <div className="grid gap-1">
        <h3 className="text-base font-bold">{title}</h3>
        {description ? <p className="text-sm">{description}</p> : null}
      </div>
      {snippet ? (
        <div className="overflow-hidden rounded-2xl border border-border-default">
          <div className={cn('flex flex-wrap items-center gap-3 bg-bg-surface p-6', previewClassName)}>
            {preview}
          </div>
          <CodeBlock code={snippet} className="[&_pre]:rounded-none" />
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-border-strong px-4 py-3 text-sm">
          Só para React/Next.js por enquanto — em HTML/JS puro ainda não há equivalente pronto.
        </p>
      )}
    </article>
  );
}

/** Seção da vitrine, com âncora para o menu lateral. */
export function ShowcaseSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="grid scroll-mt-32 grid-cols-[minmax(0,1fr)] gap-6">
      <div className="grid gap-2">
        <h2 className="font-headline text-2xl font-extrabold tracking-tight">{title}</h2>
        <p className="max-w-3xl">{description}</p>
      </div>
      {children}
    </section>
  );
}
