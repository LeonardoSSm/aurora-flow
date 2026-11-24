import { useState } from 'react';
import {
  Button,
  Card,
  FieldLabel,
  PasswordStrengthBar,
  ProductLogo,
  ProductMark,
  ProductWordmark,
  SectionHeader,
  SelectInput,
  TextInput,
  useToast,
} from '../../../../design-system/src';
import packageJson from '../../../../design-system/package.json';
import { brandColors, themeTokens } from '../../../../design-system/src/tokens';
import {
  productLogoHtml,
  productMarkSvg,
  showToast as showVanillaToast,
  type ShowToastInput,
} from '../../../../design-system/src/vanilla';
import { CodeBlock } from '../components/code-block';
import { Example, ShowcaseSection } from '../components/example';
import { useStack, type Stack } from '../stack';

const CDN = `https://cdn.jsdelivr.net/npm/@tijucas/ui@${packageJson.version}`;

type ThemeVar = keyof typeof themeTokens.dark;

/** Tokens que mudam com o tema: classe do Tailwind ↔ variável CSS. Os valores vêm de tokens.ts. */
const THEME_GROUPS: Array<{ title: string; items: Array<{ cls: string; token: ThemeVar; use: string }> }> = [
  {
    title: 'Superfícies',
    items: [
      { cls: 'bg-bg-base', token: 'bg-base', use: 'Fundo da página' },
      { cls: 'bg-bg-surface', token: 'bg-surface', use: 'Cards e painéis' },
      { cls: 'bg-bg-s2', token: 'bg-surface-2', use: 'Faixas e campos' },
      { cls: 'bg-bg-s3', token: 'bg-surface-3', use: 'Destaque leve' },
      { cls: 'bg-bg-hover', token: 'bg-surface-hover', use: 'Item sob o mouse' },
    ],
  },
  {
    title: 'Textos',
    items: [
      { cls: 'text-tx-primary', token: 'text-primary', use: 'Texto principal' },
      { cls: 'text-tx-secondary', token: 'text-secondary', use: 'Rótulos e apoio' },
      { cls: 'text-tx-muted', token: 'text-muted', use: 'Legendas e datas' },
      { cls: 'text-tx-ph', token: 'text-placeholder', use: 'Placeholder' },
    ],
  },
  {
    title: 'Bordas',
    items: [
      { cls: 'border-border-default', token: 'border-default', use: 'Borda padrão' },
      { cls: 'border-border-strong', token: 'border-strong', use: 'Borda de campos' },
      { cls: 'border-border-subtle', token: 'border-subtle', use: 'Divisórias' },
    ],
  },
];

const BRAND_SWATCHES: Array<{ cls: string; cssVar: string; hex: string; name: string; use: string }> = [
  { cls: 'bg-primary', cssVar: '--color-primary', hex: brandColors.primary, name: 'Primária', use: 'Botões, links, barra lateral' },
  { cls: 'bg-primary-container', cssVar: '--color-primary-dark', hex: brandColors.primaryDark, name: 'Primária escura', use: 'Hover de botões' },
  { cls: 'bg-brand-primary-light', cssVar: '--color-primary-light', hex: brandColors.primaryLight, name: 'Primária clara', use: 'Fundo azul suave' },
  { cls: 'bg-brand-secondary', cssVar: '--color-secondary', hex: brandColors.secondary, name: 'Secundária', use: 'Destaque (laranja)' },
  { cls: 'bg-brand-accent', cssVar: '--color-accent', hex: brandColors.accent, name: 'Acento', use: 'Verde da marca' },
];

const STATUS_SWATCHES: Array<{ cls: string; cssVar: string; hex: string; name: string }> = [
  { cls: 'bg-status-success', cssVar: '--color-success', hex: brandColors.success, name: 'Sucesso' },
  { cls: 'bg-status-warning', cssVar: '--color-warning', hex: brandColors.warning, name: 'Aviso' },
  { cls: 'bg-status-danger', cssVar: '--color-error', hex: brandColors.danger, name: 'Erro' },
  { cls: 'bg-status-info', cssVar: '--color-info', hex: themeTokens.light['color-info'], name: 'Informação' },
];

