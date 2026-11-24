import type { DocArticle, DocBlock, DocGroup, DocSection } from './types';

/** Achata um bloco em texto puro, para o índice de busca. */
function blockToText(block: DocBlock): string {
  switch (block.kind) {
    case 'paragraph':
      return block.text;
    case 'list':
      return block.items.join(' ');
    case 'steps':
      return block.steps.map((s) => `${s.title} ${s.text}`).join(' ');
    case 'callout':
      return `${block.title ?? ''} ${block.text}`;
    case 'code':
      return `${block.code} ${block.caption ?? ''}`;
    case 'table':
      return `${block.columns.join(' ')} ${block.rows.map((r) => r.join(' ')).join(' ')}`;
    case 'endpoints':
      return block.items
        .map((e) => `${e.method} ${e.path} ${e.description} ${e.permission ?? ''}`)
        .join(' ');
    case 'entities':
      return block.items
        .map(
          (e) =>
            `${e.table} ${e.entity} ${e.description} ${(e.columns ?? [])
              .map((c) => `${c.name} ${c.note ?? ''}`)
              .join(' ')}`,
        )
        .join(' ');
    case 'events':
      return [...(block.emits ?? []), ...(block.listens ?? [])].join(' ');
    case 'diagram':
      return block.caption ?? '';
    case 'live':
      return `${block.title ?? ''} ${block.description ?? ''}`;
    case 'files':
      return block.items.map((f) => `${f.path} ${f.note ?? ''}`).join(' ');
  }
}

function sectionsToText(sections: DocSection[] = []): string {
  return sections
    .map((section) => `${section.title} ${section.blocks.map(blockToText).join(' ')}`)
    .join(' ');
}

/** Marcas de acentuação separadas pelo `normalize('NFD')`. */
const DIACRITICOS = /[̀-ͯ]/g;

export function normalize(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(DIACRITICOS, '');
}

export type DocSearchEntry = {
  article: DocArticle;
  haystack: string;
};

export type DocSearchIndex = DocSearchEntry[];

/** Construa uma vez por catálogo — o conteúdo é estático. */
export function buildSearchIndex(articles: DocArticle[]): DocSearchIndex {
  return articles.map((article) => ({
    article,
    haystack: normalize(
      [
        article.title,
        article.summary,
        (article.tags ?? []).join(' '),
        article.uiRoutes?.join(' ') ?? '',
        article.sourcePaths?.backend ?? '',
        article.sourcePaths?.frontend ?? '',
        sectionsToText(article.primary),
        sectionsToText(article.secondary),
      ].join(' '),
    ),
  }));
}

/** Busca por todos os termos (AND), ignorando acentos e caixa. */
export function searchArticles(index: DocSearchIndex, query: string): DocArticle[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  return index
    .filter((entry) => terms.every((term) => entry.haystack.includes(term)))
    .map((entry) => entry.article)
    .sort((a, b) => {
      // Casamento no título vem primeiro.
      const aTitle = terms.every((t) => normalize(a.title).includes(t)) ? 0 : 1;
      const bTitle = terms.every((t) => normalize(b.title).includes(t)) ? 0 : 1;
      return aTitle - bTitle;
    });
}

export type PopulatedGroup = DocGroup & { articles: DocArticle[] };

/** Grupos que efetivamente têm artigos, na ordem declarada. */
export function getPopulatedGroups(groups: DocGroup[], articles: DocArticle[]): PopulatedGroup[] {
  return groups
    .map((group) => ({ ...group, articles: articles.filter((a) => a.group === group.id) }))
    .filter((group) => group.articles.length > 0);
}

export function findArticle(articles: DocArticle[], slug: string): DocArticle | undefined {
  return articles.find((article) => article.slug === slug);
}
