import { useSyncExternalStore } from 'react';

/**
 * Modo de uso escolhido logo depois de entrar:
 * - `simple`: tela única com o botão "Criar processo" (para quem é bem leigo);
 * - `advanced`: o sistema completo, com menu lateral.
 * `null` = ainda não escolheu nesta entrada; o AppShell mostra a escolha.
 *
 * Fica no localStorage para sobreviver a recargas, e é apagado no login e no
 * logout — assim cada entrada no sistema pergunta de novo, a não ser que a pessoa
 * tenha marcado "lembrar minha escolha" (guardado por usuário, neste navegador).
 */
export type ExperienceMode = 'simple' | 'advanced';

const STORAGE_KEY = 'tf.experienceMode';
/** Por usuário: o mesmo computador ou tablet pode ser usado por várias pessoas. */
const REMEMBERED_KEY_PREFIX = 'tf.experienceMode.remembered.';
const listeners = new Set<() => void>();

function parseMode(value: string | null): ExperienceMode | null {
  return value === 'simple' || value === 'advanced' ? value : null;
}

function readStorage(key: string): ExperienceMode | null {
  try {
    return parseMode(window.localStorage.getItem(key));
  } catch {
    return null;
  }
}

function writeStorage(key: string, mode: ExperienceMode | null) {
  try {
    if (mode) {
      window.localStorage.setItem(key, mode);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // ignora: o estado em memória continua valendo
  }
}

function notify() {
  listeners.forEach((listener) => listener());
}

// localStorage pode lançar (modo privado, storage bloqueado): nesse caso a
// escolha vale só até recarregar a página.
let currentMode: ExperienceMode | null = typeof window === 'undefined' ? null : readStorage(STORAGE_KEY);
const rememberedModes = new Map<string, ExperienceMode | null>();

export function setExperienceMode(mode: ExperienceMode | null) {
  currentMode = mode;
  writeStorage(STORAGE_KEY, mode);
  notify();
}

/** Login e logout: a próxima entrada volta a perguntar o modo (ou usa o lembrado). */
export function clearExperienceMode() {
  setExperienceMode(null);
}

function getRememberedMode(userId: string): ExperienceMode | null {
  if (!rememberedModes.has(userId)) {
    rememberedModes.set(userId, readStorage(REMEMBERED_KEY_PREFIX + userId));
  }
  return rememberedModes.get(userId) ?? null;
}

/** "Lembrar minha escolha": as próximas entradas desse usuário abrem direto nesse modo. `null` volta a perguntar. */
export function rememberExperienceMode(userId: string, mode: ExperienceMode | null) {
  rememberedModes.set(userId, mode);
  writeStorage(REMEMBERED_KEY_PREFIX + userId, mode);
  notify();
}

/**
 * Troca de modo pelos botões da tela. Quem pediu para lembrar passa a entrar no modo
 * para o qual trocou — é o jeito de mudar a escolha sem voltar à tela de escolha.
 */
export function switchExperienceMode(userId: string | undefined, mode: ExperienceMode) {
  if (userId && getRememberedMode(userId)) {
    rememberExperienceMode(userId, mode);
  }
  setExperienceMode(mode);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useExperienceMode(): ExperienceMode | null {
  return useSyncExternalStore(
    subscribe,
    () => currentMode,
    () => null,
  );
}

export function useRememberedMode(userId: string | undefined): ExperienceMode | null {
  return useSyncExternalStore(
    subscribe,
    () => (userId ? getRememberedMode(userId) : null),
    () => null,
  );
}
