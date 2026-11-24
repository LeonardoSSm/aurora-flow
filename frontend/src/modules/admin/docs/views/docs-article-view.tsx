import { DocsArticleView } from '../../../docs-kit';
import { type AdminLinkState, useAdminBackground } from '../../admin-route';
import { useAdminModal } from '../../components/admin-modal-context';
import { DocLiveBlock } from '../components/doc-live-block';
import { DOC_ARTICLES, DOC_GROUPS } from '../content';
import { TECHNICAL_DIAGRAMS } from '../diagrams/diagram-defs';
import type { DocLiveSource } from '../hooks/use-docs-live';

export function AdminDocsArticleView() {
  const modal = useAdminModal();
  const { background } = useAdminBackground();
  const linkState: AdminLinkState = { backgroundLocation: background ?? undefined };

  return (
    <DocsArticleView
      articles={DOC_ARTICLES}
      groups={DOC_GROUPS}
      basePath="/administracao/documentacao"
      backLabel="Documentação"
      tabs={{ primary: 'Como funciona', secondary: 'Referência técnica' }}
      showSourcePaths
      diagrams={TECHNICAL_DIAGRAMS}
      density="compact"
      scrollContainerRef={modal?.scrollRef}
      linkState={linkState}
      renderLive={(block) => (
        <DocLiveBlock
          source={block.source as DocLiveSource}
          title={block.title}
          description={block.description}
        />
      )}
    />
  );
}