function Swatch({ cls, name, label, detail, use }: { cls: string; name: string; label: string; detail: string; use?: string }) {
  return (
    <div className="grid gap-2">
      <div className={`h-16 rounded-xl border border-border-subtle ${cls}`} />
      <div className="grid gap-0.5 text-sm">
        <strong className="text-tx-primary">{name}</strong>
        <code className="text-xs text-tx-secondary">{label}</code>
        <span className="text-xs text-tx-muted">{detail}</span>
        {use ? <span className="text-xs text-tx-muted">{use}</span> : null}
      </div>
    </div>
  );
}

function Step({ title, code }: { title: string; code: string }) {
  return (
    <>
      <h3 className="text-base font-bold">{title}</h3>
      <CodeBlock code={code} />
    </>
  );
}

const START_STEPS: Record<Stack, Array<{ title: string; code: string }>> = {
  react: [
    { title: '1. Instalar', code: 'npm install @tijucas/ui' },
    {
      title: '2. CSS principal (src/index.css) — Tailwind 4 com @tailwindcss/vite',
      code: `@import '@tijucas/ui/fonts.css'; /* antes de tudo: é um @import url() */
@import 'tailwindcss';
@import '@tijucas/ui/tokens.css';
@import '@tijucas/ui/theme.css';
@source '../node_modules/@tijucas/ui/dist';

body {
  background: var(--bg-base);
  color: var(--text-primary);
  font-family: var(--font-body);
}`,
    },
    {
      title: 'Ainda em Tailwind 3? Use o preset no tailwind.config.cjs',
      code: `module.exports = {
  presets: [require('@tijucas/ui/tailwind-preset')],
  content: ['./index.html', './src/**/*.{ts,tsx}', './node_modules/@tijucas/ui/dist/**/*.js'],
};

/* e no src/index.css: */
@import '@tijucas/ui/fonts.css';
@import '@tijucas/ui/tokens.css';
@tailwind base;
@tailwind components;
@tailwind utilities;`,
    },
    {
      title: '3. Provedor de toasts em src/main.tsx',
      code: `import { ToastProvider } from '@tijucas/ui';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ToastProvider>
    <App />
  </ToastProvider>,
);`,
    },
  ],
  next: [
    { title: '1. Instalar', code: 'npm install @tijucas/ui' },
    {
      title: '2. app/globals.css (Tailwind 4)',
      code: `@import 'tailwindcss';
@import '@tijucas/ui/tokens.css';
@import '@tijucas/ui/theme.css';
@source '../node_modules/@tijucas/ui/dist';

body {
  background: var(--bg-base);
  color: var(--text-primary);
  font-family: var(--font-body);
}`,
    },
    {
      title: '3. app/layout.tsx — provedor de toasts',
      code: `import { ToastProvider } from '@tijucas/ui';
import './globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}`,
    },
    {
      title: 'Bom saber',
      code: `// Os componentes já vêm como Client Components: use direto em páginas (Server Components).
// useToast() é hook: só em arquivos com 'use client' no topo.
// Cores num Server Component: import { brandColors } from '@tijucas/ui/tokens';
// Fontes: next/font/google (Inter e Manrope) ou @import '@tijucas/ui/fonts.css' no topo do CSS.`,
    },
  ],
  html: [
    {
      title: '1a. Sem instalar nada: pelo CDN, no <head>',
      code: `<link rel="stylesheet" href="${CDN}/css/fonts.css">
<link rel="stylesheet" href="${CDN}/css/tokens.css">
<link rel="stylesheet" href="${CDN}/css/components.css">
<script src="${CDN}/dist/vanilla.global.js"></script>`,
    },
    {
      title: '1b. Ou com npm, servindo os arquivos do pacote (Express)',
      code: `// npm install @tijucas/ui
const path = require('path');
const uiDir = path.dirname(require.resolve('@tijucas/ui/package.json'));
app.use('/ui', express.static(uiDir));

// no <head>:
// <link rel="stylesheet" href="/ui/css/tokens.css">
// <link rel="stylesheet" href="/ui/css/components.css">
// <script src="/ui/dist/vanilla.global.js"></script>`,
    },
    {
      title: '2. No <body>',
      code: `<body class="tj-page">
  ...
  <script>
    // aplica o tema salvo (ou o do sistema operacional)
    TijucasUI.setTheme(TijucasUI.getTheme());
  </script>
</body>`,
    },
    {
      title: 'Com bundler (Vite, webpack…) em vez de <script>',
      code: `import '@tijucas/ui/tokens.css';
import '@tijucas/ui/components.css';
import { showToast, setTheme } from '@tijucas/ui/vanilla';`,
    },
  ],
};

