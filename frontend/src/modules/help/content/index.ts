import type { DocArticle, DocGroup } from '../../docs-kit';
import { buildSearchIndex, findArticle, searchArticles } from '../../docs-kit';
import { COMECANDO_ARTICLES } from './comecando';
import { CONTA_ARTICLES } from './conta';
import { FORMULARIOS_ARTICLES } from './formularios';
import { SOLICITACOES_ARTICLES } from './solicitacoes';

export const HELP_GROUPS: DocGroup[] = [
  {
    id: 'comecando',
    label: 'Começando',
    description: 'Se é seu primeiro contato com o sistema, comece por aqui.',
  },
  {
    id: 'formularios',
    label: 'Formulários e respostas',
    description: 'Montar o que as pessoas preenchem e trabalhar com o que elas responderam.',
  },
  {
    id: 'solicitacoes',
    label: 'Pedidos e atendimento',
    description: 'Acompanhar, atender, aprovar e cumprir prazos.',
  },
  {
    id: 'conta',
    label: 'Sua conta e quando algo dá errado',
    description: 'Acesso, avisos, permissões e as dúvidas mais frequentes.',
  },
];

export const HELP_ARTICLES: DocArticle[] = [
  ...COMECANDO_ARTICLES,
  ...FORMULARIOS_ARTICLES,
  ...SOLICITACOES_ARTICLES,
  ...CONTA_ARTICLES,
];

/** Índice construído uma única vez — o conteúdo é estático. */
const SEARCH_INDEX = buildSearchIndex(HELP_ARTICLES);

export function getHelpArticle(slug: string): DocArticle | undefined {
  return findArticle(HELP_ARTICLES, slug);
}

export function searchHelpArticles(query: string): DocArticle[] {
  return searchArticles(SEARCH_INDEX, query);
}
