import type { CSSProperties } from 'react';
import type { BrandConfig } from './types';

/**
 * Bridges brand.colors.* (fixed, non-theme-aware hex values) into CSS custom
 * properties so descendant components can reference them via `var(--tf-*)`
 * without re-importing useBrand() or duplicating hex literals.
 */
export function brandCssVars(brand: BrandConfig): CSSProperties {
  return {
    '--tf-primary': brand.colors.primary,
    '--tf-primary-light': brand.colors.primaryLight,
    '--tf-secondary': brand.colors.secondary,
    '--tf-accent': brand.colors.accent,
    '--tf-text': brand.colors.text,
    '--tf-text-muted': brand.colors.textMuted,
    '--tf-surface': brand.colors.surface,
    '--tf-background': brand.colors.background,
    '--tf-border': brand.colors.border,
    '--tf-danger': brand.colors.danger,
    '--tf-success': brand.colors.success,
    '--tf-warning': brand.colors.warning,
  } as CSSProperties;
}

/**
 * `brandCssVars` fixa as cores do formulário público (sempre claro). Telas internas que reaproveitam
 * componentes dele (campo de fase, ficha do ERP) seguem o tema do app: no escuro o texto
 * (`--tf-text` escuro) sumia sobre o fundo escuro. Sobrepor estes neutros aos da marca resolve.
 */
export const themeAwareFieldVars = {
  '--tf-text': 'var(--text-primary)',
  '--tf-text-muted': 'var(--text-secondary)',
  '--tf-surface': 'var(--bg-surface-2)',
  '--tf-background': 'var(--bg-input)',
  '--tf-border': 'var(--border-strong)',
} as CSSProperties;
