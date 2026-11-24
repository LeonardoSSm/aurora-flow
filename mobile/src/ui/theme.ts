import { createContext, useContext } from 'react';

/**
 * Tokens do app (design 2026-11). A marca é o azul Tijuca; o resto é neutro e calmo, para o que
 * importa (prazo, aprovação, fase) aparecer pela cor. Valores espelham a paleta do web onde ela
 * existe (fases, prioridades), para o mesmo card ter a mesma cara nas duas pontas.
 *
 * Há duas paletas (clara e escura) com as mesmas chaves. Componentes pegam a atual com
 * `useTheme()`; estilos que dependem de cor nascem de `makeStyles`, que guarda uma folha por paleta.
 */

export type Palette = {
  brand: string;
  brandStrong: string;
  brandSoft: string;
  brandTint: string;
  /** Azul da marca como texto ou ícone (links, item escolhido); no escuro é mais claro que o de fundo de botão. */
  brandText: string;
  accent: string;
  /** Fundo dos blocos em destaque da marca (topo da Início, login). */
  hero: string;

  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  borderStrong: string;
  divider: string;
  overlay: string;
  /** Trilho de controles segmentados e o item escolhido em cima dele. */
  track: string;
  raised: string;
  /** Bloco cinza do carregamento ("esqueleto"). */
  skeleton: string;
  ripple: string;

  text: string;
  textSecondary: string;
  textMuted: string;
  textFaint: string;
  onBrand: string;

  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  dangerBorder: string;
  info: string;
  infoSoft: string;
  purple: string;
  purpleSoft: string;
};

export const lightColors: Palette = {
  brand: '#1A3C8F',
  brandStrong: '#132E70',
  brandSoft: '#E9EFFB',
  brandTint: '#F3F6FD',
  brandText: '#1A3C8F',
  accent: '#2B5DD6',
  hero: '#1A3C8F',

  bg: '#F3F5F9',
  surface: '#FFFFFF',
  surfaceAlt: '#F8FAFC',
  border: '#E3E8EF',
  borderStrong: '#CBD3DF',
  divider: '#EEF1F5',
  overlay: 'rgba(9, 20, 45, 0.45)',
  track: '#E9EDF3',
  raised: '#FFFFFF',
  skeleton: '#E7EBF1',
  ripple: 'rgba(0, 0, 0, 0.06)',

  text: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#64748B',
  textFaint: '#94A3B8',
  onBrand: '#FFFFFF',

  success: '#15803D',
  successSoft: '#DCFCE7',
  warning: '#B45309',
  warningSoft: '#FEF3C7',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  dangerBorder: '#F3B4B4',
  info: '#0369A1',
  infoSoft: '#E0F2FE',
  purple: '#6D28D9',
  purpleSoft: '#EDE9FE',
};

/**
 * Escuro: fundo azul-noite (preto puro cansa com texto claro), superfícies um degrau acima do
 * fundo e cores de estado mais claras para manter o contraste. O azul da marca sobe de tom para
 * continuar legível como texto e ainda segurar texto branco nos botões.
 */
export const darkColors: Palette = {
  brand: '#3E70E0',
  brandStrong: '#2F5BC4',
  brandSoft: '#1A2A50',
  brandTint: '#152140',
  brandText: '#82A8FF',
  accent: '#7EA6FF',
  hero: '#13244F',

  bg: '#0B1220',
  surface: '#131C2E',
  surfaceAlt: '#172235',
  border: '#243149',
  borderStrong: '#34445F',
  divider: '#1D283C',
  overlay: 'rgba(0, 0, 0, 0.6)',
  track: '#0E1626',
  raised: '#26344D',
  skeleton: '#1C2638',
  ripple: 'rgba(255, 255, 255, 0.08)',

  text: '#E6EBF5',
  textSecondary: '#AEB9CC',
  textMuted: '#8A97AE',
  textFaint: '#62708A',
  onBrand: '#FFFFFF',

  success: '#1F9D55',
  successSoft: '#0F2E1D',
  warning: '#F59E0B',
  warningSoft: '#33250B',
  danger: '#E5484D',
  dangerSoft: '#3A1517',
  dangerBorder: '#7F2D2F',
  info: '#38BDF8',
  infoSoft: '#0B2A3D',
  purple: '#A78BFA',
  purpleSoft: '#251B45',
};

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const radii = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;

/** Área mínima de toque (Material: 48 dp). */
export const MIN_TOUCH = 48;

