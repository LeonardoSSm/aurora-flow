import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { cn } from '../../../design-system/src';

/** Em qual tipo de sistema a pessoa vai usar o pacote — muda as instruções e o código da vitrine. */
export type Stack = 'react' | 'next' | 'html';

export const STACKS: Array<{ id: Stack; label: string }> = [
  { id: 'react', label: 'React' },
  { id: 'next', label: 'Next.js' },
  { id: 'html', label: 'HTML/JS puro' },
];

const STORAGE_KEY = 'ds-stack';

function isStack(value: string | null): value is Stack {
  return value === 'react' || value === 'next' || value === 'html';
}

/** Ordem: ?stack= na URL (link compartilhado), depois a última escolha, senão React. */
function initialStack(): Stack {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('stack');
    if (isStack(fromUrl)) return fromUrl;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isStack(stored)) return stored;
  } catch {
    // sem URL/armazenamento disponíveis: padrão
  }
  return 'react';
}

type StackContextValue = { stack: Stack; setStack: (stack: Stack) => void };

const StackContext = createContext<StackContextValue>({ stack: 'react', setStack: () => undefined });

export function StackProvider({ children }: { children: ReactNode }) {
  const [stack, setStackState] = useState<Stack>(initialStack);

  const setStack = useCallback((next: Stack) => {
    setStackState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
      const url = new URL(window.location.href);
      url.searchParams.set('stack', next);
      window.history.replaceState(window.history.state, '', url);
    } catch {
      // a escolha vale só nesta visita
    }
  }, []);

  return <StackContext.Provider value={{ stack, setStack }}>{children}</StackContext.Provider>;
}

export function useStack() {
  return useContext(StackContext);
}

/** Menu do topo: React · Next.js · HTML/JS puro. */
export function StackPicker({ className }: { className?: string }) {
  const { stack, setStack } = useStack();

  return (
    <div
      role="radiogroup"
      aria-label="Tipo de sistema"
      className={cn('inline-flex rounded-xl bg-bg-s3 p-1 text-sm', className)}
    >
      {STACKS.map((item) => {
        const active = item.id === stack;
        return (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setStack(item.id)}
            className={cn(
              'whitespace-nowrap rounded-lg px-3 py-1.5 font-semibold transition-colors',
              active
                ? 'bg-bg-surface text-tx-primary shadow-sm'
                : 'text-tx-secondary hover:text-tx-primary',
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
