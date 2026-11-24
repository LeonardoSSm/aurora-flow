/**
 * Permissões do vínculo pessoa × processo.
 *
 * Quem tem vínculo com um processo vê o processo (é o que o vínculo significa). O que mais ela pode
 * fazer nele vem desta lista, marcada pessoa a pessoa, processo a processo. O perfil continua
 * decidindo só o que é da plataforma (ver PERMISSION_CATALOG, nível 'system').
 */

/** 'own' só existe em "ver solicitações": só os cards que a pessoa abriu ou dos quais é responsável. */
export type ProcessPermissionScope = 'all' | 'own';

export interface ProcessPermissionDefinition {
  code: string;
  group: ProcessPermissionGroup;
  label: string;
  /** Escopos que a tela oferece. Quase tudo é só 'all' (marcado ou não). */
  scopes: readonly ProcessPermissionScope[];
}

export type ProcessPermissionGroup =
  | 'Solicitações'
  | 'Comentários e anexos'
  | 'Aprovações'
  | 'Respostas'
  | 'Indicadores'
  | 'Estrutura'
  | 'Automação'
  | 'Acesso';

const ALL = ['all'] as const;

export const PROCESS_PERMISSION_CATALOG: readonly ProcessPermissionDefinition[] = [
  { code: 'solicitations.view', group: 'Solicitações', label: 'Ver solicitações', scopes: ['all', 'own'] },
  { code: 'solicitations.create', group: 'Solicitações', label: 'Abrir solicitações', scopes: ALL },
  {
    code: 'solicitations.act',
    group: 'Solicitações',
    label: 'Atuar nos cards (mover de fase, preencher campos da fase, pedir aprovação)',
    scopes: ALL,
  },
  {
    code: 'solicitations.reassign',
    group: 'Solicitações',
    label: 'Trocar responsável e prioridade',
    scopes: ALL,
  },
  {
    code: 'solicitations.regenerate_token',
    group: 'Solicitações',
    label: 'Gerar novo link de acompanhamento',
    scopes: ALL,
  },
  { code: 'comments.view_internal', group: 'Comentários e anexos', label: 'Ver comentários internos', scopes: ALL },
  { code: 'attachments.upload', group: 'Comentários e anexos', label: 'Enviar anexos', scopes: ALL },
  {
    code: 'attachments.manage_all',
    group: 'Comentários e anexos',
    label: 'Ver e excluir anexos de todos',
    scopes: ALL,
  },
  { code: 'approvals.manage', group: 'Aprovações', label: 'Pedir e cancelar aprovações', scopes: ALL },
  {
    code: 'approvals.view_all',
    group: 'Aprovações',
    label: 'Ver todas as aprovações do processo',
    scopes: ALL,
  },
  { code: 'responses.view', group: 'Respostas', label: 'Ver respostas do formulário', scopes: ALL },
  {
    code: 'responses.view_sensitive',
    group: 'Respostas',
    label: 'Ver campos sensíveis das respostas',
    scopes: ALL,
  },
  { code: 'responses.export', group: 'Respostas', label: 'Exportar respostas', scopes: ALL },
  { code: 'analytics.view', group: 'Indicadores', label: 'Ver o painel do processo', scopes: ALL },
  { code: 'analytics.manage', group: 'Indicadores', label: 'Montar o painel do processo', scopes: ALL },
  { code: 'forms.edit', group: 'Estrutura', label: 'Editar o formulário', scopes: ALL },
  { code: 'kanban_phases.manage', group: 'Estrutura', label: 'Configurar as fases', scopes: ALL },
  { code: 'forms.publish', group: 'Estrutura', label: 'Publicar, pausar e arquivar', scopes: ALL },
  {
    code: 'process.access.manage',
    group: 'Acesso',
    label: 'Gerenciar quem tem acesso ao processo',
    scopes: ALL,
  },
];

export const PROCESS_PERMISSION_CODES: ReadonlySet<string> = new Set(
  PROCESS_PERMISSION_CATALOG.map((permission) => permission.code),
);

/**
 * Códigos antigos que rotas, telas e o app ainda usam, e o que eles significam agora dentro de um
 * processo: basta ter UM dos códigos da lista. Lista vazia = basta ter vínculo.
 */
export const PROCESS_PERMISSION_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'forms.view': [],
  'solicitations.manage': ['solicitations.create', 'solicitations.act', 'solicitations.reassign'],
  'responses.view_detail': ['responses.view'],
  'automations.manage': [],
  'standard_questions.manage': [],
};

/** É uma permissão decidida no processo (do vínculo, ou um código antigo que aponta para ele)? */
export function isProcessPermission(code: string): boolean {
  return PROCESS_PERMISSION_CODES.has(code) || code in PROCESS_PERMISSION_ALIASES;
}

/** Os códigos do vínculo que satisfazem `code` (ele mesmo, ou os do apelido). */
export function processCodesFor(code: string): readonly string[] {
  return PROCESS_PERMISSION_ALIASES[code] ?? [code];
}

/** Tudo marcado, tudo com escopo 'all' — o criador e o "Gestor do processo". */
export const FULL_PROCESS_GRANTS: Readonly<Record<string, ProcessPermissionScope>> = Object.fromEntries(
  PROCESS_PERMISSION_CATALOG.map((permission) => [permission.code, 'all' as const]),
);

/** Modelos prontos: ponto de partida na tela; depois cada caixinha pode mudar. */
export const PROCESS_ACCESS_PRESETS: ReadonlyArray<{
  key: string;
  label: string;
  description: string;
  grants: Readonly<Record<string, ProcessPermissionScope>>;
}> = [
  {
    key: 'operador',
    label: 'Operador',
    description: 'Trabalha nos cards: abre, atua nas fases, comenta e anexa.',
    grants: {
      'solicitations.view': 'all',
      'solicitations.create': 'all',
      'solicitations.act': 'all',
      'comments.view_internal': 'all',
      'attachments.upload': 'all',
      'responses.view': 'all',
    },
  },
  {
    key: 'consulta',
    label: 'Consulta',
    description: 'Só acompanha: vê os cards, as respostas e o painel.',
    grants: {
      'solicitations.view': 'all',
      'responses.view': 'all',
      'analytics.view': 'all',
    },
  },
  {
    key: 'gestor',
    label: 'Gestor do processo',
    description: 'Tudo no processo, inclusive estrutura, fluxos e quem tem acesso.',
    grants: FULL_PROCESS_GRANTS,
  },
];
