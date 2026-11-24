import type { SidebarIconName } from './sidebar-icon';

export type MenuItem = {
  to: string;
  label: string;
  icon: SidebarIconName;
  permissions?: readonly string[];
};

export type MenuSection = {
  title: string;
  items: MenuItem[];
};

/**
 * Estrutura da navegacao lateral. Itens com `permissions` passam por
 * filterByPermission() antes de renderizar.
 */
export const menuSections: MenuSection[] = [
  {
    title: 'Operação',
    items: [
      { to: '/inicio', label: 'Início', icon: 'home' },
      { to: '/flows', label: 'Fluxos', icon: 'flows', permissions: ['flows.view'] },
    ],
  },
  {
    // "Administração" e "Apoio" tinham um item cada e gastavam duas linhas de
    // titulo para dois links.
    title: 'Sistema',
    items: [
      {
        to: '/administracao/visao-geral',
        label: 'Administração',
        icon: 'admin',
      },
      { to: '/ajuda', label: 'Central de Ajuda', icon: 'help' },
    ],
  },
];
