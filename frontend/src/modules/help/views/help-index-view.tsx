import { useAuth } from '../../../app/auth-context';
import { DocsIndexView } from '../../docs-kit';
import { HELP_ARTICLES, HELP_GROUPS } from '../content';

export function HelpIndexView() {
  const { hasPermission } = useAuth();
  const podeVerDocTecnica = hasPermission('system.maintenance');

  return (
    <DocsIndexView
      title="Central de Ajuda"
      description="Como fazer as coisas no Aurora Flow, em passo a passo. Se é seu primeiro contato, comece por “Como o sistema se organiza”."
      articles={HELP_ARTICLES}
      groups={HELP_GROUPS}
      basePath="/ajuda"
      searchPlaceholder="O que você precisa fazer? — ex.: publicar formulário, aprovar, exportar, prazo…"
      footer={
        <p className="text-xs text-tx-muted">
          Não encontrou o que precisava? Fale com quem administra o sistema na sua área.
          {podeVerDocTecnica ? (
            <>
              {' '}
              A documentação técnica, com o funcionamento interno de cada módulo, fica em
              Administração → Documentação.
            </>
          ) : null}
        </p>
      }
    />
  );
}
