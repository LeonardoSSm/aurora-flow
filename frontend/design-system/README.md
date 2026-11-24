# @tijucas/ui

O visual do Tijuca Flow empacotado para outros sistemas: **React**, **Next.js** ou **HTML/JS puro**
(Node com EJS, Handlebars, Express…). Exemplos ao vivo na vitrine do Tijuca Flow: `/design-system`.

| O que | Arquivo | Para quê |
|---|---|---|
| Variáveis CSS | `@tijucas/ui/tokens.css` | Cores da marca, superfícies, bordas e textos — claro em `:root`, escuro em `.dark` |
| Tema Tailwind v4 | `@tijucas/ui/theme.css` | As mesmas classes do Tijuca Flow (`bg-surface`, `text-tx-primary`, `bg-primary/30`…) |
| Preset Tailwind v3 | `@tijucas/ui/tailwind-preset` | Idem, para projetos em Tailwind 3 |
| Componentes | `@tijucas/ui` | `Button`, `Card`, `FieldLabel`, `TextInput`, `SelectInput`, `SectionHeader`, `ToastProvider`/`useToast`, `PasswordStrengthBar`, `ProductLogo`/`ProductMark`/`ProductWordmark`, `cn` |
| Valores em JS | `@tijucas/ui/tokens` | `brandColors`, `themeTokens`, `fonts`, `tailwindTheme` — seguro em Server Components |
| Valores em JSON | `@tijucas/ui/tokens.json` | Para o que não é web (app mobile, PDF, e-mail) |
| Componentes em CSS puro | `@tijucas/ui/components.css` | Classes `tj-btn`, `tj-card`, `tj-input`… para quem não usa React |
| JS puro | `@tijucas/ui/vanilla` | `showToast`, `setTheme`/`toggleTheme`, `productLogoHtml` — também como `<script>` (`dist/vanilla.global.js`) |
| Fontes | `@tijucas/ui/fonts.css` | Inter e Manrope pelo Google Fonts (no Next.js prefira `next/font`) |

Os componentes React dependem do Tailwind, que gera as classes usadas por eles. Por isso o projeto
que os usa precisa ter Tailwind e varrer o `dist` do pacote (passos abaixo). Sem React, use
`components.css` (seção HTML/JS puro), que não precisa de Tailwind.

## Instalar

```bash
npm install @tijucas/ui
```

Para pegar uma versão nova depois: `npm update @tijucas/ui`.

Peer dependency: `react >= 18` (testado com React 18 no Tijuca Flow e React 19 no Next.js 15).

## Next.js (App Router) com Tailwind v4

`app/globals.css`:

```css
@import 'tailwindcss';
@import '@tijucas/ui/tokens.css';
@import '@tijucas/ui/theme.css';
@source '../node_modules/@tijucas/ui/dist';

body {
  background: var(--bg-base);
  color: var(--text-primary);
  font-family: var(--font-body);
}
```

`app/layout.tsx`:

```tsx
import { ToastProvider } from '@tijucas/ui';
import './globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
```

- Os componentes já vêm marcados com `"use client"`: dá para usá-los direto numa página
  Server Component. `useToast` só funciona dentro de um componente seu com `'use client'`.
- Valores (`brandColors` etc.) num Server Component: importe de `@tijucas/ui/tokens`, não de
  `@tijucas/ui`. Do pacote principal eles chegariam como referência de client, sem valor.
- Tema escuro: coloque a classe `dark` no `<html>` (o `theme.css` já liga `dark:` a ela).

## React + Vite (ou Next.js) com Tailwind v3

`tailwind.config.cjs`:

```js
module.exports = {
  presets: [require('@tijucas/ui/tailwind-preset')],
  content: ['./index.html', './src/**/*.{ts,tsx}', './node_modules/@tijucas/ui/dist/**/*.js'],
};
```

CSS principal:

```css
@import '@tijucas/ui/fonts.css';
@import '@tijucas/ui/tokens.css';
@tailwind base;
@tailwind components;
@tailwind utilities;
```

O preset já define `darkMode: 'class'`.

## Usar

```tsx
import { Button, Card, FieldLabel, TextInput, ProductLogo } from '@tijucas/ui';

<div className="rounded-xl bg-brand-primary px-4 py-3 text-white">
  <ProductLogo />                                {/* ou prefix="tijuca" accent="compras" */}
</div>
<Card className="grid gap-4">
  <FieldLabel>
    Nome
    <TextInput placeholder="Digite aqui" />
  </FieldLabel>
  <Button>Salvar</Button>
  <Button variant="ghost">Cancelar</Button>
</Card>
```

Sem Tailwind, ainda dá para usar só as variáveis: importe `tokens.css` e escreva
`background: var(--bg-surface)`, `color: rgb(var(--color-primary-ch) / 0.3)` etc.

## HTML/JS puro (sem React, sem Tailwind)

