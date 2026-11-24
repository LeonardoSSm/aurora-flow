import { brandColors, fonts } from '../../../design-system/src/tokens';
import type { BrandConfig } from '../types';

export const auroraConfig: BrandConfig = {
  company: {
    name: 'Aurora Ecosystem',
    shortName: 'Aurora',
    tagline: 'Automações de propósito geral',
  },
  product: {
    name: 'Aurora Flow',
    wordmark: {
      prefix: 'aurora',
      accent: 'flow',
    },
  },
  colors: { ...brandColors },
  logos: {
    horizontalWhite: '',
    horizontalColor: '',
    verticalColor: '',
    icon: '',
    iconWhite: '',
    badge: undefined,
    wordmark: undefined,
  },
  backgrounds: {
    auth: '',
  },
  fonts: { ...fonts },
};
