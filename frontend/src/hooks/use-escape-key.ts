import { useEffect, useRef } from 'react';

/**
 * Esc fecha o modal de cima. Modais empilhados (ex.: confirmacao aberta sobre o
 * editor de perfil, ambos sobre o modal de Administracao) se registram numa
 * pilha e so o ultimo aberto reage, em vez de todos fecharem de uma vez.
 */
const stack: Array<{ current: () => void }> = [];

function onKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || stack.length === 0) return;
  event.preventDefault();
  stack[stack.length - 1].current();
}

export function useEscapeKey(handler: () => void, enabled = true) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const entry = { current: () => handlerRef.current() };
    if (stack.length === 0) window.addEventListener('keydown', onKeyDown);
    stack.push(entry);
    return () => {
      const index = stack.indexOf(entry);
      if (index >= 0) stack.splice(index, 1);
      if (stack.length === 0) window.removeEventListener('keydown', onKeyDown);
    };
  }, [enabled]);
}
