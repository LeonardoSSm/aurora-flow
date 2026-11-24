import { Bell, CheckSquare, ClipboardCheck, Paperclip, Timer } from 'lucide-react';
import type { DocArticle } from '../../../docs-kit';

export const PROCESSOS_ARTICLES: DocArticle[] = [
  {
    slug: 'solicitacoes',
    title: 'Solicitações',
    group: 'processos',
    icon: ClipboardCheck,
    summary:
      'O registro central da operação: origem, Kanban, histórico, comentários e rastreamento público por token.',
    tags: ['solicitação', 'chamado', 'kanban', 'card', 'histórico', 'rastreamento', 'token'],
    sourcePaths: {
      backend: 'backend/src/modules/solicitations',
      frontend: 'frontend/src/modules/solicitations',
    },
    uiRoutes: ['/solicitacoes', '/kanban', '/acompanhar/:token'],
    primary: [
      {
        id: 'origens',
        title: 'Três origens, um mesmo registro',
        blocks: [
          { kind: 'diagram', id: 'ciclo-solicitacao' },
          {
            kind: 'table',
            columns: ['origin_type', 'Como nasce', 'Particularidade'],
            rows: [
              [
                '`form_submission`',
                'Automático, ao receber uma resposta',
                'Herda a área do formulário, o telefone do campo `telefone` e guarda o respondente em `metadata`',
              ],
              ['`manual`', 'Criada por um usuário na tela', 'Título e descrição informados diretamente'],
              [
                '`webhook`',
                'Criada por um nó de fluxo a partir do payload recebido',
                'Usa chave de idempotência e mapeamento de campos configurados no nó',
              ],
            ],
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'Criação a partir de resposta é idempotente',
            text: 'Antes de criar, o serviço procura uma solicitação já ligada àquela resposta e a devolve se existir. Reprocessar o mesmo evento não gera duplicata.',
          },
        ],
      },
      {
        id: 'status',
        title: 'Status',
        blocks: [
          {
            kind: 'paragraph',
            text: 'O enum tem duas gerações. Os valores do Kanban são os que a operação usa hoje; os quatro legados continuam aceitos para não invalidar registros antigos.',
          },
          {
            kind: 'table',
            columns: ['Grupo', 'Valores'],
            rows: [
              [
                'Kanban (atual)',
                '`new`, `in_analysis`, `waiting_approval`, `in_progress`, `approved`, `rejected`, `waiting_integration`, `completed`, `cancelled`',
              ],
              ['Legado', '`open`, `waiting`, `resolved`, `canceled`'],
            ],
          },
          {
            kind: 'callout',
            tone: 'warning',
            title: 'Cuidado com `cancelled` e `canceled`',
            text: 'Os dois existem: `cancelled` (duplo L) é o valor atual do Kanban, `canceled` é legado. Condições de fluxo e filtros precisam usar exatamente o valor gravado.',
          },
        ],
      },
      {
        id: 'sla',
        title: 'SLA',
        blocks: [
          {
            kind: 'paragraph',
            text: 'O prazo é calculado na criação: `sla_due_at = início + sla_duration_hours`. A cada 30 minutos o `SlaCalculatorService` varre lotes de até 100 solicitações e avalia o consumo do prazo.',
          },
          {
            kind: 'table',
            columns: ['Estado', 'Quando'],
            rows: [
              ['`on_track`', 'Dentro do prazo e abaixo do limite de alerta'],
              ['`warning`', 'Consumo passou do limite (padrão: 80% do prazo) — emite `solicitations.sla.warning`'],
              ['`breached`', 'Prazo vencido — emite `solicitations.sla.breached` e grava `sla_breached_at`'],
              ['`paused`', '`sla_paused_at` preenchido; a contagem não avança'],
              ['`completed`', 'Status terminal (`completed`, `cancelled`, `rejected`) — encerra a contagem'],
            ],
          },
          {
            kind: 'paragraph',
            text: 'Os dois eventos de SLA são gatilhos de fluxo (`trigger_sla_warning` e `trigger_sla_breached`), e também alimentam notificação push. `POST /admin/sla/check` força uma verificação imediata, útil para testar a configuração sem esperar o cron.',
          },
        ],
      },
      {
        id: 'rastreamento',
        title: 'Rastreamento público e comentários',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Toda solicitação nasce com um `tracking_token` (UUID único). Com ele, o solicitante acessa `/acompanhar/:token` sem login: vê a situação, baixa anexos e conversa com a equipe.',
          },
          {
            kind: 'list',
            items: [
              'Comentários têm `author_type` `requester` ou `team`, o que separa a conversa externa da interna.',
              'Comentários marcados como internos só aparecem para quem tem `comments.view_internal`, e nunca na tela pública.',
              'Se o link vazar, `POST /solicitations/:id/tracking-token/regenerate` invalida o token anterior (exige `solicitations.regenerate_token`).',
              'Todas as rotas públicas de rastreamento têm rate limit próprio, mais restritivo que o global.',
            ],
          },
          {
            kind: 'callout',
            tone: 'danger',
            title: 'O token é a credencial',
            text: 'Quem tem o link vê a solicitação. Não inclua dados sensíveis em títulos, descrições ou comentários não internos.',
          },
        ],
      },
      {
        id: 'historico',
        title: 'Histórico',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Cada mudança relevante grava uma linha em `solicitation_history` com tipo de evento, ator, valor anterior e novo. É o registro consultado na tela de detalhe — diferente da auditoria global, que é administrativa e cobre o sistema inteiro.',
          },
          {
            kind: 'list',
            items: [
              'Tipos: `created`, `status_changed`, `assignee_changed`, `priority_changed`, `phase_changed`, `comment`.',
            ],
          },
        ],
      },
    ],
    secondary: [
      {
        id: 'endpoints-solicitacoes',
        title: 'Endpoints',
        blocks: [
          {
            kind: 'endpoints',
            items: [
              { method: 'GET', path: '/solicitations', description: 'Lista paginada, filtrada pelo escopo do perfil.', permission: 'solicitations.view' },
              { method: 'GET', path: '/solicitations/:id', description: 'Detalhe da solicitação.', permission: 'solicitations.view' },
              { method: 'GET', path: '/solicitations/kanban/board', description: 'Quadro Kanban de um formulário (`?formId=`, por fase) ou `?formId=unassigned` (colunas padrão pelo status).', permission: 'solicitations.view' },
              { method: 'PATCH', path: '/solicitations/:id/move-stage', description: 'Move uma solicitação sem formulário entre Novo, Pendente e Concluído.', permission: 'solicitations.manage' },
              { method: 'GET', path: '/solicitations/kanban/summary', description: 'Resumo por formulário para a tela de seleção de quadro.', permission: 'solicitations.view' },
              { method: 'GET', path: '/solicitations/:id/sla', description: 'Situação do SLA: percentual usado e tempo restante.', permission: 'solicitations.view' },
              { method: 'GET', path: '/solicitations/:id/history', description: 'Histórico da solicitação.', permission: 'solicitations.view' },
              { method: 'POST', path: '/solicitations', description: 'Cria solicitação manual.', permission: 'solicitations.manage' },
              { method: 'PATCH', path: '/solicitations/:id/status', description: 'Altera o status.', permission: 'solicitations.manage' },
              { method: 'PATCH', path: '/solicitations/:id/assignee', description: 'Altera o responsável.', permission: 'solicitations.manage' },
              { method: 'PATCH', path: '/solicitations/:id/priority', description: 'Altera a prioridade.', permission: 'solicitations.manage' },
              { method: 'PATCH', path: '/solicitations/:id/move', description: 'Move o card no quadro.', permission: 'solicitations.manage' },
              { method: 'POST', path: '/solicitations/:id/tracking-token/regenerate', description: 'Gera um novo token de rastreamento.', permission: 'solicitations.regenerate_token' },
              { method: 'GET', path: '/solicitations/:id/comments', description: 'Comentários (internos filtrados por permissão).' },
              { method: 'POST', path: '/solicitations/:id/comments', description: 'Comenta como equipe.' },
              { method: 'GET', path: '/public/solicitations/track/:token', description: 'Consulta pública por token.', public: true, rateLimit: '30/min' },
              { method: 'GET', path: '/public/solicitations/track/:token/comments', description: 'Comentários visíveis ao solicitante.', public: true, rateLimit: '30/min' },
              { method: 'POST', path: '/public/solicitations/track/:token/comments', description: 'Comentário do solicitante.', public: true, rateLimit: '5/min' },
              { method: 'GET', path: '/public/solicitations/track/:token/attachments/:attachmentId/download', description: 'Download de anexo pelo link público.', public: true, rateLimit: '20/min' },
              { method: 'POST', path: '/admin/sla/check', description: 'Força a verificação de SLA imediatamente.', permission: 'system.maintenance' },
            ],
          },
          {
            kind: 'events',
            emits: [
              'solicitations.created',
              'solicitations.status_changed',
              'solicitations.assignee_changed',
              'solicitations.priority_changed',
              'solicitations.moved',
              'solicitations.sla.warning',
              'solicitations.sla.breached',
            ],
            listens: ['responses.submitted'],
          },
        ],
      },
      {
        id: 'entidades-solicitacoes',
        title: 'Entidades',
        blocks: [
          {
            kind: 'entities',
            items: [
              {
                table: 'solicitations',
                entity: 'SolicitationEntity',
                description: 'Registro principal.',
                columns: [
                  { name: 'idempotency_key', type: 'varchar', note: 'chave de deduplicação vinda do payload de origem' },
                  { name: 'metadata', type: 'jsonb', note: 'campos mapeados da origem; usados na interpolação dos fluxos' },
                  { name: 'external_refs', type: 'jsonb', note: 'IDs externos, como o retorno de uma operação do ERP' },
                  { name: 'current_phase_id', type: 'uuid', note: 'fase do Kanban, distinta do status' },
                  { name: 'sla_warning_threshold_percent', type: 'int', note: 'padrão 80' },
                ],
              },
              {
                table: 'solicitation_history',
                entity: 'SolicitationHistoryEntity',
                description: 'Linha do tempo da solicitação.',
              },
              {
                table: 'solicitation_comments',
                entity: 'SolicitationCommentEntity',
                description: 'Comentários internos e do solicitante.',
              },
            ],
          },
          {
            kind: 'files',
            items: [
              { path: 'backend/src/modules/solicitations/solicitations.service.ts', note: 'criação, Kanban, histórico' },
              { path: 'backend/src/modules/solicitations/sla-calculator.service.ts', note: 'cálculo e verificação de SLA' },
              { path: 'backend/src/modules/solicitations/solicitation-comments.service.ts' },
            ],
          },
        ],
      },
    ],
  },

  {
    slug: 'aprovacoes',
    title: 'Aprovações',
    group: 'processos',
    icon: CheckSquare,
    summary:
      'Pedidos de decisão sobre uma solicitação, em modo paralelo ou sequencial, com quórum configurável.',
    tags: ['aprovação', 'alçada', 'decisão', 'aprovador', 'quórum', 'sequencial', 'paralelo'],
    sourcePaths: { backend: 'backend/src/modules/approvals', frontend: 'frontend/src/modules/approvals' },
    uiRoutes: ['/aprovacoes'],
    primary: [
      {
        id: 'estrutura-aprovacao',
        title: 'Aprovação, passos e decisões',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Uma aprovação (`approvals`) pertence a uma solicitação e é composta por passos (`approval_steps`), um por aprovador. Cada decisão tomada vira um registro em `approval_decisions`, com autor, valor e comentário — o passo guarda o estado, a decisão guarda o ato.',
          },
          {
            kind: 'table',
            columns: ['Modo', 'Comportamento'],
            rows: [
              [
                '`parallel` (padrão)',
                'Todos os passos nascem pendentes; qualquer aprovador pode decidir a qualquer momento',
              ],
              [
                '`sequential`',
                'Só o primeiro passo nasce pendente; os demais ficam em `waiting` e são liberados um a um conforme as decisões chegam',
              ],
            ],
          },
          {
            kind: 'paragraph',
            text: '`required_decisions` define o quórum: a aprovação é concluída quando esse número de passos é aprovado. Com o padrão 1, a primeira aprovação já fecha o pedido.',
          },
          {
            kind: 'callout',
            tone: 'warning',
            title: 'Reprovação encerra o pedido',
            text: 'Uma decisão negativa conclui a aprovação como rejeitada, sem esperar os demais aprovadores. É por isso que `approvals.rejected` também é gatilho de fluxo de retorno.',
          },
        ],
      },
      {
        id: 'aprovacao-fluxos',
        title: 'Relação com os fluxos',
        blocks: [
          {
            kind: 'list',
            items: [
              'Fluxos criam aprovações pelo nó `action_create_approval`, com aprovadores fixos, resolvidos do payload por e-mail ou pelo **"Quem aprova a fase"** (perfis e usuários da fase).',
              'Quem aprova recebe a pendência em Aprovações e push no app. E-mail só com **"Avisar quem aprova por e-mail"** ligado no nó (exige SMTP): o link `/aprovacoes?id=…` abre a decisão direto.',
              '**Dados do ERP**: na decisão da aprovação (e no card da fase, para quem atua) aparece a ficha de cada campo "Lista do ERP" respondido no formulário — ex.: o pedido com cliente, situação e itens —, consultada no ERP na hora. Vale para qualquer formulário e lista, sem configurar nada. Com o ERP fora, mostra o nome gravado no envio e "Consultar de novo".',
              'A conclusão da aprovação (aprovada ou reprovada) dispara `trigger_approval_completed`, normalmente usado para devolver a decisão ao sistema de origem.',
              'O motor pula a criação se a solicitação já tiver uma aprovação — assim um reprocessamento (webhook reenviado, reconciliação) não empilha aprovações duplicadas.',
              'Se um e-mail de aprovador não existir ou estiver inativo, o nó falha **e** notifica todos os usuários com `flows.manage`, para que a solicitação não fique parada em silêncio.',
            ],
          },
          {
            kind: 'callout',
            tone: 'danger',
            title: 'Escopo do gatilho de retorno',
            text: '`trigger_approval_completed` sem `formId` dispara para **qualquer** aprovação concluída no sistema — `formId` nulo é curinga, não filtro. Fluxos de retorno de integração precisam estar amarrados a um formulário para não reagir a aprovações de outros processos.',
          },
        ],
      },
    ],
    secondary: [
      {
        id: 'ref-aprovacoes',
        title: 'Referência',
        blocks: [
          {
            kind: 'endpoints',
            items: [
              { method: 'POST', path: '/solicitations/:solicitationId/approvals', description: 'Cria uma aprovação para a solicitação.', permission: 'approvals.manage' },
              { method: 'GET', path: '/solicitations/:solicitationId/approvals', description: 'Aprovações da solicitação.', permission: 'approvals.decide' },
              { method: 'GET', path: '/approvals/my-pending', description: 'Passos pendentes atribuídos ao usuário autenticado.', permission: 'approvals.decide' },
              { method: 'GET', path: '/approvals/:id', description: 'Detalhe de uma aprovação.', permission: 'approvals.decide' },
              { method: 'POST', path: '/approvals/:stepId/decide', description: 'Registra a decisão de um passo.', permission: 'approvals.decide' },
              { method: 'PATCH', path: '/approvals/:id/cancel', description: 'Cancela a aprovação.', permission: 'approvals.manage' },
            ],
          },
          {
            kind: 'events',
            emits: ['approvals.created', 'approvals.approved', 'approvals.rejected', 'approvals.cancelled'],
          },
          {
            kind: 'entities',
            items: [
              {
                table: 'approvals',
                entity: 'ApprovalEntity',
                description: 'Pedido de aprovação.',
                columns: [
                  { name: 'mode', type: 'varchar', note: '`parallel` ou `sequential`' },
                  { name: 'required_decisions', type: 'int', note: 'quórum de aprovações' },
                  { name: 'status', type: 'varchar', note: '`pending`, `approved`, `rejected`, `cancelled`' },
                ],
              },
              {
                table: 'approval_steps',
                entity: 'ApprovalStepEntity',
                description: 'Um aprovador e seu estado.',
                columns: [
                  { name: 'status', type: 'varchar', note: '`pending`, `waiting`, `approved`, `rejected`, `skipped`' },
                  { name: 'order', type: 'int', note: 'ordem no modo sequencial' },
                ],
              },
              {
                table: 'approval_decisions',
                entity: 'ApprovalDecisionEntity',
                description: 'A decisão em si, com autor, comentário e horário.',
              },
            ],
          },
        ],
      },
    ],
  },

  {
    slug: 'anexos',
    title: 'Anexos e armazenamento',
    group: 'processos',
    icon: Paperclip,
    summary: 'Upload, download e exclusão de arquivos ligados a solicitações e respostas.',
    tags: ['anexo', 'arquivo', 'upload', 'download', 'storage'],
    sourcePaths: { backend: 'backend/src/modules/attachments, backend/src/modules/storage' },
    primary: [
      {
        id: 'anexos-como',
        title: 'Como funciona',
        blocks: [
          {
            kind: 'paragraph',
            text: 'O `StorageService` cuida do arquivo em disco (validação de tipo e tamanho, gravação, leitura em stream, exclusão). O `AttachmentsService` cuida do registro: a quem o arquivo pertence, quem enviou e quem pode baixar.',
          },
          {
            kind: 'list',
            items: [
              'Um anexo pertence a uma solicitação **ou** a uma resposta de formulário.',
              '`attachments.upload` permite enviar e excluir os próprios arquivos; `attachments.manage_all` permite ver e excluir os de qualquer um.',
              'Download tem rate limit próprio (30/min) — é a rota mais exposta do módulo.',
              'Anexos marcados como públicos são os que aparecem na tela de rastreamento por token.',
              'Arquivos de formulários públicos seguem por outro caminho: gravados em `uploads/public-forms` e servidos estaticamente.',
            ],
          },
        ],
      },
    ],
    secondary: [
      {
        id: 'ref-anexos',
        title: 'Referência',
        blocks: [
          {
            kind: 'endpoints',
            items: [
              { method: 'POST', path: '/solicitations/:id/attachments', description: 'Anexa arquivo a uma solicitação.', permission: 'attachments.upload', note: 'Multipart: `file` e, opcionais, `name` (novo nome; a extensão do arquivo é mantida) e `description`. Sem limite por formulário; teto técnico `STORAGE_MAX_FILE_SIZE_MB` (padrão 100).' },
              { method: 'GET', path: '/solicitations/:id/attachments', description: 'Lista anexos da solicitação.' },
              { method: 'POST', path: '/submissions/:submissionId/attachments', description: 'Anexa arquivo a uma resposta.', rateLimit: '120/min', note: 'Aceita `name` e `description` como o upload da solicitação.' },
              { method: 'PATCH', path: '/attachments/:id', description: 'Renomeia ou descreve um anexo (`name`, `description`; descrição vazia apaga).', permission: 'attachments.upload', note: 'Só quem enviou, ou quem tem `attachments.manage_all` no processo. O arquivo em disco não muda.' },
              { method: 'GET', path: '/attachments/:id/download', description: 'Baixa o arquivo.', rateLimit: '30/min' },
              { method: 'DELETE', path: '/attachments/:id', description: 'Remove o anexo.', permission: 'attachments.upload', note: '`attachments.manage_all` permite remover anexos de terceiros.' },
            ],
          },
          {
            kind: 'entities',
            items: [
              {
                table: 'attachments',
                entity: 'AttachmentEntity',
                description: 'Metadados do arquivo e o vínculo com solicitação ou resposta.',
                columns: [
                  { name: 'storage_path', type: 'varchar', note: 'caminho no volume; `storage_type` prevê outros backends' },
                  { name: 'is_public', type: 'boolean', note: 'visível na tela de rastreamento' },
                ],
              },
            ],
          },
        ],
      },
    ],
  },

  {
    slug: 'notificacoes',
    title: 'Notificações',
    group: 'processos',
    icon: Bell,
    summary: 'Avisos in-app gravados no banco e notificações push para o aplicativo Expo.',
    tags: ['notificação', 'push', 'expo', 'aviso', 'alerta'],
    sourcePaths: { backend: 'backend/src/modules/notifications' },
    primary: [
      {
        id: 'canais',
        title: 'Dois canais',
        blocks: [
          {
            kind: 'table',
            columns: ['Canal', 'Como funciona', 'Quem dispara'],
            rows: [
              [
                'In-app',
                'Linha em `notifications` (usuário, mensagem, lido)',
                'Nó `action_notify_users`, avisos de falha de aprovação, alertas de integração',
              ],
              [
                'Push (Expo)',
                'Envio para os tokens registrados do usuário',
                '`ExpoPushService`, usado principalmente pelos alertas de SLA',
              ],
            ],
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'Notificação de falha silenciosa',
            text: 'Quando um fluxo não consegue resolver os aprovadores informados no payload, todos os usuários com `flows.manage` recebem uma notificação in-app com o motivo e a referência da solicitação. É o mecanismo que evita que uma integração fique parada sem ninguém perceber.',
          },
        ],
      },
    ],
    secondary: [
      {
        id: 'ref-notificacoes',
        title: 'Referência',
        blocks: [
          {
            kind: 'endpoints',
            items: [
              { method: 'POST', path: '/notifications/push-token', description: 'Registra o token de push do dispositivo.' },
              { method: 'DELETE', path: '/notifications/push-token', description: 'Remove o token do dispositivo.' },
            ],
          },
          {
            kind: 'entities',
            items: [
              { table: 'notifications', entity: 'NotificationEntity', description: 'Aviso in-app por usuário.' },
              { table: 'push_tokens', entity: 'PushTokenEntity', description: 'Tokens Expo registrados por dispositivo.' },
            ],
          },
        ],
      },
    ],
  },

  {
    slug: 'relatorios',
    title: 'Relatórios executivos',
    group: 'processos',
    icon: Timer,
    summary: 'Relatório consolidado de solicitações por período, área e situação de SLA.',
    tags: ['relatório', 'executivo', 'exportação', 'gerencial'],
    sourcePaths: { backend: 'backend/src/modules/reports', frontend: 'frontend/src/modules/reports' },
    primary: [
      {
        id: 'relatorio-uso',
        title: 'O que entrega',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Consolida solicitações, áreas e aprovações em um relatório gerencial por período — volume, distribuição por área e situação, cumprimento de SLA e tempo de resolução. É gerado sob demanda a partir das tabelas operacionais e usa as configurações da organização (`app_settings`) para o cabeçalho.',
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'Permissão dedicada',
            text: '`reports.view` é independente de `solicitations.view`: dá acesso ao consolidado sem necessariamente dar acesso à lista de solicitações individuais.',
          },
        ],
      },
    ],
    secondary: [
      {
        id: 'ref-relatorios',
        title: 'Referência',
        blocks: [
          {
            kind: 'endpoints',
            items: [
              {
                method: 'GET',
                path: '/reports/solicitations/executive',
                description: 'Gera o relatório executivo do período informado.',
                permission: 'reports.view',
              },
            ],
          },
          { kind: 'files', items: [{ path: 'backend/src/modules/reports/executive-report.service.ts' }] },
        ],
      },
    ],
  },
];
