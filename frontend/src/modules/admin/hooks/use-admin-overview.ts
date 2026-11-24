import type { LucideIcon } from 'lucide-react';
import { KeyRound, ScrollText, Settings, Users } from 'lucide-react';
import { useMemo } from 'react';

export type AdminFeature = {
  title: string;
  description: string;
  status: 'ativo' | 'planejado';
  href: string;
  icon: LucideIcon;
};

export function useAdminOverview() {
  const features = useMemo<AdminFeature[]>(
    () => [
      {
        title: 'Gestão de Usuários',
        description: 'Controle de contas, bloqueios e políticas de acesso.',
        status: 'ativo',
        href: '/administracao/usuarios',
        icon: Users,
      },
      {
        title: 'Papéis e Permissões',
        description: 'Perfis administrativos com escopos de acesso por módulo.',
        status: 'ativo',
        href: '/administracao/permissoes',
        icon: KeyRound,
      },
      {
        title: 'Auditoria',
        description: 'Rastreamento de ações críticas e eventos de segurança.',
        status: 'ativo',
        href: '/administracao/auditoria',
        icon: ScrollText,
      },
      {
        title: 'Configurações Globais',
        description: 'Parâmetros da plataforma, integrações e compliance.',
        status: 'ativo',
        href: '/administracao/configuracoes',
        icon: Settings,
      },
    ],
    [],
  );

  return { features };
}
