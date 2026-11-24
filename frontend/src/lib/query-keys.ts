export const queryKeys = {
  auth: {
    me: () => ['auth', 'me'] as const,
  },
  dashboard: {
    stats: (q?: string) => ['dashboard', 'stats', q ?? ''] as const,
    operational: (period?: string) => ['dashboard', 'operational', period ?? '30d'] as const,
    panel: () => ['dashboard', 'panel'] as const,
  },
  forms: {
    all: () => ['forms'] as const,
    list: (params: object) => ['forms', 'list', params] as const,
    byId: (id: string) => ['forms', id] as const,
    classificationOptions: () => ['forms', 'classification-options'] as const,
  },
  responses: {
    byId: (id: string) => ['responses', 'detail', id] as const,
    attachments: (id: string) => ['responses', 'attachments', id] as const,
  },
  records: {
    meta: (formId: string) => ['records', formId, 'meta'] as const,
    list: (formId: string, params: object) => ['records', formId, 'list', params] as const,
    templates: (formId: string) => ['records', formId, 'templates'] as const,
  },
  solicitations: {
    all: () => ['solicitations'] as const,
    list: (params: object) => ['solicitations', 'list', params] as const,
    byId: (id: string) => ['solicitations', 'detail', id] as const,
    history: (id: string) => ['solicitations', 'history', id] as const,
    kanbanBoard: (formId?: string) => ['solicitations', 'kanban', 'board', formId ?? 'all'] as const,
    kanbanSummary: () => ['solicitations', 'kanban', 'summary'] as const,
    attachments: (id: string) => ['solicitations', 'attachments', id] as const,
    attachmentsByPhase: (id: string, phaseId: string) =>
      ['solicitations', 'attachments', id, 'phase', phaseId] as const,
    comments: (id: string) => ['solicitations', 'comments', id] as const,
    phaseFieldValues: (id: string) => ['solicitations', 'phase-fields', id] as const,
    erpDetails: (id: string) => ['solicitations', 'erp-details', id] as const,
    handoffs: (id: string) => ['solicitations', 'handoffs', id] as const,
    standardAnswers: (id: string) => ['solicitations', 'standard-answers', id] as const,
    phaseTimeline: (id: string) => ['solicitations', 'phase-timeline', id] as const,
  },
  connectors: {
    byForm: (formId: string) => ['connectors', formId] as const,
  },
  processAccess: {
    catalog: () => ['process-access', 'catalog'] as const,
    members: (formId: string) => ['process-access', 'members', formId] as const,
    userProcesses: (userId: string) => ['process-access', 'user', userId] as const,
  },
  kanbanPhases: {
    byForm: (formId: string) => ['kanban-phases', formId] as const,
    settings: (formId: string) => ['kanban-phases', formId, 'settings'] as const,
  },
  standardQuestions: {
    byForm: (formId: string) => ['standard-questions', formId] as const,
  },
  flows: {
    all: () => ['flows'] as const,
    list: (params: object) => ['flows', 'list', params] as const,
    byForm: (formId: string) => ['flows', formId] as const,
    byId: (id: string) => ['flows', 'detail', id] as const,
    executions: (id: string) => ['flows', 'executions', id] as const,
    lopsAiAgents: () => ['flows', 'lops-ai', 'agents'] as const,
    whatsappGroups: () => ['flows', 'whatsapp', 'groups'] as const,
    notifications: (flowId: string, executionId?: string) =>
      ['flows', 'notifications', flowId, executionId ?? 'all'] as const,
  },
  inbox: {
    unreadCount: () => ['notifications', 'inbox', 'unread-count'] as const,
    list: () => ['notifications', 'inbox', 'list'] as const,
  },
  approvals: {
    myPending: () => ['approvals', 'my-pending'] as const,
    bySolicitation: (solicitationId: string) => ['approvals', solicitationId] as const,
  },
  areas: {
    all: () => ['areas'] as const,
    list: (params?: object) => ['areas', 'list', params ?? {}] as const,
    byId: (id: string) => ['areas', id] as const,
  },
  roles: {
    all: () => ['roles'] as const,
    list: () => ['roles', 'list'] as const,
    byCode: (code: string) => ['roles', code] as const,
    permissionCatalog: () => ['roles', 'permission-catalog'] as const,
    options: () => ['roles', 'options'] as const,
  },
  admin: {
    metricsSummary: () => ['admin', 'metrics', 'summary'] as const,
    serviceMapStatus: () => ['admin', 'service-map', 'status'] as const,
  },
  webhooks: {
    endpoints: () => ['webhooks', 'endpoints'] as const,
    deliveriesAll: () => ['webhooks', 'deliveries'] as const,
    deliveries: (params: object) => ['webhooks', 'deliveries', params] as const,
    eventsAll: () => ['webhooks', 'events'] as const,
    events: (params: object) => ['webhooks', 'events', params] as const,
    whatsappMessagesAll: () => ['webhooks', 'whatsapp', 'messages'] as const,
    whatsappMessages: (params: object) => ['webhooks', 'whatsapp', 'messages', params] as const,
    whatsappStatus: () => ['webhooks', 'whatsapp', 'status'] as const,
  },
} as const;
