import type { LucideIcon } from 'lucide-react';

/**
 * Modelo de conteúdo compartilhado pelas duas documentações do sistema:
 * a técnica (Administração → Documentação) e o manual do usuário (Ajuda).
 *
 * O kit é deliberadamente neutro: não conhece rota, permissão nem serviço de API.
 * Quem consome informa a base da rota, o catálogo de artigos, os diagramas e — se
 * quiser blocos com dados ao vivo — como renderizá-los.
 */

export type DocCalloutTone = 'info' | 'warning' | 'danger' | 'success';

export type DocEndpoint = {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  description: string;
  /** Código de permissão exigido pelo guard, quando houver. */
  permission?: string;
  /** Rota sem JWT (webhooks de entrada, formulário público, rastreamento). */
  public?: boolean;
  /** Limite de requisições específico da rota, quando difere do global. */
  rateLimit?: string;
  note?: string;
};

export type DocEntityColumn = {
  name: string;
  type: string;
  note?: string;
};

export type DocEntity = {
  /** Nome da tabela no PostgreSQL. */
  table: string;
  /** Nome da classe TypeORM. */
  entity: string;
  description: string;
  columns?: DocEntityColumn[];
};

export type DocBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[]; ordered?: boolean }
  | { kind: 'steps'; steps: Array<{ title: string; text: string }> }
  | { kind: 'callout'; tone: DocCalloutTone; title?: string; text: string }
  | { kind: 'code'; code: string; caption?: string }
  | { kind: 'table'; columns: string[]; rows: string[][]; caption?: string }
  | { kind: 'endpoints'; items: DocEndpoint[] }
  | { kind: 'entities'; items: DocEntity[] }
  | { kind: 'events'; emits?: string[]; listens?: string[] }
  /** `id` é resolvido no catálogo de diagramas que o consumidor passa ao renderizador. */
  | { kind: 'diagram'; id: string; caption?: string }
  /** `source` é interpretado pelo `renderLive` do consumidor; o kit não conhece API. */
  | { kind: 'live'; source: string; title?: string; description?: string }
  | { kind: 'files'; items: Array<{ path: string; note?: string }> };

/** Uma seção com título dentro de uma aba do artigo. */
export type DocSection = {
  id: string;
  title: string;
  blocks: DocBlock[];
};

export type DocArticle = {
  slug: string;
  title: string;
  /** Id de um grupo declarado pelo consumidor. */
  group: string;
  icon: LucideIcon;
  /** Uma linha, exibida nos cards do índice e nos resultados de busca. */
  summary: string;
  /** Termos extras para a busca (siglas, nomes de arquivo, sinônimos). */
  tags?: string[];
  /** Caminhos-raiz no repositório, exibidos no cabeçalho do artigo. */
  sourcePaths?: { backend?: string; frontend?: string };
  /** Rotas da UI que este artigo atende. */
  uiRoutes?: string[];
  /**
   * Permissão necessária para executar o que o artigo descreve. Não esconde o
   * artigo — apenas avisa, para que quem não consegue fazer a tarefa entenda o
   * motivo em vez de achar que a tela está quebrada.
   */
  requiresPermission?: { code: string; label: string };
  /** Aba primária. Na doc técnica é "Como funciona"; no manual, o passo a passo. */
  primary: DocSection[];
  /** Aba secundária, opcional. Na doc técnica é a "Referência técnica". */
  secondary?: DocSection[];
};

export type DocGroup = {
  id: string;
  label: string;
  description: string;
};

/** Rótulos das abas do artigo. A secundária só aparece se o artigo a tiver. */
export type DocTabLabels = {
  primary: string;
  secondary?: string;
};