export const type = {
  display: { fontSize: 26, lineHeight: 32, fontWeight: '800' as const, letterSpacing: -0.3 },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '700' as const, letterSpacing: -0.2 },
  heading: { fontSize: 16, lineHeight: 22, fontWeight: '700' as const },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: '600' as const },
  small: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  smallStrong: { fontSize: 13, lineHeight: 18, fontWeight: '600' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const },
  overline: { fontSize: 11, lineHeight: 14, fontWeight: '700' as const, letterSpacing: 0.8 },
} as const;

export type TypeVariant = keyof typeof type;

export const shadow = {
  // Sem elevation: sombra em cada card de uma lista longa pesa na GPU de aparelho simples (no A04e
  // a rolagem do quadro caía para ~28 qps). O card se destaca pela borda.
  card: {},
  raised: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
} as const;

export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'purple';

export type Tones = Record<Tone, { bg: string; fg: string }>;

const lightTones: Tones = {
  neutral: { bg: '#EEF1F5', fg: lightColors.textSecondary },
  brand: { bg: lightColors.brandSoft, fg: lightColors.brand },
  success: { bg: lightColors.successSoft, fg: lightColors.success },
  warning: { bg: lightColors.warningSoft, fg: lightColors.warning },
  danger: { bg: lightColors.dangerSoft, fg: lightColors.danger },
  info: { bg: lightColors.infoSoft, fg: lightColors.info },
  purple: { bg: lightColors.purpleSoft, fg: lightColors.purple },
};

// No escuro o texto dos selos é mais claro que a cor "cheia" do estado (que é fundo de botão).
const darkTones: Tones = {
  neutral: { bg: '#222D41', fg: darkColors.textSecondary },
  brand: { bg: darkColors.brandSoft, fg: '#93B4FF' },
  success: { bg: darkColors.successSoft, fg: '#4ADE80' },
  warning: { bg: darkColors.warningSoft, fg: '#FBBF24' },
  danger: { bg: darkColors.dangerSoft, fg: '#F87171' },
  info: { bg: darkColors.infoSoft, fg: '#7DD3FC' },
  purple: { bg: darkColors.purpleSoft, fg: '#C4B5FD' },
};

export type ThemeMode = 'system' | 'light' | 'dark';

export type Theme = {
  colors: Palette;
  tones: Tones;
  isDark: boolean;
  /** Preferência da pessoa: seguir o celular, claro ou escuro. */
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
};

export const lightTheme = { colors: lightColors, tones: lightTones, isDark: false } as const;
export const darkTheme = { colors: darkColors, tones: darkTones, isDark: true } as const;

export const ThemeContext = createContext<Theme>({ ...lightTheme, mode: 'system', setMode: () => undefined });

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * Estilos que dependem da paleta: `const useStyles = makeStyles((colors) => ({ ... }))` no módulo e
 * `const styles = useStyles()` no componente. Guarda uma folha por paleta (são só duas).
 */
export function makeStyles<T>(factory: (colors: Palette) => T): () => T {
  const cache = new Map<Palette, T>();
  return function useStyles() {
    const { colors } = useContext(ThemeContext);
    let sheet = cache.get(colors);
    if (!sheet) {
      sheet = factory(colors);
      cache.set(colors, sheet);
    }
    return sheet;
  };
}

/** Paleta das fases (mesma de PHASE_COLOR_PALETTE no web): a API manda o nome da cor. */
const PHASE_COLORS: Record<string, string> = {
  blue: '#1A3C8F',
  amber: '#D97706',
  green: '#16A34A',
  red: '#DC2626',
  purple: '#7C3AED',
  gray: '#6B7280',
};

// No escuro as mesmas cores sobem de tom (o azul da marca some num fundo azul-noite).
const DARK_PHASE_COLORS: Record<string, string> = {
  blue: '#5B8DEF',
  amber: '#F59E0B',
  green: '#22C55E',
  red: '#F05252',
  purple: '#A78BFA',
  gray: '#9CA3AF',
};

export function phaseColor(color: string | null | undefined, isDark = false): string {
  const palette = isDark ? DARK_PHASE_COLORS : PHASE_COLORS;
  if (color && palette[color]) return palette[color];
  if (color && /^#[0-9a-f]{6}$/i.test(color)) return color;
  return palette.blue;
}

/** Cor com transparência (hex #RRGGBB → rgba). */
export function alpha(hex: string, opacity: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
