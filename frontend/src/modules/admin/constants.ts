import type { LucideIcon } from 'lucide-react';
import {
  BarChart2,
  BookOpen,
  Database,
  KeyRound,
  LayoutDashboard,
  Layers,
  Link2,
  Network,
  ScrollText,
  Settings,
  Users,
  Webhook,
  Wrench,
} from 'lucide-react';
import { normalize } from '../docs-kit';
import { ADMIN_BASE } from './admin-route';
import type { AdminHeader } from './components/admin-modal-context';
import { DOC_ARTICLES, DOC_GROUPS, getArticle } from './docs/content';
import { SERVICES } from './service-map/topology';
import {
  resolveSettingsTab,
  SETTINGS_TABS,
  type SettingsTabDef,
} from './views/admin-settings-view';

export type AdminNavItem = {
  /** Segmento da rota sob `/administracao`. */
  to: string;
  label: string;
  icon: LucideIcon;
  permissions?: readonly string[];
  /** Subitens (so Configuracoes): as abas, com os campos para a busca. */
  children?: SettingsTabDef[];
  /** Termos extras para a busca do admin, alem do rotulo. */
  keywords?: () => string[];
  /** Cabecalho do modal quando a secao esta aberta. */
  header: AdminHeader;
};

export type AdminNavGroup = {
  title: string | null;
  items: AdminNavItem[];
};

export const adminNavGroups: AdminNavGroup[] = [
  {
    title: null,
    items: [
      {
        to: 'visao-geral',
        label: 'Visão Geral',
        icon: LayoutDashboard,
        header: {
          title: 'Visão Geral Administrativa',
          description:
            'Centralize os recursos de governança e acompanhe quais módulos já estão ativos no projeto.',
        },
      },
    ],
  },
  {
    title: 'Pessoas e acesso',
    items: [
      {
        to: 'usuarios',
        label: 'Usuários',
        icon: Users,
        header: { title: 'Usuários', description: 'Gerencie acessos e perfis.' },
      },
      {
        to: 'areas',
        label: 'Áreas',
        icon: Layers,
        header: {
          title: 'Áreas',
          description: 'Organize usuários e formulários por unidades organizacionais.',
        },
      },
      {
        to: 'permissoes',
        label: 'Permissões',
        icon: KeyRound,
        header: {
          title: 'Perfis e Permissões',
          description:
            'Crie perfis personalizados e configure exatamente o que cada um pode ver e fazer.',
        },
      },
      {
        to: 'auditoria',
        label: 'Auditoria',
        icon: ScrollText,
        header: { title: 'Auditoria', description: 'Linha do tempo de ações críticas.' },
      },
    ],
  },
  {
    title: 'Plataforma',
    items: [
      {
        to: 'configuracoes',
        label: 'Configurações',
        icon: Settings,
        children: SETTINGS_TABS,
        header: {
          kicker: 'Configurações Globais',
          title: 'Configurações',
          description: 'Parâmetros gerais do ambiente administrativo da plataforma.',
        },
      },
      {
        to: 'integracoes',
        label: 'Integrações',
        icon: Link2,
        permissions: ['integrations.manage'],
        header: {
          title: 'Integrações Externas',
          description: 'Conecte serviços externos para habilitar ações automáticas nos fluxos.',
        },
      },
      {
        // Saiu do menu lateral ("Integrações") para cá; /integracoes redireciona.
        to: 'webhooks',
        label: 'Webhooks e WhatsApp',
        icon: Webhook,
        permissions: ['integrations.manage_channels'],
        header: {
          title: 'Webhooks e WhatsApp',
          description: 'Gerencie webhooks de entrada e acompanhe o histórico das integrações HTTP.',
        },
      },
      {
        to: 'observabilidade',
        label: 'Observabilidade',
        icon: BarChart2,
        permissions: ['observability.view_metrics'],
        header: { title: 'Painel Operacional' },
      },
      {
        to: 'mapa-servicos',
        label: 'Mapa de serviços',
        icon: Network,
        permissions: ['observability.view_metrics'],
        // A busca por "rabbitmq", "postgres"... acha a seção.
        keywords: () => SERVICES.map((s) => s.id),
        header: {
          kicker: 'Infraestrutura',
          title: 'Mapa de serviços',
          description:
            'Os containers do docker-compose e como se conectam. Selecione um serviço para ver dependências e configuração.',
        },
      },
      {
        to: 'ferramentas',
        label: 'Ferramentas',
        icon: Wrench,
        permissions: ['system.maintenance'],
        header: {
          title: 'Ferramentas de Infraestrutura',
          description:
            'Acesso rápido aos serviços externos do sistema. Configure as URLs no arquivo .env do frontend.',
        },
      },
      {
        to: 'erp',
        label: 'ERP',
        icon: Database,
        permissions: ['integrations.manage'],
        header: {
          title: 'Conectores ERP',
          description: 'Gerencie integrações com ERPs internos via Bearer Token.',
        },
      },
    ],
  },
  {
    title: 'Suporte',
    items: [
      {
        to: 'documentacao',
        label: 'Documentação',
        icon: BookOpen,
        keywords: () => DOC_ARTICLES.map((a) => a.title),
        header: {
          title: 'Documentação técnica',
          description:
            'Como cada módulo do Aurora Flow funciona por dentro: regras de negócio, mapeamento de fluxos, entidades, endpoints e permissões. Blocos marcados como “ao vivo” consultam a API deste ambiente.',
        },
      },
    ],
  },
];

