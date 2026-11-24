import { DocsIndexView } from '../../../docs-kit';
import { type AdminLinkState, useAdminBackground } from '../../admin-route';
import { DOC_ARTICLES, DOC_GROUPS } from '../content';

export function AdminDocsIndexView() {
  const { background } = useAdminBackground();
  const linkState: AdminLinkState = { backgroundLocation: background ?? undefined };

  return (
    <DocsIndexView
      title="Documentação técnica"
      description="Como cada módulo do Aurora Flow funciona por dentro: regras de negócio, mapeamento de fluxos, entidades, endpoints e permissões. Blocos marcados como “ao vivo” consultam a API deste ambiente."
      articles={DOC_ARTICLES}
      groups={DOC_GROUPS}
      basePath="/administracao/documentacao"
      searchPlaceholder="Buscar em toda a documentação — ex.: idempotência, HMAC, escopo, SLA, DLQ…"
      density="compact"
      linkState={linkState}
      footer={
        <p className="text-xs text-tx-muted">
          {DOC_ARTICLES.length} artigos. O conteúdo é versionado junto com o código, em{' '}
          <code className="rounded bg-surface-container-high px-1 py-0.5 font-mono">
            frontend/src/modules/admin/docs/content
          </code>
          . Procurando o manual de uso do sistema? Ele fica na{' '}
          <a href="/ajuda" className="font-semibold text-primary">
            Central de Ajuda
          </a>
          .
        </p>
      }
    />
  );
}
