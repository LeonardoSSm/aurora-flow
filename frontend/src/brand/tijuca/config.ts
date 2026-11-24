import { brandColors, fonts } from '../../../design-system/src/tokens';
import type { BrandConfig } from '../types';
import { tijucaAssets } from './assets';

export const tijucaConfig: BrandConfig = {
  company: {
    name: 'Tijuca Alimentos',
    shortName: 'Tijuca',
    tagline: 'Qualidade que alimenta',
  },
  product: {
    name: 'Tijuca Flow',
    wordmark: {
      prefix: 'tijuca',
      accent: 'flow',
    },
  },
  // Cores e fontes da Tijuca vivem no pacote @tijucas/ui (design-system/src/tokens.ts).
  colors: { ...brandColors },
  logos: {
    horizontalWhite: tijucaAssets.horizontalWhite,
    horizontalColor: tijucaAssets.horizontalColor,
    verticalColor: tijucaAssets.verticalColor,
    icon: tijucaAssets.icon,
    iconWhite: tijucaAssets.iconWhite,
    badge: tijucaAssets.badge,
    wordmark: tijucaAssets.wordmark,
  },
  backgrounds: {
    auth: tijucaAssets.fundoAzul,
    authPattern: tijucaAssets.fundo1,
    patternLight: tijucaAssets.fundoBranco,
  },
  fonts: { ...fonts },
};
