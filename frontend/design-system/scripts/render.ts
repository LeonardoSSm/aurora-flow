/**
 * Transforma `src/tokens.ts` nos arquivos distribuídos. Funções puras: o
 * `generate.ts` grava o resultado e o teste do Tijuca Flow confere que os
 * arquivos commitados não se afastaram da fonte.
 */
import { brandColors, fonts, tailwindTheme, themeTokens } from '../src/tokens.ts';

const HEADER = '/* Gerado por design-system/scripts/generate.ts a partir de src/tokens.ts — não edite à mão. */\n';

type Nested = { readonly [key: string]: string | readonly string[] | Nested };

function hexToChannels(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r} ${g} ${b}`;
}

function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

function block(selector: string, vars: Array<[string, string]>): string {
  const body = vars.map(([name, value]) => `  --${name}: ${value};`).join('\n');
  return `${selector} {\n${body}\n}\n`;
}

/** Variáveis CSS: marca (fixa) + tema claro em `:root`, tema escuro em `.dark`. */
export function renderTokensCss(): string {
  const brand: Array<[string, string]> = Object.entries(brandColors).map(([name, hex]) => [
    `color-${kebab(name)}`,
    hex,
  ]);
  const channels: Array<[string, string]> = (
    ['primary', 'primaryDark', 'primaryLight', 'secondary', 'accent'] as const
  ).map((name) => [`color-${kebab(name)}-ch`, hexToChannels(brandColors[name])]);
  const status: Array<[string, string]> = [['color-error', brandColors.danger]];
  const font: Array<[string, string]> = [
    ['font-heading', fonts.heading],
    ['font-body', fonts.body],
  ];

  return [
    HEADER,
    block(':root', [
      ...brand,
      ...channels,
      ...status,
      ...font,
      ...Object.entries(themeTokens.light),
    ]),
    block('.dark', Object.entries(themeTokens.dark)),
  ].join('\n');
}

function flatten(prefix: string, value: Nested): Array<[string, string | readonly string[]]> {
  return Object.entries(value).flatMap(([key, inner]) => {
    const name = prefix ? `${prefix}-${key}` : key;
    if (typeof inner === 'string' || Array.isArray(inner)) return [[name, inner]] as const;
    return flatten(name, inner as Nested);
  });
}

function v4Color(value: string): string {
  return value.replace(' / <alpha-value>', '');
}

function renderKeyframes(name: string, frames: Nested): string {
  const body = Object.entries(frames)
    .map(([step, props]) => {
      const decls = Object.entries(props as Nested)
        .map(([prop, v]) => `      ${kebab(prop)}: ${v as string};`)
        .join('\n');
      return `    ${step} {\n${decls}\n    }`;
    })
    .join('\n');
  return `  @keyframes ${name} {\n${body}\n  }`;
}

/** Tema do Tailwind v4 (CSS-first). Mesmos nomes de classe do preset v3. */
export function renderThemeCss(): string {
  const lines: string[] = [];
  for (const [name, value] of flatten('', tailwindTheme.colors as Nested)) {
    lines.push(`  --color-${name}: ${v4Color(value as string)};`);
  }
  for (const [name, stack] of Object.entries(tailwindTheme.fontFamily)) {
    lines.push(`  --font-${name}: ${stack.join(', ')};`);
  }
  for (const [name, value] of Object.entries(tailwindTheme.boxShadow)) {
    lines.push(`  --shadow-${name}: ${value};`);
  }
  for (const [name, value] of Object.entries(tailwindTheme.animation)) {
    lines.push(`  --animate-${name}: ${value};`);
  }
  const keyframes = Object.entries(tailwindTheme.keyframes).map(([name, frames]) =>
    renderKeyframes(name, frames as Nested),
  );

  return [
    HEADER,
    '/* Tema escuro pela classe `.dark` no <html>, como no Tijuca Flow. */',
    '@custom-variant dark (&:where(.dark, .dark *));\n',
    `@theme inline {\n${lines.join('\n')}\n\n${keyframes.join('\n\n')}\n}\n`,
  ].join('\n');
}

/** Preset do Tailwind v3. */
export function renderTailwindPreset(): string {
  const preset = { darkMode: 'class', theme: { extend: tailwindTheme } };
  return [
    '// Gerado por design-system/scripts/generate.ts a partir de src/tokens.ts — não edite à mão.',
    '/** @type {import("tailwindcss").Config} */',
    `module.exports = ${JSON.stringify(preset, null, 2)};\n`,
  ].join('\n');
}

/** Valores crus para quem não usa CSS (app mobile, PDFs, e-mails). */
export function renderTokensJson(): string {
  return `${JSON.stringify({ brandColors, fonts, themeTokens }, null, 2)}\n`;
}
