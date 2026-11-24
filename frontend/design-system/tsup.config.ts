import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    // Next.js (App Router): os componentes usam estado/efeitos (ToastProvider), então esta entrada
    // inteira é Client Component. Server Components podem renderizar os componentes normalmente.
    banner: { js: '"use client";' },
    external: ['react', 'react/jsx-runtime'],
  },
  {
    // Só dados, sem "use client": num Server Component, valores vindos de um módulo client
    // chegam como referências e não como os objetos em si.
    entry: ['src/tokens.ts'],
    format: ['esm', 'cjs'],
    dts: true,
  },
  {
    // Sistemas sem React: import/require, ou <script src=".../dist/vanilla.global.js"> (window.TijucasUI).
    entry: ['src/vanilla.ts'],
    format: ['esm', 'cjs', 'iife'],
    globalName: 'TijucasUI',
    dts: true,
  },
]);