const START_DESCRIPTION: Record<Stack, string> = {
  react: 'Instale o pacote, ligue o tema no CSS e coloque o provedor de toasts. Depois é só usar os componentes.',
  next: 'Instale o pacote, ligue o tema no globals.css e coloque o provedor de toasts no layout raiz.',
  html: 'Sem React e sem Tailwind: três arquivos CSS e um script. As classes tj-* dão o mesmo visual dos componentes React.',
};

export function StartSection() {
  const { stack } = useStack();

  return (
    <ShowcaseSection id="comecar" title="Começar" description={START_DESCRIPTION[stack]}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        {START_STEPS[stack].map((step) => (
          <Step key={step.title} title={step.title} code={step.code} />
        ))}
      </div>
    </ShowcaseSection>
  );
}

export function ColorsSection() {
  const { stack } = useStack();
  const isHtml = stack === 'html';

  return (
    <ShowcaseSection
      id="cores"
      title="Cores"
      description={
        isHtml
          ? 'As cores da marca são fixas; superfícies, textos e bordas trocam sozinhas no tema escuro (use o botão no topo). Em HTML puro, use as variáveis CSS: var(--bg-surface), var(--text-primary)…'
          : 'As cores da marca são fixas; superfícies, textos e bordas trocam sozinhas no tema escuro (use o botão no topo). Toda cor vale com bg-, text-, border- e ring-, e as da marca aceitam opacidade (bg-primary/10).'
      }
    >
      <div className="grid gap-3">
        <h3 className="text-base font-bold">Marca</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {BRAND_SWATCHES.map((s) => (
            <Swatch key={s.cls} cls={s.cls} name={s.name} label={isHtml ? s.cssVar : s.cls} detail={s.hex} use={s.use} />
          ))}
        </div>
      </div>
      <div className="grid gap-3">
        <h3 className="text-base font-bold">Status</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {STATUS_SWATCHES.map((s) => (
            <Swatch key={s.cls} cls={s.cls} name={s.name} label={isHtml ? s.cssVar : s.cls} detail={s.hex} />
          ))}
        </div>
      </div>
      {THEME_GROUPS.map((group) => (
        <div key={group.title} className="grid grid-cols-[minmax(0,1fr)] gap-3">
          <h3 className="text-base font-bold">{group.title}</h3>
          <div className="overflow-x-auto rounded-2xl border border-border-default">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-bg-s2 text-xs uppercase tracking-wide text-tx-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Amostra</th>
                  <th className="px-4 py-3 font-semibold">Variável</th>
                  {isHtml ? null : <th className="px-4 py-3 font-semibold">Classe</th>}
                  <th className="px-4 py-3 font-semibold">Claro</th>
                  <th className="px-4 py-3 font-semibold">Escuro</th>
                  <th className="px-4 py-3 font-semibold">Uso</th>
                </tr>
              </thead>
              <tbody className="bg-bg-surface">
                {group.items.map((item) => (
                  <tr key={item.cls} className="border-t border-border-subtle">
                    <td className="px-4 py-3">
                      {item.cls.startsWith('bg-') ? (
                        <span className={`block h-8 w-12 rounded-lg border border-border-default ${item.cls}`} />
                      ) : item.cls.startsWith('text-') ? (
                        <span className={`text-lg font-bold ${item.cls}`}>Aa</span>
                      ) : (
                        <span className={`block h-8 w-12 rounded-lg border-2 bg-bg-surface ${item.cls}`} />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-xs">--{item.token}</code>
                    </td>
                    {isHtml ? null : (
                      <td className="px-4 py-3">
                        <code className="text-xs text-tx-secondary">{item.cls}</code>
                      </td>
                    )}
                    <td className="px-4 py-3 text-xs text-tx-muted">{themeTokens.light[item.token]}</td>
                    <td className="px-4 py-3 text-xs text-tx-muted">{themeTokens.dark[item.token]}</td>
                    <td className="px-4 py-3 text-xs text-tx-muted">{item.use}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <Example
        title="Variáveis no seu CSS"
        description="Funciona em qualquer sistema que carregue tokens.css."
        code={{
          react: `.painel {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  color: var(--text-primary);
}
.destaque {
  background: rgb(var(--color-primary-ch) / 0.1); /* azul da marca a 10% */
}`,
          html: `<div style="background: var(--bg-surface); border: 1px solid var(--border-default);
            color: var(--text-primary); border-radius: 12px; padding: 12px 16px">.painel</div>
<div style="background: rgb(var(--color-primary-ch) / 0.1); color: var(--text-primary);
            border-radius: 12px; padding: 12px 16px">.destaque</div>`,
        }}
      >
        <div className="rounded-xl border border-border-default bg-bg-surface px-4 py-3 text-tx-primary">.painel</div>
        <div className="rounded-xl bg-primary/10 px-4 py-3 text-tx-primary">.destaque</div>
      </Example>
    </ShowcaseSection>
  );
}

export function TypographySection() {
  return (
    <ShowcaseSection
      id="tipografia"
      title="Tipografia"
      description="Inter no texto e Manrope nos títulos de destaque."
    >
      <Example
        title="Títulos e texto"
        previewClassName="grid items-start gap-2"
        code={{
          react: `<h1 className="font-headline text-4xl font-extrabold tracking-tight">Título da página</h1>
<h2 className="text-xl font-bold">Título de seção</h2>
<p className="text-tx-secondary">Texto de apoio, em tom secundário.</p>
<p className="text-xs uppercase tracking-wide text-tx-muted">Rótulo</p>`,
          html: `<h1 class="tj-heading-1">Título da página</h1>
<h2 class="tj-heading-2">Título de seção</h2>
<p class="tj-text">Texto de apoio, em tom secundário.</p>
<p class="tj-caption">Rótulo</p>`,
        }}
      >
        <h1 className="font-headline text-4xl font-extrabold tracking-tight">Título da página</h1>
        <h2 className="text-xl font-bold">Título de seção</h2>
        <p className="text-tx-secondary">Texto de apoio, em tom secundário.</p>
        <p className="text-xs uppercase tracking-wide text-tx-muted">Rótulo</p>
      </Example>
    </ShowcaseSection>
  );
}

export function ButtonsSection() {
  const { stack } = useStack();

  return (
    <ShowcaseSection
      id="botoes"
      title="Botões"
      description={
        stack === 'html'
          ? 'Classe tj-btn, com os modificadores tj-btn--ghost, tj-btn--subtle, tj-btn--sm e tj-btn--block. Funciona em <button> e em <a>.'
          : 'Button aceita variant (primary, ghost, subtle), size (md, sm), fullWidth e todas as props de <button>. O type padrão é button; em formulários use type="submit".'
      }
    >
      <Example
        title="Variantes"
        code={{
          react: `import { Button } from '@tijucas/ui';

<Button>Salvar</Button>
<Button variant="ghost">Cancelar</Button>
<Button variant="subtle">Mais opções</Button>`,
          html: `<button class="tj-btn" type="button">Salvar</button>
<button class="tj-btn tj-btn--ghost" type="button">Cancelar</button>
<button class="tj-btn tj-btn--subtle" type="button">Mais opções</button>`,
        }}
      >
        <Button>Salvar</Button>
        <Button variant="ghost">Cancelar</Button>
        <Button variant="subtle">Mais opções</Button>
      </Example>
      <Example
        title="Tamanhos e estados"
        code={{
          react: `<Button size="sm">Pequeno</Button>
<Button>Médio (padrão)</Button>
<Button disabled>Desabilitado</Button>`,
          html: `<button class="tj-btn tj-btn--sm" type="button">Pequeno</button>
<button class="tj-btn" type="button">Médio (padrão)</button>
<button class="tj-btn" type="button" disabled>Desabilitado</button>`,
        }}
      >
        <Button size="sm">Pequeno</Button>
        <Button>Médio (padrão)</Button>
        <Button disabled>Desabilitado</Button>
      </Example>
      <Example
        title="Largura total"
        previewClassName="block"
        code={{
          react: `<Button type="submit" fullWidth>Enviar solicitação</Button>`,
          html: `<button class="tj-btn tj-btn--block" type="submit">Enviar solicitação</button>`,
        }}
      >
        <Button fullWidth>Enviar solicitação</Button>
      </Example>
    </ShowcaseSection>
  );
}

export function CardsSection() {
  return (
    <ShowcaseSection
      id="cards"
      title="Card"
      description="Caixa arredondada com sombra suave, na cor de superfície do tema. Espaçamento e layout interno ficam por sua conta."
    >
      <Example
        title="Card com conteúdo"
        previewClassName="bg-bg-base"
        code={{
          react: `import { Button, Card } from '@tijucas/ui';

<Card className="grid max-w-sm gap-3">
  <h3 className="font-bold">Pedido #1042</h3>
  <p className="text-sm text-tx-secondary">Aguardando aprovação do gerente.</p>
  <Button size="sm" variant="ghost">Ver detalhes</Button>
</Card>`,
          html: `<div class="tj-card" style="display: grid; gap: 12px; max-width: 24rem">
  <h3 class="tj-heading-2">Pedido #1042</h3>
  <p class="tj-text">Aguardando aprovação do gerente.</p>
  <button class="tj-btn tj-btn--ghost tj-btn--sm" type="button">Ver detalhes</button>
</div>`,
        }}
      >
        <Card className="grid max-w-sm gap-3">
          <h3 className="font-bold">Pedido #1042</h3>
          <p className="text-sm text-tx-secondary">Aguardando aprovação do gerente.</p>
          <Button size="sm" variant="ghost">
            Ver detalhes
          </Button>
        </Card>
      </Example>
    </ShowcaseSection>
  );
}

export function FieldsSection() {
  const [password, setPassword] = useState('');

  return (
    <ShowcaseSection
      id="campos"
      title="Campos"
      description="O rótulo envolve o campo: texto em cima, campo embaixo. Todas as props/atributos nativos (value, disabled, placeholder…) continuam valendo."
    >
      <Example
        title="Texto e seleção"
        previewClassName="grid max-w-md items-start gap-4"
        code={{
          react: `import { FieldLabel, SelectInput, TextInput } from '@tijucas/ui';

<FieldLabel>
  Cliente
  <TextInput placeholder="Nome do cliente" />
</FieldLabel>
<FieldLabel>
  Filial
  <SelectInput>
    <option>Matriz</option>
    <option>Filial 2</option>
  </SelectInput>
</FieldLabel>
<FieldLabel>
  Código (somente leitura)
  <TextInput value="PED-1042" disabled readOnly />
</FieldLabel>`,
          html: `<label class="tj-field">
  Cliente
  <input class="tj-input" placeholder="Nome do cliente">
</label>
<label class="tj-field">
  Filial
  <select class="tj-select">
    <option>Matriz</option>
    <option>Filial 2</option>
  </select>
</label>
<label class="tj-field">
  Código (somente leitura)
  <input class="tj-input" value="PED-1042" disabled readonly>
</label>`,
        }}
      >
        <FieldLabel>
          Cliente
          <TextInput placeholder="Nome do cliente" />
        </FieldLabel>
        <FieldLabel>
          Filial
          <SelectInput>
            <option>Matriz</option>
            <option>Filial 2</option>
          </SelectInput>
        </FieldLabel>
        <FieldLabel>
          Código (somente leitura)
          <TextInput value="PED-1042" disabled readOnly />
        </FieldLabel>
      </Example>
      <Example
        title="Força da senha"
        description="Digite uma senha para ver a barra mudar. Não aparece com o campo vazio."
        previewClassName="grid max-w-md items-start gap-1"
        code={{
          react: `import { FieldLabel, PasswordStrengthBar, TextInput } from '@tijucas/ui';

const [password, setPassword] = useState('');

<FieldLabel>
  Nova senha
  <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
</FieldLabel>
<PasswordStrengthBar password={password} />`,
        }}
      >
        <FieldLabel>
          Nova senha
          <TextInput
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Digite para testar"
          />
        </FieldLabel>
        <PasswordStrengthBar password={password} />
      </Example>
    </ShowcaseSection>
  );
}

export function SectionHeaderSection() {
  return (
    <ShowcaseSection
      id="cabecalho"
      title="Cabeçalho de página"
      description="Título da página (h1) com descrição e uma ação opcional à direita; no celular a ação desce."
    >
      <Example
        title="Com descrição e ação"
        previewClassName="block"
        code={{
          react: `import { Button, SectionHeader } from '@tijucas/ui';

<SectionHeader
  title="Pedidos"
  description="Acompanhe os pedidos do dia"
  action={<Button>Novo pedido</Button>}
/>`,
          html: `<header class="tj-page-header">
  <div class="tj-page-header__text">
    <h1 class="tj-page-header__title">Pedidos</h1>
    <p class="tj-page-header__description">Acompanhe os pedidos do dia</p>
  </div>
  <div><button class="tj-btn" type="button">Novo pedido</button></div>
</header>`,
        }}
      >
        <SectionHeader
          title="Pedidos"
          description="Acompanhe os pedidos do dia"
          action={<Button>Novo pedido</Button>}
        />
      </Example>
    </ShowcaseSection>
  );
}

const TOAST_SAMPLES: Array<{ label: string; input: ShowToastInput }> = [
  { label: 'Sucesso', input: { title: 'Pedido salvo', variant: 'success' } },
  { label: 'Erro', input: { title: 'Falha ao salvar', description: 'Tente de novo.', variant: 'error' } },
  { label: 'Aviso', input: { title: 'Prazo perto do fim', variant: 'warning' } },
  { label: 'Informação', input: { title: 'Nova versão disponível' } },
];

export function ToastsSection() {
  const { showToast } = useToast();
  const { stack } = useStack();

  const calls = `showToast({ title: 'Pedido salvo', variant: 'success' });
showToast({ title: 'Falha ao salvar', description: 'Tente de novo.', variant: 'error' });
showToast({ title: 'Prazo perto do fim', variant: 'warning' });
showToast({ title: 'Nova versão disponível' }); // info é o padrão`;

  return (
    <ShowcaseSection
      id="toasts"
      title="Toasts"
      description={
        stack === 'html'
          ? 'Avisos rápidos no canto da tela, que somem sozinhos em 3,5 s. TijucasUI.showToast cria tudo; só precisa do components.css carregado.'
          : stack === 'next'
            ? 'Avisos rápidos no canto da tela, que somem sozinhos em 3,5 s. Precisa do ToastProvider no layout raiz; useToast só funciona em componentes com \'use client\'.'
            : 'Avisos rápidos no canto da tela, que somem sozinhos em 3,5 s. Precisa do ToastProvider na raiz do app.'
      }
    >
      <Example
        title="As quatro variantes"
        description="Clique para ver cada uma."
        code={{
          react: `import { Button, useToast } from '@tijucas/ui';

const { showToast } = useToast();

${calls}`,
          next: `'use client';
import { Button, useToast } from '@tijucas/ui';

const { showToast } = useToast();

${calls}`,
          html: `<button class="tj-btn tj-btn--subtle" type="button"
  onclick="TijucasUI.showToast({ title: 'Pedido salvo', variant: 'success' })">Sucesso</button>

<script>
  TijucasUI.${calls.split('\n').join('\n  TijucasUI.')}
</script>`,
        }}
        htmlPreview={TOAST_SAMPLES.map((sample) => (
          <button
            key={sample.label}
            type="button"
            className="tj-btn tj-btn--subtle"
            onClick={() => showVanillaToast(sample.input)}
          >
            {sample.label}
          </button>
        ))}
      >
        {TOAST_SAMPLES.map((sample) => (
          <Button key={sample.label} variant="subtle" onClick={() => showToast(sample.input)}>
            {sample.label}
          </Button>
        ))}
      </Example>
    </ShowcaseSection>
  );
}

export function LogoSection() {
  return (
    <ShowcaseSection
      id="logo"
      title="Logo do produto"
      description="Os traços herdam a cor do texto ao redor (branco sobre a marca, azul sobre fundo claro); os pontos usam a cor secundária. O nome pode ser trocado para outros produtos."
    >
      <Example
        title="Sobre a cor da marca e sobre fundo claro"
        code={{
          react: `import { ProductLogo } from '@tijucas/ui';

<div className="rounded-xl bg-brand-primary px-4 py-3 text-white">
  <ProductLogo />
</div>
<div className="rounded-xl bg-white px-4 py-3 text-primary">
  <ProductLogo />
</div>`,
          html: `<div id="logo-azul" style="background: var(--color-primary); color: #fff;
                         border-radius: 12px; padding: 12px 16px"></div>
<div id="logo-claro" style="background: #fff; color: var(--color-primary);
                          border-radius: 12px; padding: 12px 16px"></div>

<script>
  document.getElementById('logo-azul').innerHTML = TijucasUI.productLogoHtml();
  document.getElementById('logo-claro').innerHTML = TijucasUI.productLogoHtml();
</script>

<!-- No servidor (EJS), sem script na página: -->
<!-- const { productLogoHtml } = require('@tijucas/ui/vanilla');  ->  <%- productLogoHtml() %> -->`,
        }}
        htmlPreview={
          <>
            <div
              className="rounded-xl px-4 py-3"
              style={{ background: 'var(--color-primary)', color: '#fff' }}
              dangerouslySetInnerHTML={{ __html: productLogoHtml() }}
            />
            <div
              className="rounded-xl border border-border-default px-4 py-3"
              style={{ background: '#fff', color: 'var(--color-primary)' }}
              dangerouslySetInnerHTML={{ __html: productLogoHtml() }}
            />
          </>
        }
      >
        <div className="rounded-xl bg-brand-primary px-4 py-3 text-white">
          <ProductLogo />
        </div>
        <div className="rounded-xl border border-border-default bg-white px-4 py-3 text-primary">
          <ProductLogo />
        </div>
      </Example>
      <Example
        title="Outro produto, só o símbolo, só o nome"
        description="Sobre fundo claro."
        previewClassName="bg-white"
        code={{
          react: `import { ProductLogo, ProductMark, ProductWordmark } from '@tijucas/ui';

<ProductLogo prefix="aurora" accent="flow" />
<ProductMark label="Aurora Flow" className="h-12 w-12" />
<ProductWordmark />`,
          html: `<script>
  el.innerHTML = TijucasUI.productLogoHtml({ prefix: 'aurora', accent: 'flow' });
  el.innerHTML = TijucasUI.productMarkSvg({ label: 'Aurora Flow' });   // só o símbolo
</script>`,
        }}
        htmlPreview={
          <>
            <div
              style={{ color: 'var(--color-primary)' }}
              dangerouslySetInnerHTML={{ __html: productLogoHtml({ prefix: 'aurora', accent: 'flow' }) }}
            />
            <div
              className="h-12 w-12 [&_svg]:h-12 [&_svg]:w-12"
              style={{ color: 'var(--color-primary)' }}
              dangerouslySetInnerHTML={{ __html: productMarkSvg({ label: 'Aurora Flow' }) }}
            />
          </>
        }
      >
        <div className="text-primary">
          <ProductLogo prefix="aurora" accent="flow" />
        </div>
        <ProductMark label="Aurora Flow" className="h-12 w-12 text-primary" />
        <div className="text-primary">
          <ProductWordmark />
        </div>
      </Example>
    </ShowcaseSection>
  );
}

const TOKENS_CODE: Record<Stack, string> = {
  react: `import { brandColors, themeTokens } from '@tijucas/ui/tokens';

brandColors.primary;            // '${brandColors.primary}'
brandColors.secondary;          // '${brandColors.secondary}'
themeTokens.dark['bg-surface']; // '${themeTokens.dark['bg-surface']}'`,
  next: `// Seguro em Server Components: importe de @tijucas/ui/tokens, não de @tijucas/ui.
import { brandColors, themeTokens } from '@tijucas/ui/tokens';

brandColors.primary;            // '${brandColors.primary}'
brandColors.secondary;          // '${brandColors.secondary}'
themeTokens.dark['bg-surface']; // '${themeTokens.dark['bg-surface']}'`,
  html: `// Node (require ou import):
const { brandColors, themeTokens } = require('@tijucas/ui/tokens');
brandColors.primary;            // '${brandColors.primary}'

// JSON puro (outras linguagens, app mobile): @tijucas/ui/tokens.json
// ${CDN}/tokens.json

// No navegador, leia a variável CSS:
getComputedStyle(document.documentElement).getPropertyValue('--color-primary'); // '${brandColors.primary}'`,
};

export function TokensInCodeSection() {
  const { stack } = useStack();

  return (
    <ShowcaseSection
      id="tokens"
      title="Cores em código"
      description="Para gráficos, canvas, PDFs ou e-mails, os valores vêm prontos em JS ou JSON."
    >
      <CodeBlock code={TOKENS_CODE[stack]} />
    </ShowcaseSection>
  );
}
