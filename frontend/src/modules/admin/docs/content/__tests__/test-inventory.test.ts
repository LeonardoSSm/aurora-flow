import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BACKEND_SUITE,
  FRONTEND_SUITE,
  INTEGRATION_SUITE,
  TEST_SUITES,
  countSuiteTests,
  type TestSuite,
} from '../qualidade';

/**
 * Mantém o artigo "Testes automatizados" honesto.
 *
 * Documentação que lista arquivos envelhece em silêncio: alguém renomeia um
 * spec, e a página passa a apontar para o nada sem que nada quebre. Aqui a
 * lista é confrontada com o disco nos dois sentidos — arquivo listado precisa
 * existir, arquivo existente precisa estar listado.
 */

const REPO_ROOT = resolve(__dirname, '../../../../../../..');
const BACKEND_SRC = join(REPO_ROOT, 'backend', 'src');
const BACKEND_ROOT = join(REPO_ROOT, 'backend');
const FRONTEND_SRC = join(REPO_ROOT, 'frontend', 'src');

function walk(dir: string, matches: (name: string) => boolean): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...walk(full, matches));
    } else if (matches(entry)) {
      found.push(full);
    }
  }
  return found;
}

function toPosix(value: string): string {
  return value.split('\\').join('/');
}

/** Arquivos declarados na suíte, na mesma forma dos caminhos varridos do disco. */
function declaredPaths(suite: TestSuite): string[] {
  return suite.groups.flatMap((group) => group.files.map((file) => file.path));
}

function foundPaths(root: string, matches: (name: string) => boolean): string[] {
  return walk(root, matches).map((full) => toPosix(relative(root, full)));
}

describe('inventário de testes da documentação', () => {
  it('o total do artigo bate com a soma de cada suíte', () => {
    const total = TEST_SUITES.reduce((sum, suite) => sum + countSuiteTests(suite), 0);
    expect(total).toBe(
      countSuiteTests(BACKEND_SUITE) +
        countSuiteTests(FRONTEND_SUITE) +
        countSuiteTests(INTEGRATION_SUITE),
    );
    expect(total).toBeGreaterThan(0);
  });

  it('nenhum arquivo aparece em dois grupos', () => {
    for (const suite of TEST_SUITES) {
      const paths = declaredPaths(suite);
      expect(new Set(paths).size, `${suite.id}: caminho repetido`).toBe(paths.length);
    }
  });

  it('todo arquivo tem contagem positiva e descrição', () => {
    for (const suite of TEST_SUITES) {
      for (const group of suite.groups) {
        expect(group.files.length, `${suite.id}/${group.id}: grupo vazio`).toBeGreaterThan(0);
        for (const file of group.files) {
          expect(file.tests, `${file.path}: contagem`).toBeGreaterThan(0);
          expect(file.covers.trim().length, `${file.path}: descrição`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('os specs do backend listados existem', () => {
    const noDisco = new Set(foundPaths(BACKEND_SRC, (name) => name.endsWith('.spec.ts')));
    for (const path of declaredPaths(BACKEND_SUITE)) {
      expect(noDisco.has(path), `ausente no disco: ${path}`).toBe(true);
    }
  });

  it('os testes do frontend listados existem', () => {
    const noDisco = new Set(
      foundPaths(FRONTEND_SRC, (name) => name.endsWith('.test.ts') || name.endsWith('.test.tsx')),
    );
    for (const path of declaredPaths(FRONTEND_SUITE)) {
      expect(noDisco.has(path), `ausente no disco: ${path}`).toBe(true);
    }
  });

  it('os testes de integração listados existem', () => {
    const noDisco = new Set(
      foundPaths(join(BACKEND_ROOT, 'test'), (name) => name.endsWith('.integration.spec.ts')).map(
        (path) => `test/${path}`,
      ),
    );
    for (const path of declaredPaths(INTEGRATION_SUITE)) {
      expect(noDisco.has(path), `ausente no disco: ${path}`).toBe(true);
    }
  });
});
