export type PermissionScope = 'none' | 'own' | 'assigned' | 'area' | 'all';

export interface PermissionDefinition {
  code: string;
  module: string;
  action: string;
  label: string;
  /** false = permissão booleana pura (sem seletor de escopo na UI; grant = 'all', deny = 'none') */
  scopable: boolean;
  /**
   * 'system' = vale na plataforma e vem do perfil. 'process' = decidida no vínculo da pessoa com
   * cada processo (ver process-permission-catalog.ts); a linha do perfil deixou de ser lida.
   */
  level: 'system' | 'process';
}

const ROLE_PERMISSIONS: Array<Omit<PermissionDefinition, 'level'>> = [
  { code: 'forms.view', module: 'forms', action: 'view', label: 'Visualizar formulários', scopable: true },
  { code: 'forms.create', module: 'forms', action: 'create', label: 'Criar formulários', scopable: false },
  { code: 'forms.edit', module: 'forms', action: 'edit', label: 'Editar formulários', scopable: true },
  {
    code: 'forms.publish',
    module: 'forms',
    action: 'publish',
    label: 'Publicar/arquivar formulários',
    scopable: true,
  },
  { code: 'responses.view', module: 'responses', action: 'view', label: 'Visualizar respostas', scopable: true },
  {
    code: 'responses.view_detail',
    module: 'responses',
    action: 'view_detail',
    label: 'Ver detalhe de uma resposta por ID',
    scopable: false,
  },
  {
    code: 'responses.export',
    module: 'responses',
    action: 'export',
    label: 'Exportar respostas',
    scopable: false,
  },
  {
    code: 'responses.view_sensitive',
    module: 'responses',
    action: 'view_sensitive',
    label: 'Ver campos sensíveis',
    scopable: false,
  },
  {
    code: 'solicitations.view',
    module: 'solicitations',
    action: 'view',
    label: 'Visualizar solicitações',
    scopable: true,
  },
  {
    code: 'solicitations.manage',
    module: 'solicitations',
    action: 'manage',
    label: 'Criar/mover/editar solicitações',
    scopable: true,
  },
  {
    code: 'solicitations.regenerate_token',
    module: 'solicitations',
    action: 'regenerate_token',
    label: 'Regenerar token de rastreamento',
    scopable: false,
  },
  {
    code: 'comments.view_internal',
    module: 'comments',
    action: 'view_internal',
    label: 'Ver comentários internos',
    scopable: false,
  },
  { code: 'flows.view', module: 'flows', action: 'view', label: 'Visualizar fluxos', scopable: false },
  {
    code: 'flows.manage',
    module: 'flows',
    action: 'manage',
    label: 'Criar/editar/executar fluxos',
    scopable: false,
  },
  { code: 'analytics.view', module: 'analytics', action: 'view', label: 'Visualizar analytics', scopable: true },
  {
    // Ver o painel segue `analytics.view` — quem já enxerga o analytics de um
    // formulário continua enxergando depois que o painel o substituir. Esta
    // permissão governa só quem monta.
    code: 'dashboards.manage',
    module: 'dashboards',
    action: 'manage',
    label: 'Montar painéis de indicadores',
    scopable: false,
  },
  {
    code: 'approvals.decide',
    module: 'approvals',
    action: 'decide',
    label: 'Decidir aprovações',
    scopable: true,
  },
  {
    code: 'approvals.manage',
    module: 'approvals',
    action: 'manage',
    label: 'Criar/cancelar aprovações',
    scopable: false,
  },
  { code: 'areas.manage', module: 'areas', action: 'manage', label: 'Gerenciar áreas', scopable: false },
  { code: 'users.manage', module: 'users', action: 'manage', label: 'Gerenciar usuários', scopable: false },
  {
    code: 'roles.manage',
    module: 'roles',
    action: 'manage',
    label: 'Gerenciar perfis e permissões',
    scopable: false,
  },
  {
    code: 'settings.manage',
    module: 'settings',
    action: 'manage',
    label: 'Gerenciar configurações',
    scopable: false,
  },
  {
    code: 'attachments.upload',
    module: 'attachments',
    action: 'upload',
    label: 'Enviar e excluir os próprios anexos',
    scopable: false,
  },
  {
    code: 'attachments.manage_all',
    module: 'attachments',
    action: 'manage_all',
    label: 'Ver/excluir todos os anexos',
    scopable: false,
  },
  {
    code: 'integrations.manage',
    module: 'integrations',
    action: 'manage',
    label: 'Gerenciar conectores/templates ERP',
    scopable: false,
  },
  {
    code: 'integrations.view_logs',
    module: 'integrations',
    action: 'view_logs',
    label: 'Ver logs/saúde de integrações ERP',
    scopable: false,
  },
  {
    code: 'integrations.manage_channels',
    module: 'integrations',
    action: 'manage_channels',
    label: 'Gerenciar WhatsApp/Webhooks/Conectores de formulário',
    scopable: false,
  },
  {
    code: 'automations.manage',
    module: 'automations',
    action: 'manage',
    label: 'Gerenciar automações',
    scopable: false,
  },
  { code: 'audit.view', module: 'audit', action: 'view', label: 'Ver auditoria', scopable: false },
  {
    code: 'reports.view',
    module: 'reports',
    action: 'view',
    label: 'Ver relatórios executivos',
    scopable: false,
  },
  {
    code: 'dashboard.view_org',
    module: 'dashboard',
    action: 'view_org',
    label: 'Ver blocos organizacionais do dashboard',
    scopable: false,
  },
  // `dashboard.view_forms_stats` saiu (migration 1790900000000): o resumo do Início segue o vínculo
  // com cada processo — processos por vínculo, respostas por "ver respostas" no processo.
  {
    code: 'observability.view_metrics',
    module: 'observability',
    action: 'view_metrics',
    label: 'Ver resumo de métricas administrativas',
    scopable: false,
  },
  {
    code: 'kanban_phases.manage',
    module: 'kanban_phases',
    action: 'manage',
    label: 'Configurar fases do Kanban',
    scopable: false,
  },
  {
    code: 'standard_questions.manage',
    module: 'standard_questions',
    action: 'manage',
    label: 'Configurar perguntas padrão das solicitações',
    scopable: false,
  },
  {
    code: 'ai.copilot.use',
    module: 'ai',
    action: 'use',
    label: 'Criar processos pela LOPS IA (assistente de processos)',
    scopable: false,
  },
  {
    code: 'system.maintenance',
    module: 'system',
    action: 'maintenance',
    label: 'Executar operações de manutenção (sync Google, SLA manual, seed de demo)',
    scopable: false,
  },
  {
    code: 'item_lists.manage',
    module: 'item_lists',
    action: 'manage',
    label: 'Criar e editar listas de itens (catálogo usado nos campos de seleção)',
    scopable: false,
  },
  {
    code: 'processes.full_access',
    module: 'processes',
    action: 'full_access',
    label: 'Acesso total a todos os processos (sem precisar de vínculo)',
    scopable: false,
  },
];