export function adminPath(to: string): string {
  return `${ADMIN_BASE}/${to}`;
}

/** Segmento da secao na URL: `/administracao/documentacao/x` -> `documentacao`. */
export function adminSectionOf(pathname: string): string {
  return pathname.slice(ADMIN_BASE.length + 1).split('/')[0] ?? '';
}

const allItems = adminNavGroups.flatMap((g) => g.items);

/** Cabecalho do modal para a URL atual. Views com texto dinamico sobrescrevem. */
export function adminSectionHeader(pathname: string, search: string): AdminHeader {
  const section = adminSectionOf(pathname);
  const item = allItems.find((i) => i.to === section) ?? allItems[0];

  if (section === 'configuracoes') {
    return { ...item.header, title: resolveSettingsTab(search).label };
  }

  if (section === 'documentacao') {
    const slug = pathname.split('/')[3];
    const article = slug ? getArticle(slug) : undefined;
    if (article) {
      return {
        kicker: DOC_GROUPS.find((g) => g.id === article.group)?.label,
        title: article.title,
        description: article.summary,
      };
    }
  }

  return item.header;
}

// ─── Busca da nav lateral ─────────────────────────────────────────────────────

export type AdminNavMatch = {
  item: AdminNavItem;
  /** Subitens a exibir; com busca, so os que casaram (ou todos, se o pai casou). */
  children: SettingsTabDef[];
};

export type AdminNavGroupMatch = {
  title: string | null;
  matches: AdminNavMatch[];
};

/**
 * Um item casa pelo rotulo ou por uma keyword; Configuracoes casa tambem pelos
 * rotulos das abas e dos campos ("senha" -> Seguranca). Ignora acento e caixa.
 * Grupos sem item visivel somem.
 */
export function filterAdminNav(groups: AdminNavGroup[], query: string): AdminNavGroupMatch[] {
  const q = normalize(query.trim());

  return groups
    .map((group) => ({
      title: group.title,
      matches: group.items.flatMap<AdminNavMatch>((item) => {
        const kids = item.children ?? [];
        if (!q) return [{ item, children: kids }];

        const selfMatch =
          normalize(item.label).includes(q) ||
          (item.keywords?.() ?? []).some((k) => normalize(k).includes(q));
        const kidMatch = kids.filter(
          (t) =>
            normalize(t.label).includes(q) || t.fields.some((f) => normalize(f.label).includes(q)),
        );

        if (!selfMatch && kidMatch.length === 0) return [];
        return [{ item, children: selfMatch ? kids : kidMatch }];
      }),
    }))
    .filter((group) => group.matches.length > 0);
}
