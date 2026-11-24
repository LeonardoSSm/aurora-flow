import { describe, expect, it } from 'vitest';
import { matchRoutes } from 'react-router-dom';
import { router } from './router';

describe('router', () => {
  it('"/" casa uma rota filha do RequireAuth (não só o pai, que deixaria a tela branca)', () => {
    const matches = matchRoutes(router.routes, '/') ?? [];
    expect(matches.map((m) => m.route.path)).toEqual(['/', undefined]);
    expect(matches.at(-1)?.route.index).toBe(true);
  });

  it('páginas do app continuam indo para o AppShell', () => {
    const matches = matchRoutes(router.routes, '/inicio') ?? [];
    expect(matches.map((m) => m.route.path)).toEqual(['/', '*']);
  });
});
