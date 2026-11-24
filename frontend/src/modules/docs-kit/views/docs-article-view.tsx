import { type RefObject, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FolderGit2, Lock, Route } from 'lucide-react';
import { DocBlockView, type DocBlockContext } from '../components/doc-blocks';
import { findArticle } from '../search';
import type { DocArticle, DocGroup, DocSection, DocTabLabels } from '../types';

type DocsArticleViewProps = DocBlockContext & {
  articles: DocArticle[];
  groups: DocGroup[];
  /** Prefixo das rotas dos artigos, sem barra final. */
  basePath: string;
  /** Rótulo do link de volta ao índice. */
  backLabel: string;
  tabs: DocTabLabels;
  /** Exibe os caminhos de código no cabeçalho. Faz sentido na doc técnica, não no manual. */
  showSourcePaths?: boolean;
  /**
   * Container que rola o artigo quando ele não é a janela (modal de Administração).
   * "Nesta página" rola esse container em vez de usar âncoras da janela.
   */
  scrollContainerRef?: RefObject<HTMLElement>;
  /** Estado repassado ao link de volta (ex.: a página por trás do modal). */
  linkState?: unknown;
};

function SectionList({
  sections,
  context,
}: {
  sections: DocSection[];
  context: DocBlockContext;
}) {
  const isCompact = context.density === 'compact';

  if (sections.length === 0) {
    return (
      <p
        className={
          isCompact
            ? 'rounded-[10px] bg-bg-s2 p-3.5 text-[13px] text-tx-secondary'
            : 'rounded-2xl bg-surface-container-lowest p-4 text-sm text-tx-secondary'
        }
      >
        Sem conteúdo nesta aba para este artigo.
      </p>
    );
  }

  return (
    <div className={isCompact ? 'grid min-w-0 grid-cols-1 gap-7' : 'grid gap-8'}>
      {sections.map((section) => (
        <section
          key={section.id}
          id={section.id}
          className={isCompact ? 'grid min-w-0 grid-cols-1 gap-3' : 'grid gap-3 scroll-mt-4'}
        >
          <h2
            className={
              isCompact
                ? 'text-base font-extrabold tracking-[-0.01em] text-tx-primary'
                : 'text-lg font-extrabold tracking-tight text-tx-primary'
            }
          >
            {section.title}
          </h2>
          {section.blocks.map((block, index) => (
            <DocBlockView key={index} block={block} {...context} />
          ))}
        </section>
      ))}
    </div>
  );
}

