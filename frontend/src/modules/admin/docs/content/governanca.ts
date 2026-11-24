import { Building2, Gauge, ScrollText, SlidersHorizontal, Users, Wrench } from 'lucide-react';
import type { DocArticle } from '../../../docs-kit';

export const GOVERNANCA_ARTICLES: DocArticle[] = [
  {
    slug: 'usuarios',
    title: 'Usuários',
    group: 'governanca',
    icon: Users,
    summary: 'Cadastro, ativação, troca de perfil e o efeito de cada alteração nas sessões abertas.',
    tags: ['usuário', 'conta', 'senha', 'desativar', 'sessão', 'perfil'],
    sourcePaths: { backend: 'backend/src/modules/users', frontend: 'frontend/src/modules/admin' },
    uiRoutes: ['/administracao/usuarios'],
    primary: [
      {
        id: 'usuarios-regras',
        title: 'Regras que valem sempre',
        blocks: [
          {
            kind: 'list',
            items: [
              'Senhas são gravadas com bcrypt (fator 12). Não existe caminho de leitura — só substituição.',
              'Criar um usuário aqui com senha, ou redefinir a senha dele, preenche `password_defined_at` — a conta passa a contar como "tem senha" e não recebe a tela de cadastro no login pelo Google.',
              'A senha é opcional no cadastro. Sem ela o usuário fica **pré-cadastrado**: grava-se um hash aleatório e `password_defined_at` fica nulo, igual à conta criada pelo login Google. Ele já pode ser escolhido como aprovador ou responsável antes do primeiro acesso, e o login Google casa a conta pelo e-mail. A lista mostra "Aguardando 1º acesso" enquanto `last_login_at` estiver vazio.',
              'Redefinir a senha de alguém é o único caminho quando o usuário esqueceu a dele: a tela de troca do próprio usuário exige a senha atual.',
              'Usuário não é excluído: é desativado (`is_active = false`), preservando autoria e histórico.',
              'Alterar dados sensíveis do usuário incrementa `token_version`, o que invalida imediatamente todos os access tokens já emitidos para ele.',
              'A área do usuário (`area_id`) é o que dá sentido ao escopo `area` das permissões.',
              '`GET /users/assignable` devolve candidatos a responsável filtrados por permissão — é o que alimenta os seletores de atribuição, inclusive a lista de responsáveis do formulário.',
              'No start da aplicação, `ensureSeedAdmin()` garante que existe um administrador; o health check monitora essa condição.',
            ],
          },
          {
            kind: 'callout',
            tone: 'warning',
            title: 'Trocar de perfil derruba a sessão',
            text: 'O código do perfil viaja dentro do JWT. Mudar o perfil de um usuário só passa a valer com um token novo — por isso a operação encerra as sessões dele. Editar as permissões *do perfil*, por outro lado, vale na requisição seguinte, sem novo login.',
          },
        ],
      },
    ],
    secondary: [
      {
        id: 'ref-usuarios',
        title: 'Referência',
        blocks: [
          {
            kind: 'endpoints',
            items: [
              { method: 'GET', path: '/users', description: 'Lista paginada com busca e filtros.', permission: 'users.manage' },
              { method: 'GET', path: '/users/assignable', description: 'Usuários atribuíveis para uma permissão.' },
              { method: 'GET', path: '/users/:id', description: 'Detalhe do usuário.', permission: 'users.manage' },
              { method: 'POST', path: '/users', description: 'Cria usuário.', permission: 'users.manage' },
              { method: 'PATCH', path: '/users/:id', description: 'Atualiza usuário; pode invalidar sessões.', permission: 'users.manage' },
              { method: 'DELETE', path: '/users/:id', description: 'Desativa o usuário.', permission: 'users.manage' },
            ],
          },
          { kind: 'events', emits: ['users.created', 'users.updated', 'users.deactivated'] },
        ],
      },
    ],
  },

  {
    slug: 'areas',
    title: 'Áreas',
    group: 'governanca',
    icon: Building2,
    summary: 'Estrutura organizacional hierárquica que dá base ao escopo "area" das permissões.',
    tags: ['área', 'departamento', 'setor', 'organização', 'hierarquia'],
    sourcePaths: { backend: 'backend/src/modules/areas' },
    uiRoutes: ['/administracao/areas'],
    primary: [
      {
        id: 'areas-uso',
        title: 'Para que servem',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Áreas formam uma árvore (`parent_id`) e aparecem em três lugares: no usuário, no formulário e na solicitação. É a partir dessa marcação que o escopo `area` decide o que cada perfil enxerga.',
          },
          {
            kind: 'list',
            items: [
              'Uma solicitação criada a partir de resposta herda a área do formulário.',
              'Registros sem área ficam visíveis para quem tem escopo `area`, qualquer que seja sua área.',
              'Áreas são desativadas, nunca excluídas, para não quebrar registros históricos.',
              'Relatórios executivos agrupam por área.',
            ],
          },
        ],
      },
    ],
    secondary: [
      {
        id: 'ref-areas',
        title: 'Referência',
        blocks: [
          {
            kind: 'endpoints',
            items: [
              { method: 'GET', path: '/areas', description: 'Lista áreas (opcionalmente incluindo inativas).', permission: 'areas.manage' },
              { method: 'GET', path: '/areas/:id', description: 'Detalhe da área.', permission: 'areas.manage' },
              { method: 'POST', path: '/areas', description: 'Cria área.', permission: 'areas.manage' },
              { method: 'PATCH', path: '/areas/:id', description: 'Atualiza área.', permission: 'areas.manage' },
              { method: 'DELETE', path: '/areas/:id', description: 'Desativa a área.', permission: 'areas.manage' },
            ],
          },
          {
            kind: 'entities',
            items: [
              {
                table: 'areas',
                entity: 'AreaEntity',
                description: 'Nó da estrutura organizacional, com `parent_id` para a hierarquia.',
              },
            ],
          },
        ],
      },
    ],
  },

  {
    slug: 'configuracoes',
    title: 'Configurações',
    group: 'governanca',
    icon: SlidersHorizontal,
    summary: 'Parâmetros da organização guardados em banco, editáveis sem deploy.',
    tags: ['configuração', 'setting', 'parâmetro', 'organização'],
    sourcePaths: { backend: 'backend/src/modules/settings' },
    uiRoutes: ['/administracao/configuracoes'],
    primary: [
      {
        id: 'settings-como',
        title: 'Como funciona',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Configurações vivem em `app_settings`, indexadas por chave, com tipo declarado (`string`, `number`, `boolean`, `json`) e uma marcação de visibilidade. As públicas são expostas sem autenticação — é o que permite à tela de login exibir o nome da organização.',
          },
          {
            kind: 'paragraph',
            text: 'Os valores padrão são semeados no start do backend com `ON CONFLICT DO NOTHING`: uma chave nova aparece automaticamente após o deploy, e valores já ajustados nunca são sobrescritos.',
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'Configuração de banco x variável de ambiente',
            text: 'Aqui ficam parâmetros de negócio, que a administração muda pela tela. Credenciais, URLs de integração e chaves continuam em variáveis de ambiente — não são editáveis por esta tela.',
          },
          {
            kind: 'live',
            source: 'settings',
            title: 'Configurações deste ambiente',
            description: 'Fonte: GET /settings.',
          },
        ],
      },
    ],
    secondary: [
      {
        id: 'ref-settings',
        title: 'Referência',
        blocks: [
          {
            kind: 'endpoints',
            items: [
              { method: 'GET', path: '/settings', description: 'Todas as configurações.', permission: 'settings.manage' },
              { method: 'GET', path: '/settings/public', description: 'Apenas as marcadas como públicas.', public: true },
              { method: 'GET', path: '/settings/:key', description: 'Uma configuração.', permission: 'settings.manage' },
              { method: 'PATCH', path: '/settings/:key', description: 'Atualiza uma configuração.', permission: 'settings.manage' },
              { method: 'PATCH', path: '/settings', description: 'Atualização em lote.', permission: 'settings.manage' },
            ],
          },
          {
            kind: 'entities',
            items: [
              {
                table: 'app_settings',
                entity: 'AppSettingEntity',
                description: 'Chave é a primária; `value` é sempre texto e o tipo real está em `value_type`.',
              },
            ],
          },
          {
            kind: 'files',
            items: [{ path: 'backend/src/database/seed/settings.seed.ts', note: 'valores padrão' }],
          },
        ],
      },
    ],
  },

  {
    slug: 'auditoria',
    title: 'Auditoria',
    group: 'governanca',
    icon: ScrollText,
    summary: 'Trilha de quem fez o quê, alimentada automaticamente pelos eventos de domínio.',
    tags: ['auditoria', 'log', 'trilha', 'compliance', 'rastreabilidade'],
    sourcePaths: { backend: 'backend/src/modules/audit' },
    uiRoutes: ['/administracao/auditoria'],
    primary: [
      {
        id: 'auditoria-como',
        title: 'Como é alimentada',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Nenhum serviço grava auditoria diretamente. O `AuditListener` escuta 27 eventos de domínio e converte cada um em uma linha de `audit_events` com ator, módulo, entidade, ID, ação e um payload em `jsonb`. Consequência prática: **um evento novo só entra na auditoria se ganhar um listener** — emitir o evento não basta.',
          },
          {
            kind: 'table',
            columns: ['Domínio', 'O que fica registrado'],
            rows: [
              ['Formulários', 'criação, edição, mudança de status, publicação, arquivamento, duplicação e operações de Google Sheets'],
              ['Respostas', 'envio e exportação (com formato e quantidade)'],
              ['Solicitações', 'criação, status, responsável, prioridade e movimentações'],
              ['Aprovações', 'criação, aprovação, reprovação e cancelamento'],
              ['Acesso', 'login, cadastro e troca de senha, conexão e desconexão do Google'],
              ['Usuários', 'criação, alteração e desativação'],
            ],
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'Auditoria x histórico da solicitação',
            text: 'São coisas diferentes: `solicitation_history` é a linha do tempo daquele card, exibida na tela de detalhe; `audit_events` é a trilha administrativa do sistema inteiro, com filtros por ator, módulo e período.',
          },
        ],
      },
    ],
    secondary: [
      {
        id: 'ref-auditoria',
        title: 'Referência',
        blocks: [
          {
            kind: 'endpoints',
            items: [
              {
                method: 'GET',
                path: '/audit',
                description: 'Consulta paginada com filtros por ator, módulo, entidade e período.',
                permission: 'audit.view',
              },
            ],
          },
          {
            kind: 'entities',
            items: [
              {
                table: 'audit_events',
                entity: 'AuditEventEntity',
                description: 'Um evento auditado.',
                columns: [
                  { name: 'actor_id', type: 'uuid', note: 'nulo em ações do próprio sistema' },
                  { name: 'payload', type: 'jsonb', note: 'detalhe específico do evento' },
                ],
              },
            ],
          },
          {
            kind: 'files',
            items: [{ path: 'backend/src/modules/audit/listeners/audit.listener.ts', note: 'mapeia evento → linha de auditoria' }],
          },
        ],
      },
    ],
  },

  {
    slug: 'dashboard',
    title: 'Dashboard',
    group: 'governanca',
    icon: Gauge,
    summary: 'Indicadores gerais e operacionais, com blocos organizacionais liberados por permissão.',
    tags: ['dashboard', 'indicador', 'kpi', 'painel', 'estatística'],
    sourcePaths: { backend: 'backend/src/modules/dashboard', frontend: 'frontend/src/modules/dashboard' },
    uiRoutes: ['/dashboard', '/inicio'],
    primary: [
      {
        id: 'dashboard-blocos',
        title: 'Dois conjuntos de indicadores',
        blocks: [
          {
            kind: 'table',
            columns: ['Endpoint', 'Foco', 'Permissão'],
            rows: [
              [
                '`/dashboard/stats`',
                'Formulários e respostas: totais, tendência de 30 dias, envios recentes',
                'Vínculo com cada processo: conta os processos da pessoa; respostas só onde ela tem `responses.view`',
              ],
              [
                '`/dashboard/operational-stats`',
                'Operação: solicitações, SLA, aprovações e fluxos',
                '`dashboard.view_org` libera os blocos organizacionais',
              ],
              [
                '`/dashboard/panel`',
                'Painel inicial: o que depende do usuário agora e cada processo por fase (prazo da fase)',
                'Mesmo escopo e visibilidade de fase do Kanban; `dashboard.view_org` libera o alerta de fluxos com falha',
              ],
            ],
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'O dashboard também respeita escopo',
            text: 'Os números são calculados sobre o conjunto que o usuário pode ver. Dois usuários com perfis diferentes podem ver totais diferentes na mesma tela, e isso é o comportamento correto.',
          },
        ],
      },
    ],
    secondary: [
      {
        id: 'ref-dashboard',
        title: 'Referência',
        blocks: [
          {
            kind: 'endpoints',
            items: [
              { method: 'GET', path: '/dashboard/stats', description: 'Indicadores de formulários e respostas.' },
              { method: 'GET', path: '/dashboard/operational-stats', description: 'Indicadores operacionais.' },
              { method: 'GET', path: '/dashboard/panel', description: 'Painel inicial por processo e fase.' },
            ],
          },
          {
            kind: 'files',
            items: [
              { path: 'backend/src/modules/dashboard/dashboard.service.ts' },
              { path: 'backend/src/modules/dashboard/operational-dashboard.service.ts' },
            ],
          },
        ],
      },
    ],
  },

  {
    slug: 'manutencao',
    title: 'Manutenção e ferramentas',
    group: 'governanca',
    icon: Wrench,
    summary:
      'Operações administrativas protegidas por system.maintenance e os serviços externos de apoio.',
    tags: ['manutenção', 'seed', 'demo', 'ferramenta', 'grafana', 'prometheus', 'rabbitmq', 'swagger'],
    sourcePaths: { backend: 'backend/src/modules/admin' },
    uiRoutes: ['/administracao/ferramentas'],
    primary: [
      {
        id: 'operacoes',
        title: 'Operações de manutenção',
        blocks: [
          {
            kind: 'paragraph',
            text: 'A permissão `system.maintenance` concentra as ações que mexem no funcionamento do sistema, não nos dados de negócio. Todas ficam em rotas administrativas separadas.',
          },
          {
            kind: 'table',
            columns: ['Operação', 'Rota', 'Efeito'],
            rows: [
              ['Semear dados de demonstração', '`POST /admin/seed/demo`', 'Popula o ambiente com dados de exemplo'],
              ['Forçar verificação de SLA', '`POST /admin/sla/check`', 'Roda o cron de SLA imediatamente'],
              ['Inspecionar DLQ', '`GET /admin/flows/dlq`', 'Mostra o tamanho das dead-letter queues'],
              ['Migrar `formId` dos gatilhos', '`POST /admin/flows/migrate-form-ids`', 'Copia `flows.form_id` para nós de gatilho sem escopo'],
              ['Saúde da sincronização Google', '`GET /admin/google-sync/health`', 'Estado da fila de escrita nas planilhas'],
            ],
          },
          {
            kind: 'callout',
            tone: 'danger',
            title: 'Seed de demonstração em produção',
            text: 'A rota de seed cria dados de exemplo no ambiente em que for executada. Ela existe para demonstração e homologação — conceda `system.maintenance` com esse risco em mente.',
          },
        ],
      },
      {
        id: 'ferramentas',
        title: 'Serviços externos',
        blocks: [
          {
            kind: 'paragraph',
            text: 'A aba Ferramentas reúne links para os serviços de apoio da infraestrutura. Cada card só aparece se a URL correspondente estiver configurada no `.env` do frontend — nada é inferido.',
          },
          {
            kind: 'table',
            columns: ['Serviço', 'Variável', 'Para quê'],
            rows: [
              ['Grafana', '`VITE_GRAFANA_URL`', 'Dashboards das métricas'],
              ['Prometheus', '`VITE_PROMETHEUS_URL`', 'Consulta PromQL'],
              ['RabbitMQ Management', '`VITE_RABBITMQ_MANAGEMENT_URL`', 'Filas, consumidores e DLQ'],
              ['Swagger', 'derivado de `VITE_API_URL`', 'API interativa (indisponível em produção)'],
            ],
          },
        ],
      },
    ],
    secondary: [
      {
        id: 'ref-manutencao',
        title: 'Referência',
        blocks: [
          {
            kind: 'endpoints',
            items: [
              { method: 'POST', path: '/admin/seed/demo', description: 'Cria dados de demonstração.', permission: 'system.maintenance' },
              { method: 'POST', path: '/admin/sla/check', description: 'Executa a verificação de SLA sob demanda.', permission: 'system.maintenance' },
              { method: 'GET', path: '/admin/flows/dlq', description: 'Estado das dead-letter queues.', permission: 'system.maintenance' },
              { method: 'POST', path: '/admin/flows/migrate-form-ids', description: 'Backfill do escopo dos gatilhos de formulário.', permission: 'system.maintenance' },
              { method: 'GET', path: '/admin/google-sync/health', description: 'Saúde da fila do Google Sheets.', permission: 'system.maintenance' },
            ],
          },
        ],
      },
    ],
  },
];
