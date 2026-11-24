import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../../../design-system/src';

/** Trecho de código da vitrine, com botão de copiar. */
export function CodeBlock({ code, className }: { code: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Sem permissão de área de transferência (http, iframe): o texto continua selecionável.
    }
  };

  return (
    <div className={cn('relative', className)}>
      <pre className="overflow-x-auto rounded-xl bg-[#0d1d29] p-4 pr-12 text-[13px] leading-relaxed text-slate-100">
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Copiado' : 'Copiar código'}
        className="absolute right-2 top-2 rounded-lg p-2 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}
