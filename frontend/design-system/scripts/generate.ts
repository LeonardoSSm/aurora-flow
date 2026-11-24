// Grava os arquivos derivados de src/tokens.ts. Roda com `node scripts/generate.ts` (Node 22.18+).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  renderTailwindPreset,
  renderThemeCss,
  renderTokensCss,
  renderTokensJson,
} from './render.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const outputs: Record<string, string> = {
  'css/tokens.css': renderTokensCss(),
  'css/theme.css': renderThemeCss(),
  'tailwind-preset.cjs': renderTailwindPreset(),
  'tokens.json': renderTokensJson(),
};

for (const [path, content] of Object.entries(outputs)) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  console.log(`gerado ${path}`);
}
