import { ClipboardList } from 'lucide-react';
import { useState } from 'react';

/** Uma opção por linha; linhas vazias e repetidas (inclusive as que já existem) ficam de fora. */
export function parsePastedOptions(text: string, existingLabels: readonly string[] = []): string[] {
  const seen = new Set(existingLabels.map((label) => label.trim().toLowerCase()));
  const labels: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const label = raw
      .trim()
      .replace(/^(?:[-•*]|\d+[.)])\s+/, '')
      .trim();
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }
  return labels;
}

/**
 * "Colar lista": cola várias opções de uma vez (uma por linha), em vez de clicar em "Adicionar"
 * uma a uma. Marcadores comuns de lista ("- ", "• ", "1. ") são removidos.
 */
export function PasteOptions({
  existingLabels,
  onAdd,
  noun = 'opções',
}: {
  existingLabels: readonly string[];
  onAdd: (labels: string[]) => void;
  noun?: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const labels = parsePastedOptions(text, existingLabels);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex w-fit items-center gap-1.5 text-xs font-bold text-primary"
      >
        <ClipboardList className="h-3.5 w-3.5" />
        Colar lista
      </button>
    );
  }

  return (
    <div className="grid gap-2 rounded-[8px] border border-border-strong bg-bg-surface p-3">
      <label className="grid gap-1 text-xs font-semibold text-tx-secondary">
        Cole as {noun}, uma por linha
        <textarea
          autoFocus
          rows={5}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={'Opção A\nOpção B\nOpção C'}
          className="rounded-[8px] border border-border-strong bg-bg-surface px-3 py-2 text-sm font-normal text-tx-primary outline-none focus:border-primary"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={labels.length === 0}
          onClick={() => {
            onAdd(labels);
            setText('');
            setOpen(false);
          }}
          className="h-8 rounded-[8px] bg-primary px-3 text-xs font-bold text-white disabled:opacity-40"
        >
          {labels.length > 0 ? `Adicionar ${labels.length}` : 'Adicionar'}
        </button>
        <button
          type="button"
          onClick={() => {
            setText('');
            setOpen(false);
          }}
          className="text-xs font-bold text-tx-secondary"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
