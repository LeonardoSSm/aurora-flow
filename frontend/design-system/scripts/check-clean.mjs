// Antes do `npm publish`: só publica o que está commitado, para cada versão no npm ter um
// commit correspondente no git. (O build roda logo depois, no `prepack`.)
import { execFileSync } from 'node:child_process';

const dirty = execFileSync('git', ['status', '--porcelain', '--', '.'], { encoding: 'utf8' }).trim();

if (dirty) {
  console.error('Há mudanças não commitadas em frontend/design-system:\n' + dirty);
  console.error('\nCommite antes de publicar.');
  process.exit(1);
}
