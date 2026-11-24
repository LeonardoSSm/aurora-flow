import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { SectionHeader } from '../../../components/ui';
import type { DocDensity } from '../components/doc-table';
import { buildSearchIndex, getPopulatedGroups, searchArticles } from '../search';
import type { DocArticle, DocGroup } from '../types';

type DocsIndexViewProps = {
  title: string;
  description: string;
  articles: DocArticle[];
  groups: DocGroup[];
  /** Prefixo das rotas dos artigos, sem barra final. Ex.: `/ajuda`. */
  basePath: string;
  searchPlaceholder: string;
  /** Rodapé opcional, para nota de manutenção ou link cruzado entre as documentações. */
  footer?: React.ReactNode;
  /**
   * `compact`: índice dentro do modal de Administração. Sem o SectionHeader (título
   * e descrição vão para o cabeçalho do modal) e artigos em linhas compactas.
   */
  density?: DocDensity;
  /** Estado repassado aos links dos artigos (ex.: a página por trás do modal). */
  linkState?: unknown;
};

const INDEX_STYLE = {
  default: {
    root: 'grid gap-6',
    searchWrap: 'relative',
    searchIcon:
      'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tx-muted',
    search:
      'w-full rounded-2xl bg-surface-container-lowest py-3 pl-10 pr-10 text-sm text-tx-primary shadow-soft outline-none placeholder:text-tx-ph focus:ring-2 focus:ring-primary/40',
    clear:
      'absolute right-3 top-1/2 -translate-y-1/2 text-tx-muted transition-colors hover:text-tx-primary',
    resultsWrap: 'grid gap-3',
    resultsCount: 'text-sm font-semibold text-tx-secondary',
    groups: 'grid gap-8',
    group: '',
    groupHead: '',
    groupTitle: 'text-sm font-bold uppercase tracking-wider text-tx-secondary',
    groupText: 'mb-3 mt-0.5 text-sm text-tx-secondary',
    grid: 'grid gap-3 md:grid-cols-2',
    card: 'flex gap-3 rounded-2xl bg-surface-container-lowest p-4 shadow-soft transition-shadow hover:shadow-md',
    cardIconBox: 'mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10',
    cardIcon: 'h-[18px] w-[18px] text-primary',
    cardBody: 'min-w-0',
    cardTitle: 'block font-bold text-tx-primary',
    cardSummary: 'mt-0.5 block text-sm leading-snug text-tx-secondary',
  },
  compact: {
    root: 'grid gap-6',
    searchWrap:
      'relative flex h-9 items-center gap-2 rounded-lg border border-border-default bg-bg-surface px-2.5 text-tx-muted transition-colors focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/15',
    searchIcon: 'pointer-events-none h-[15px] w-[15px] shrink-0',
    search:
      'min-w-0 flex-1 border-0 bg-transparent text-[13px] text-tx-primary outline-none placeholder:text-tx-ph',
    clear: 'shrink-0 text-tx-muted transition-colors hover:text-tx-primary',
    resultsWrap: 'grid gap-2.5',
    resultsCount: 'text-[13px] font-semibold text-tx-secondary',
    groups: 'grid gap-6',
    group: 'grid gap-2.5',
    groupHead: 'grid gap-0.5',
    groupTitle: 'text-[11px] font-bold uppercase tracking-[0.08em] text-tx-secondary',
    groupText: 'text-[12.5px] text-tx-muted',
    grid: 'grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2',
    card: 'flex items-start gap-2.5 rounded-[10px] border border-border-default bg-bg-surface px-3 py-2.5 transition-colors hover:border-border-strong hover:bg-bg-s2',
    cardIconBox: 'grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10',
    cardIcon: 'h-[15px] w-[15px] text-primary',
    cardBody: 'grid min-w-0 gap-px',
    cardTitle: 'block text-[13.5px] font-bold text-tx-primary',
    cardSummary: 'block text-[12.5px] leading-[1.4] text-tx-secondary',
  },
} as const;

type IndexStyle = (typeof INDEX_STYLE)[DocDensity];

function ArticleCard({
  article,
  basePath,
  linkState,
  s,
}: {
  article: DocArticle;
  basePath: string;
  linkState?: unknown;
  s: IndexStyle;
}) {
  const Icon = article.icon;
  return (
    <Link to={`${basePath}/${article.slug}`} state={linkState} className={s.card}>
      <span className={s.cardIconBox}>
        <Icon className={s.cardIcon} />
      </span>
      <span className={s.cardBody}>
        <span className={s.cardTitle}>{article.title}</span>
        <span className={s.cardSummary}>{article.summary}</span>
      </span>
    </Link>
  );
}

export function DocsIndexView({
  title,
  description,
  articles,
  groups,
  basePath,
  searchPlaceholder,
  footer,
  density = 'default',
  linkState,
}: DocsIndexViewProps) {
  const [query, setQuery] = useState('');
  const index = useMemo(() => buildSearchIndex(articles), [articles]);
  const populated = useMemo(() => getPopulatedGroups(groups, articles), [groups, articles]);
  const results = useMemo(
    () => (query.trim() ? searchArticles(index, query) : null),
    [index, query],
  );
  const s = INDEX_STYLE[density];
  const isCompact = density === 'compact';

  return (
    <section className={s.root}>
      {isCompact ? null : (
        <SectionHeader title={title} description={description} className="md:items-start" />
      )}

      <div className={s.searchWrap}>
        <Search className={s.searchIcon} />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={isCompact ? 'Buscar na documentação' : undefined}
          className={s.search}
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Limpar busca"
            className={s.clear}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {results ? (
        <div className={s.resultsWrap}>
          <p className={s.resultsCount}>
            {results.length === 0
              ? 'Nenhum artigo corresponde à busca.'
              : `${results.length} ${results.length === 1 ? 'artigo encontrado' : 'artigos encontrados'}`}
          </p>
          <div className={s.grid}>
            {results.map((article) => (
              <ArticleCard
                key={article.slug}
                article={article}
                basePath={basePath}
                linkState={linkState}
                s={s}
              />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className={s.groups}>
            {populated.map((group) => (
              <div key={group.id} className={s.group || undefined}>
                <div className={s.groupHead || undefined}>
                  <h2 className={s.groupTitle}>{group.label}</h2>
                  <p className={s.groupText}>{group.description}</p>
                </div>
                <div className={s.grid}>
                  {group.articles.map((article) => (
                    <ArticleCard
                      key={article.slug}
                      article={article}
                      basePath={basePath}
                      linkState={linkState}
                      s={s}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          {footer}
        </>
      )}
    </section>
  );
}
