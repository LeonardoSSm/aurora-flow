const BASE = '/brand/tijuca';

export const tijucaAssets = {
  horizontalWhite: `${BASE}/logo1-recorte.png`,
  horizontalColor: `${BASE}/logo3.png`,
  verticalColor: `${BASE}/logo2.png`,
  icon: `${BASE}/loginho.png`,
  iconWhite: `${BASE}/tijucaicone2.png`,
  badge: `${BASE}/tijucaa.png`,
  wordmark: `${BASE}/nome-tijuca2.svg`,
  /** Marca do produto (Tijuca Flow) — usada como favicon; a versao React vive em brand/components/product-logo.tsx */
  productMark: `${BASE}/tijuca-flow-mark.svg`,
  fundoAzul: `${BASE}/fundoAzul.jpeg`,
  fundo1: `${BASE}/fundo1.png`,
  fundoBranco: `${BASE}/fundoBranco.jpeg`,
  fundo2: `${BASE}/fundo2.png`,
} as const;