/**
 * Códigos que viraram permissão do vínculo pessoa × processo. Continuam no catálogo do perfil só para
 * a migration ler o que cada perfil tinha; o perfil não decide mais nada sobre eles.
 */
export const PROCESS_LEVEL_ROLE_CODES = new Set([
  'forms.view',
  'forms.edit',
  'forms.publish',
  'responses.view',
  'responses.view_detail',
  'responses.export',
  'responses.view_sensitive',
  'solicitations.view',
  'solicitations.manage',
  'solicitations.regenerate_token',
  'comments.view_internal',
  'analytics.view',
  'approvals.manage',
  'attachments.upload',
  'attachments.manage_all',
  'automations.manage',
  'kanban_phases.manage',
  'standard_questions.manage',
]);

export const PERMISSION_CATALOG: PermissionDefinition[] = ROLE_PERMISSIONS.map((permission) => ({
  ...permission,
  level: PROCESS_LEVEL_ROLE_CODES.has(permission.code) ? 'process' : 'system',
}));

/** O que a tela de perfis mostra e grava: só o que o perfil ainda decide. */
export const SYSTEM_PERMISSION_CATALOG = PERMISSION_CATALOG.filter((p) => p.level === 'system');

export const PERMISSION_CODES = new Set(PERMISSION_CATALOG.map((p) => p.code));

/** Códigos que a tela de perfis ainda grava: os de sistema. */
export const SYSTEM_PERMISSION_CODES = new Set(SYSTEM_PERMISSION_CATALOG.map((p) => p.code));
