import type { DocArticle, DocGroup } from '../../../docs-kit';
import { buildSearchIndex, findArticle, searchArticles } from '../../../docs-kit';
import { FLOWS_ARTICLE } from './flows';
import { FORMULARIOS_ARTICLES } from './formularios';
import { FUNDAMENTOS_ARTICLES } from './fundamentos';
import { GOVERNANCA_ARTICLES } from './governanca';
import { INTEGRACOES_ARTICLES } from './integracoes';
import { PROCESSOS_ARTICLES } from './processos';
import { QUALIDADE_ARTICLES } from './qualidade';

export const DOC_GROUPS: DocGroup[] = [
  {
    id: 'fundamentos',
    label: 'Fundamentos',
    description: 'Como o sistema é construído: arquitetura, segurança, dados e operação.',
  },
  {
    id: 'formularios',
    label: 'Formulários e respostas',
    description: 'Da criação do formulário à resposta, com fases, automações e conectores.',
  },
  {
    id: 'processos',
    label: 'Processos',
    description: 'Solicitações, SLA, aprovações, anexos e comunicação.',
  },
  {
    id: 'automacao',
    label: 'Automação',
    description: 'O motor de fluxos que amarra tudo.',
  },
  {
    id: 'integracoes',
    label: 'Integrações',
    description: 'Webhooks, ERP, WhatsApp e Google Workspace.',
  },
  {
    id: 'governanca',
    label: 'Governança e administração',
    description: 'Usuários, áreas, configurações, auditoria e manutenção.',
  },
  {
    id: 'qualidade',
    label: 'Qualidade e testes',
    description: 'O que está coberto por teste automatizado, onde cada suíte mora e como rodar.',
  },
];

export const DOC_ARTICLES: DocArticle[] = [
  ...FUNDAMENTOS_ARTICLES,
  ...FORMULARIOS_ARTICLES,
  ...PROCESSOS_ARTICLES,
  FLOWS_ARTICLE,
  ...INTEGRACOES_ARTICLES,
  ...GOVERNANCA_ARTICLES,
  ...QUALIDADE_ARTICLES,
];

/** Índice construído uma única vez — o conteúdo é estático. */
const SEARCH_INDEX = buildSearchIndex(DOC_ARTICLES);

export function getArticle(slug: string): DocArticle | undefined {
  return findArticle(DOC_ARTICLES, slug);
}

export function searchTechnicalArticles(query: string): DocArticle[] {
  return searchArticles(SEARCH_INDEX, query);
}
