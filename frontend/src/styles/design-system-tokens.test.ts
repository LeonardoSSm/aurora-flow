import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  renderTailwindPreset,
  renderThemeCss,
  renderTokensCss,
  renderTokensJson,
} from '../../design-system/scripts/render';

// Os arquivos do pacote @tijucas/ui são gerados de design-system/src/tokens.ts e commitados (o
// Tijuca Flow os importa sem build). Se este teste falhar: `cd design-system && npm run tokens`.
const read = (path: string) =>
  readFileSync(resolve(process.cwd(), 'design-system', path), 'utf8').replace(/\r\n/g, '\n');

describe('design-system: arquivos gerados em dia com src/tokens.ts', () => {
  it.each([
    ['css/tokens.css', renderTokensCss],
    ['css/theme.css', renderThemeCss],
    ['tailwind-preset.cjs', renderTailwindPreset],
    ['tokens.json', renderTokensJson],
  ])('%s', (path, render) => {
    expect(read(path)).toBe(render());
  });
});
