import type { SidebarIconName } from '../../layout/components/sidebar/sidebar-icon';

export type ModuleCardTone = 'blue' | 'orange' | 'green';

export type ModuleCardDef = {
  to: string;
  name: string;
  description: string;
  icon: SidebarIconName;
  tone: ModuleCardTone;
  permissions?: readonly string[];
};

export const MODULE_CARD_TONE_CLASSES: Record<ModuleCardTone, { bg: string; fg: string }> = {
  blue: { bg: 'bg-brand-primary-light', fg: 'text-brand-primary' },
  orange: { bg: 'bg-[#FDF1DE]', fg: 'text-[#B9770E]' },
  green: { bg: 'bg-[#EAF4EA]', fg: 'text-brand-accent' },
};

export const MODULE_CARDS: ModuleCardDef[] = [
  {
    to: '/flows',
    name: 'Fluxos',
    description: 'Crie, edite e acompanhe automações visuais.',
    icon: 'flows',
    tone: 'blue',
    permissions: ['flows.view'],
  },
  {
    to: '/flows/new',
    name: 'Novo fluxo',
    description: 'Abra o editor visual e monte um gatilho, condições e ações.',
    icon: 'flows',
    tone: 'orange',
    permissions: ['flows.manage'],
  },
  {
    to: '/administracao/webhooks',
    name: 'Webhooks',
    description: 'Gatilhos de entrada e histórico de entregas HTTP.',
    icon: 'admin',
    tone: 'green',
    permissions: ['integrations.manage_channels'],
  },
];
