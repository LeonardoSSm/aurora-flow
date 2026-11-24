export interface BrandConfig {
  company: {
    name: string;
    shortName: string;
    tagline?: string;
  };
  /**
   * Identidade do sistema (produto), distinta da identidade da empresa: a
   * sidebar e o favicon falam pelo produto, o login e os formularios publicos
   * continuam falando pela empresa.
   */
  product: {
    name: string;
    /** Wordmark em duas partes — `accent` recebe a cor secundaria da marca. */
    wordmark: {
      prefix: string;
      accent: string;
    };
  };
  colors: {
    primary: string;
    primaryDark: string;
    primaryLight: string;
    secondary: string;
    accent: string;
    text: string;
    textMuted: string;
    surface: string;
    background: string;
    border: string;
    danger: string;
    success: string;
    warning: string;
  };
  logos: {
    horizontalWhite: string;
    horizontalColor: string;
    verticalColor: string;
    icon: string;
    iconWhite: string;
    badge?: string;
    wordmark?: string;
  };
  backgrounds: {
    auth: string;
    authPattern?: string;
    patternLight?: string;
  };
  fonts: {
    heading: string;
    body: string;
  };
}
