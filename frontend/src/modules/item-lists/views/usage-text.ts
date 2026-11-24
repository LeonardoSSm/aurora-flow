import type { ItemListUsage } from '../item-lists-api';

/** "não usada ainda" / "usada em 2 formulários e 1 campo de fase". */
export function usageText(usage: ItemListUsage): string {
  const parts = [
    usage.forms ? `${usage.forms} ${usage.forms === 1 ? 'formulário' : 'formulários'}` : '',
    usage.phaseFields
      ? `${usage.phaseFields} ${usage.phaseFields === 1 ? 'campo de fase' : 'campos de fase'}`
      : '',
  ].filter(Boolean);
  return parts.length ? `usada em ${parts.join(' e ')}` : 'não usada ainda';
}
