import { beforeEach, describe, expect, it, vi } from 'vitest';

// O store guarda estado no módulo: cada teste carrega uma cópia nova.
async function loadStore() {
  vi.resetModules();
  return import('./experience-mode-store');
}

describe('experience-mode-store', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('sem "lembrar", o login apaga o modo e a próxima entrada pergunta de novo', async () => {
    const store = await loadStore();
    store.setExperienceMode('simple');
    store.clearExperienceMode();

    expect(window.localStorage.getItem('tf.experienceMode')).toBeNull();
    expect(window.localStorage.getItem('tf.experienceMode.remembered.u1')).toBeNull();
  });

  it('o modo lembrado sobrevive ao logout e é por usuário', async () => {
    const store = await loadStore();
    store.rememberExperienceMode('u1', 'simple');
    store.setExperienceMode('simple');
    store.clearExperienceMode();

    expect(window.localStorage.getItem('tf.experienceMode.remembered.u1')).toBe('simple');
    expect(window.localStorage.getItem('tf.experienceMode.remembered.u2')).toBeNull();
  });

  it('trocar de modo atualiza o lembrado só de quem pediu para lembrar', async () => {
    const store = await loadStore();
    store.rememberExperienceMode('u1', 'simple');

    store.switchExperienceMode('u1', 'advanced');
    expect(window.localStorage.getItem('tf.experienceMode.remembered.u1')).toBe('advanced');

    store.switchExperienceMode('u2', 'simple');
    expect(window.localStorage.getItem('tf.experienceMode.remembered.u2')).toBeNull();
    expect(window.localStorage.getItem('tf.experienceMode')).toBe('simple');
  });
});
