/**
 * Fonte única do visual Tijuca. `npm run build` gera a partir daqui o
 * `css/tokens.css`, o `css/theme.css` (Tailwind v4), o `tailwind-preset.cjs`
 * (Tailwind v3) e o `tokens.json` — não edite esses arquivos à mão.
 *
 * Este arquivo não importa nada: o gerador roda direto no Node (type stripping).
 */

/** Cores da marca. Fixas (não mudam no tema escuro). */
export const brandColors = {
  primary: '#1A3C8F',
  primaryDark: '#142E6E',
  primaryLight: '#EEF2FB',
  secondary: '#F5A623',
  accent: '#2A6B2A',
  text: '#1A1A2E',
  textMuted: '#6B7280',
  surface: '#FFFFFF',
  background: '#F8F9FC',
  border: '#E5E7EB',
  danger: '#DC2626',
  success: '#16A34A',
  warning: '#D97706',
} as const;

export type BrandColors = { [K in keyof typeof brandColors]: string };

export const fonts = {
  heading: "'Inter', sans-serif",
  body: "'Inter', sans-serif",
} as const;

/** Superfícies, bordas, textos e status — mudam entre claro (`:root`) e escuro (`.dark`). */
export const themeTokens = {
  light: {
    'bg-base': '#f8f9fc',
    'bg-surface': '#ffffff',
    'bg-surface-2': '#f7fbff',
    'bg-surface-3': '#f0f6ff',
    'bg-surface-hover': '#ebf5ff',
    'bg-input': '#ffffff',
    'border-default': '#e5edf7',
    'border-strong': '#cfdced',
    'border-subtle': '#edf2f9',
    'text-primary': '#0d1d29',
    'text-secondary': '#4a5d7a',
    'text-muted': '#6b7a8d',
    'text-placeholder': '#9aaabb',
    'color-info': '#0284c7',
  },
  dark: {
    'bg-base': '#0f172a',
    'bg-surface': '#1e293b',
    'bg-surface-2': '#162032',
    'bg-surface-3': '#1a2744',
    'bg-surface-hover': '#243352',
    'bg-input': '#1e293b',
    'border-default': '#334155',
    'border-strong': '#475569',
    'border-subtle': '#253047',
    'text-primary': '#f1f5f9',
    'text-secondary': '#94a3b8',
    'text-muted': '#64748b',
    'text-placeholder': '#475569',
  },
} as const;

/**
 * Classes do Tailwind → variáveis CSS. Cores com `<alpha-value>` aceitam
 * opacidade (`bg-primary/30`) porque apontam para os canais RGB da marca.
 */
export const tailwindTheme = {
  colors: {
    primary: 'rgb(var(--color-primary-ch) / <alpha-value>)',
    'primary-container': 'rgb(var(--color-primary-dark-ch) / <alpha-value>)',
    brand: {
      primary: 'rgb(var(--color-primary-ch) / <alpha-value>)',
      'primary-dark': 'rgb(var(--color-primary-dark-ch) / <alpha-value>)',
      'primary-light': 'rgb(var(--color-primary-light-ch) / <alpha-value>)',
      secondary: 'rgb(var(--color-secondary-ch) / <alpha-value>)',
      accent: 'rgb(var(--color-accent-ch) / <alpha-value>)',
    },
    surface: 'var(--bg-base)',
    'surface-container-low': 'var(--bg-surface-2)',
    'surface-container-lowest': 'var(--bg-surface)',
    'surface-container-high': 'var(--bg-surface-3)',
    'outline-variant': 'var(--border-default)',
    'on-surface': 'var(--text-primary)',
    'on-surface-variant': 'var(--text-secondary)',
    bg: {
      base: 'var(--bg-base)',
      surface: 'var(--bg-surface)',
      s2: 'var(--bg-surface-2)',
      s3: 'var(--bg-surface-3)',
      hover: 'var(--bg-surface-hover)',
      input: 'var(--bg-input)',
    },
    border: {
      default: 'var(--border-default)',
      strong: 'var(--border-strong)',
      subtle: 'var(--border-subtle)',
    },
    tx: {
      primary: 'var(--text-primary)',
      secondary: 'var(--text-secondary)',
      muted: 'var(--text-muted)',
      ph: 'var(--text-placeholder)',
    },
    status: {
      success: 'var(--color-success)',
      warning: 'var(--color-warning)',
      danger: 'var(--color-error)',
      info: 'var(--color-info)',
    },
  },
  fontFamily: {
    headline: ['Manrope', 'Inter', 'sans-serif'],
    body: ['Inter', 'sans-serif'],
  },
  boxShadow: {
    soft: '0 20px 40px rgba(13, 29, 41, 0.06)',
  },
  keyframes: {
    fade: {
      from: { opacity: '0' },
      to: { opacity: '1' },
    },
  },
  animation: {
    fade: 'fade .18s ease-out',
  },
} as const;

export const tokens = { brandColors, fonts, themeTokens, tailwindTheme } as const;
