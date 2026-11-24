import { DocsArticleView } from '../../docs-kit';
import { HELP_ARTICLES, HELP_GROUPS } from '../content';
import { HELP_DIAGRAMS } from '../diagrams/help-diagrams';

export function HelpArticleView() {
  return (
    <DocsArticleView
      articles={HELP_ARTICLES}
      groups={HELP_GROUPS}
      basePath="/ajuda"
      backLabel="Central de Ajuda"
      // Sem aba secundária: o manual não tem "referência técnica", e nenhum artigo
      // daqui declara `secondary` — as abas não chegam a ser renderizadas.
      tabs={{ primary: 'Passo a passo' }}
      diagrams={HELP_DIAGRAMS}
    />
  );
}