export function DocsArticleView({
  articles,
  groups,
  basePath,
  backLabel,
  tabs,
  showSourcePaths = false,
  diagrams,
  renderLive,
  density = 'default',
  scrollContainerRef,
  linkState,
}: DocsArticleViewProps) {
  const { slug } = useParams<{ slug: string }>();
  const [showSecondary, setShowSecondary] = useState(false);
  const article = slug ? findArticle(articles, slug) : undefined;

  if (!article) {
    return (
      <section className="grid gap-4">
        <p className="rounded-2xl bg-surface-container-lowest p-6 text-center">
          <span className="block font-bold text-tx-primary">Artigo não encontrado.</span>
          <Link
            to={basePath}
            state={linkState}
            className="mt-2 inline-block text-sm font-semibold text-primary"
          >
            Voltar para o índice
          </Link>
        </p>
      </section>
    );
  }

  const Icon = article.icon;
  const group = groups.find((g) => g.id === article.group);
  const hasSecondary = Boolean(article.secondary?.length && tabs.secondary);
  const sections = showSecondary && hasSecondary ? (article.secondary ?? []) : article.primary;
  const context: DocBlockContext = { diagrams, renderLive, density };
  const paths = showSourcePaths ? article.sourcePaths : undefined;
  const tabItems = [
    { id: 'primary' as const, label: tabs.primary },
    { id: 'secondary' as const, label: tabs.secondary as string },
  ];

  if (density === 'compact') {
    // Título, resumo e grupo vão para o cabeçalho do modal; aqui fica o resto.
    const scrollToSection = (id: string) => {
      const container = scrollContainerRef?.current;
      const target = document.getElementById(id);
      if (!target) return;
      if (container) {
        container.scrollTo({ top: target.offsetTop - 8, behavior: 'smooth' });
      } else {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };

    return (
      <section className="grid min-w-0 grid-cols-1 gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to={basePath}
            state={linkState}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-tx-secondary transition-colors hover:text-tx-primary"
          >
            <ArrowLeft className="h-[15px] w-[15px]" />
            {backLabel}
          </Link>

          {hasSecondary ? (
            <div
              role="tablist"
              aria-label="Abas do artigo"
              className="ml-auto flex gap-0.5 rounded-lg bg-bg-s3 p-0.5"
            >
              {tabItems.map((tab) => {
                const isActive = (tab.id === 'secondary') === showSecondary;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setShowSecondary(tab.id === 'secondary')}
                    className={[
                      'rounded-md px-2.5 py-1 text-[12.5px] font-semibold transition-colors',
                      isActive ? 'bg-bg-surface text-primary shadow-sm' : 'text-tx-secondary',
                    ].join(' ')}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        {article.requiresPermission ? (
          <p className="flex items-start gap-2 rounded-[10px] bg-bg-s2 px-3 py-2.5 text-[13px] text-tx-secondary">
            <Lock className="mt-0.5 h-[15px] w-[15px] shrink-0 text-tx-muted" />
            <span>
              Esta tarefa exige a permissão{' '}
              <strong className="font-semibold text-tx-primary">
                {article.requiresPermission.label}
              </strong>
              . Se os botões descritos aqui não aparecerem para você, é porque seu perfil não a tem
              — fale com um administrador.
            </span>
          </p>
        ) : null}

        {paths || article.uiRoutes?.length ? (
          <div className="grid gap-1 rounded-[10px] bg-bg-s2 px-3 py-2.5">
            {paths?.backend ? (
              <p className="flex flex-wrap items-baseline gap-1.5 text-xs text-tx-secondary">
                <FolderGit2 className="h-[13px] w-[13px] shrink-0 self-center" />
                <span className="font-semibold">Backend:</span>
                <code className="break-all font-mono">{paths.backend}</code>
              </p>
            ) : null}
            {paths?.frontend ? (
              <p className="flex flex-wrap items-baseline gap-1.5 text-xs text-tx-secondary">
                <FolderGit2 className="h-[13px] w-[13px] shrink-0 self-center" />
                <span className="font-semibold">Frontend:</span>
                <code className="break-all font-mono">{paths.frontend}</code>
              </p>
            ) : null}
            {article.uiRoutes?.length ? (
              <p className="flex flex-wrap items-baseline gap-1.5 text-xs text-tx-secondary">
                <Route className="h-[13px] w-[13px] shrink-0 self-center" />
                <span className="font-semibold">Telas:</span>
                <code className="break-all font-mono">{article.uiRoutes.join('  ·  ')}</code>
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-[minmax(0,1fr)_168px]">
          <SectionList sections={sections} context={context} />

          {sections.length > 1 ? (
            <nav
              aria-label="Nesta página"
              className="sticky top-0 hidden gap-0.5 pt-0.5 md:grid"
            >
              <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-tx-muted">
                Nesta página
              </p>
              {sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  onClick={(event) => {
                    event.preventDefault();
                    scrollToSection(section.id);
                  }}
                  className="rounded-md px-2 py-1 text-[12.5px] font-medium leading-[1.35] text-tx-secondary transition-colors hover:bg-bg-s3 hover:text-primary"
                >
                  {section.title}
                </a>
              ))}
            </nav>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="grid gap-5">
      <Link
        to={basePath}
        className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-tx-secondary transition-colors hover:text-tx-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </Link>

      <header className="grid gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </span>
          <div className="min-w-0">
            {group ? (
              <p className="text-[11px] font-bold uppercase tracking-wider text-tx-secondary">
                {group.label}
              </p>
            ) : null}
            <h1 className="text-2xl font-extrabold tracking-tight text-tx-primary md:text-3xl">
              {article.title}
            </h1>
            <p className="mt-1 text-[15px] text-tx-secondary">{article.summary}</p>
          </div>
        </div>

        {article.requiresPermission ? (
          <p className="flex items-start gap-2 rounded-xl bg-surface-container-low p-3 text-sm text-tx-secondary">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-tx-muted" />
            <span>
              Esta tarefa exige a permissão{' '}
              <strong className="font-semibold text-tx-primary">
                {article.requiresPermission.label}
              </strong>
              . Se os botões descritos aqui não aparecerem para você, é porque seu perfil não a tem
              — fale com um administrador.
            </span>
          </p>
        ) : null}

        {paths || article.uiRoutes?.length ? (
          <div className="grid gap-1.5 rounded-2xl bg-surface-container-low p-3">
            {paths?.backend ? (
              <p className="flex flex-wrap items-baseline gap-2 text-xs text-tx-secondary">
                <FolderGit2 className="h-3.5 w-3.5 shrink-0 translate-y-0.5" />
                <span className="font-semibold">Backend:</span>
                <code className="break-all font-mono">{paths.backend}</code>
              </p>
            ) : null}
            {paths?.frontend ? (
              <p className="flex flex-wrap items-baseline gap-2 text-xs text-tx-secondary">
                <FolderGit2 className="h-3.5 w-3.5 shrink-0 translate-y-0.5" />
                <span className="font-semibold">Frontend:</span>
                <code className="break-all font-mono">{paths.frontend}</code>
              </p>
            ) : null}
            {article.uiRoutes?.length ? (
              <p className="flex flex-wrap items-baseline gap-2 text-xs text-tx-secondary">
                <Route className="h-3.5 w-3.5 shrink-0 translate-y-0.5" />
                <span className="font-semibold">Telas:</span>
                <code className="break-all font-mono">{article.uiRoutes.join('  ·  ')}</code>
              </p>
            ) : null}
          </div>
        ) : null}
      </header>

      {hasSecondary ? (
        <div className="flex flex-wrap gap-2">
          {tabItems.map((tab) => {
            const isActive = (tab.id === 'secondary') === showSecondary;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setShowSecondary(tab.id === 'secondary')}
                className={[
                  'rounded-xl px-3 py-2 text-sm font-semibold transition-colors',
                  isActive
                    ? 'bg-primary text-white'
                    : 'bg-surface-container-low text-tx-primary hover:bg-surface-container-high',
                ].join(' ')}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {sections.length > 1 ? (
        <nav className="flex flex-wrap gap-x-4 gap-y-1 rounded-2xl bg-surface-container-low px-3 py-2">
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="text-xs font-semibold text-tx-secondary transition-colors hover:text-primary"
            >
              {section.title}
            </a>
          ))}
        </nav>
      ) : null}

      <SectionList sections={sections} context={context} />
    </section>
  );
}