Sem instalar nada, pelo CDN (troque a versão quando sair outra):

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tijucas/ui@0.2.0/css/fonts.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tijucas/ui@0.2.0/css/tokens.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tijucas/ui@0.2.0/css/components.css">
<script src="https://cdn.jsdelivr.net/npm/@tijucas/ui@0.2.0/dist/vanilla.global.js"></script>
```

Ou com `npm install @tijucas/ui`, servindo os arquivos do pacote (Express):

```js
const path = require(path);
const uiDir = path.dirname(require.resolve(@tijucas/ui/package.json));
app.use(/ui, express.static(uiDir)); // /ui/css/tokens.css, /ui/css/components.css, /ui/dist/vanilla.global.js
```

Na página:

```html
<body class="tj-page">
  <header class="tj-page-header">
    <div class="tj-page-header__text">
      <h1 class="tj-page-header__title">Pedidos</h1>
      <p class="tj-page-header__description">Acompanhe os pedidos do dia</p>
    </div>
    <button class="tj-btn" type="button">Novo pedido</button>
  </header>

  <div class="tj-card">
    <label class="tj-field">
      Cliente
      <input class="tj-input" placeholder="Nome do cliente">
    </label>
    <button class="tj-btn" type="submit">Salvar</button>
    <button class="tj-btn tj-btn--ghost" type="button">Cancelar</button>
  </div>

  <script>
    TijucasUI.showToast({ title: 'Pedido salvo', variant: 'success' });
    TijucasUI.setTheme(TijucasUI.getTheme()); // aplica o tema salvo ou o do sistema
  </script>
</body>
```

| Classe | Equivale a |
|---|---|
| `tj-btn` (+ `tj-btn--ghost`, `tj-btn--subtle`, `tj-btn--sm`, `tj-btn--block`) | `<Button variant size fullWidth>` |
| `tj-card` | `<Card>` |
| `tj-field` + `tj-input` / `tj-select` | `<FieldLabel>` + `<TextInput>` / `<SelectInput>` |
| `tj-page-header` (`__text`, `__title`, `__description`) | `<SectionHeader>` |
| `TijucasUI.showToast({...})` | `useToast().showToast({...})` |
| `TijucasUI.productLogoHtml({ accent: 'compras' })` | `<ProductLogo accent="compras" />` |

Em Node (templates no servidor): `const { productLogoHtml } = require('@tijucas/ui/vanilla')` devolve o HTML
do logo para pôr no EJS/Handlebars. Cores em código: `require('@tijucas/ui/tokens').brandColors`.

## Mudar o visual

Tudo sai de **`src/tokens.ts`**. Depois de editar:

```bash
cd frontend/design-system
npm run tokens      # regenera css/tokens.css, css/theme.css, tailwind-preset.cjs e tokens.json
```

Commite os arquivos gerados: o Tijuca Flow os importa direto, sem build do pacote. Um teste do
frontend (`src/styles/design-system-tokens.test.ts`) falha no CI se eles ficarem para trás.

Componentes: evolua em `src/components/` **e** a classe equivalente em `css/components.css`. O Tijuca Flow reexporta de lá em
`frontend/src/components/ui/`, então a mudança vale nos dois lugares.

Requer Node 22.18+ para o `npm run tokens` (o gerador é TypeScript rodando direto no Node).

## Publicar uma versão (npm público)

Primeira vez, uma conta só:

1. Crie uma conta em npmjs.com e, nela, a organização **`tijucas`** (plano gratuito, pacotes
   públicos). É ela que dá o `@tijucas/` do nome.
2. `npm login` nesta máquina.

A cada versão:

1. Suba a versão: `npm version patch --no-git-tag-version` (ajuste), `minor` (componente/token
   novo) ou `major` (algo removido ou renomeado). O `--no-git-tag-version` evita tags `v0.x` no
   repositório do Tijuca Flow inteiro.
2. Commite as mudanças do pacote junto com a versão nova. O `npm publish` recusa se houver algo
   não commitado em `frontend/design-system/`, para cada versão publicada ter um commit no git.
3. `npm publish`: roda o build e envia a versão. Ela entra numa fila de aprovação ("staged
   publishing"); até lá o npm mostra só um marcador `0.0.0-stage`.
4. Aprove em npmjs.com → pacote `@tijucas/ui` → aba **Staged Packages** → **Approve** (pede o
   2FA). Com npm 11.15+ dá pelo terminal: `npm stage list` e `npm stage approve <id>`.
5. Confira: `npm view @tijucas/ui version` mostra a versão nova.

Para conferir o que vai no pacote sem publicar: `npm publish --dry-run`.

O código publicado fica visível para qualquer pessoa. Coloque aqui só visual: nada de regra de
negócio, URL interna ou credencial. Uma versão publicada não pode ser trocada; se sair errada,
publique outra por cima.

Licença `UNLICENSED`: o código é público para instalar, mas os direitos continuam da Tijuca
Alimentos.

## Não faz parte (ainda)

- Classes próprias do Tijuca Flow: `.card`, `.input-base`, os tokens `--nc-*` do modal de Fluxos,
  o canvas do React Flow e as cores `tertiary`/`error` herdadas. Continuam em `frontend/src/styles/global.css`
  e `frontend/tailwind.config.cjs`.
- Logos da empresa em imagem (`frontend/public/brand/`). A marca do produto vai como SVG (`ProductMark`).
