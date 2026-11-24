/**
 * Mapa rota → artigo da Central de Ajuda.
 */
const ROUTE_TO_ARTICLE: Array<{ prefix: string; slug: string }> = [
  { prefix: '/inicio', slug: 'navegando-pelo-sistema' },
  { prefix: '/dashboard', slug: 'como-o-sistema-funciona' },
  { prefix: '/formularios', slug: 'criar-um-formulario' },
  { prefix: '/builder', slug: 'campos-e-secoes' },
  { prefix: '/registros', slug: 'ver-respostas' },
  { prefix: '/respostas', slug: 'ver-respostas' },
  { prefix: '/kanban', slug: 'acompanhar-solicitacoes' },
  { prefix: '/solicitacoes', slug: 'atender-uma-solicitacao' },
  { prefix: '/aprovacoes', slug: 'aprovar-ou-reprovar' },
  { prefix: '/flows', slug: 'fluxos-automaticos' },
  { prefix: '/integracoes', slug: 'fluxos-automaticos' },
  { prefix: '/listas-de-itens', slug: 'campos-e-secoes' },
  { prefix: '/administracao', slug: 'por-que-nao-consigo' },
];

export function helpArticleForRoute(pathname: string): string | null {
  const match = [...ROUTE_TO_ARTICLE]
    .sort((a, b) => b.prefix.length - a.prefix.length)
    .find((entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`));
  return match?.slug ?? null;
}

export function helpLinkForRoute(pathname: string): string {
  const slug = helpArticleForRoute(pathname);
  return slug ? `/ajuda/${slug}` : '/ajuda';
}
