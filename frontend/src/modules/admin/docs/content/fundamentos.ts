import { Boxes, Database, GitBranch, Layers, MonitorSmartphone, ShieldCheck } from 'lucide-react';
import type { DocArticle } from '../../../docs-kit';

/**
 * Artigos transversais: explicam o sistema como um todo, não um módulo isolado.
 * São o ponto de entrada recomendado para quem está chegando no código.
 */
export const FUNDAMENTOS_ARTICLES: DocArticle[] = [
  {
    slug: 'arquitetura',
    title: 'Arquitetura geral',
    group: 'fundamentos',
    icon: Layers,
    summary:
      'Stack, camadas, o caminho de uma requisição e os processos assíncronos que rodam em paralelo à API.',
    tags: ['nestjs', 'react', 'postgres', 'rabbitmq', 'docker', 'stack', 'visão geral'],
    sourcePaths: { backend: 'backend/src', frontend: 'frontend/src' },
    primary: [
      {
        id: 'panorama',
        title: 'Panorama',
        blocks: [
          {
            kind: 'paragraph',
            text: 'O Aurora Flow é um motor de automações de propósito geral: fluxos visuais com gatilhos (webhook, agendamento), ações (HTTP, e-mail, notificações, integrações) e histórico de execução. O domínio de formulários da origem permanece isolado internamente, sem superfície HTTP.',
          },
          {
            kind: 'paragraph',
            text: 'São três executáveis: o **backend** (API NestJS + workers em um mesmo processo), o **frontend** (SPA React servida estaticamente) e o **app mobile** (Expo, hoje usado para notificações push e consulta). O estado vive todo no PostgreSQL; o RabbitMQ carrega apenas trabalho em trânsito.',
          },
          { kind: 'diagram', id: 'arquitetura-geral' },
        ],
      },
      {
        id: 'camadas',
        title: 'Camadas do backend',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Cada módulo do NestJS segue a mesma divisão. Entender essas quatro camadas é suficiente para navegar em qualquer módulo do sistema.',
          },
          {
            kind: 'steps',
            steps: [
              {
                title: 'Controller',
                text: 'Só traduz HTTP: declara rota, guards (`JwtAuthGuard`, `PermissionsGuard`), permissão exigida e DTO de entrada. Não contém regra de negócio.',
              },
              {
                title: 'DTO + ValidationPipe',
                text: 'A validação é global e estrita: `whitelist`, `transform` e `forbidNonWhitelisted`. Campo não declarado no DTO faz a requisição falhar com 400 — não é ignorado silenciosamente.',
              },
              {
                title: 'Service',
                text: 'Onde mora a regra de negócio, a conferência do processo (`ProcessAccessService`) e a emissão de eventos de domínio. É a camada reaproveitada por controllers, listeners e crons.',
              },
              {
                title: 'Repository (TypeORM)',
                text: 'Acesso ao PostgreSQL. Listas que dependem de permissão passam pelo filtro do `ProcessAccessService` (`applyFormScope`, `applySolicitationScope`), nunca um `find()` cru.',
              },
            ],
          },
        ],
      },
      {
        id: 'assincrono',
        title: 'O que roda fora da requisição',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Boa parte do comportamento do sistema não acontece durante a requisição HTTP. Três mecanismos distintos rodam em paralelo, e confundi-los é a principal fonte de dúvida ao investigar um problema:',
          },
          {
            kind: 'table',
            columns: ['Mecanismo', 'Quando dispara', 'Exemplo típico'],
            rows: [
              [
                'EventEmitter2 (em processo)',
                'Imediatamente após o commit da operação, no mesmo processo',
                'Auditoria de `solicitations.created`',
              ],
              [
                'RabbitMQ (fila durável)',
                'Assim que um listener publica o job; consumido logo depois',
                'Execução de um fluxo disparado por uma resposta',
              ],
              [
                'Cron (@nestjs/schedule)',
                'Em intervalo fixo, independente de qualquer requisição',
                'Verificação de SLA a cada 30 min, sync do Google Sheets a cada 30 s',
              ],
            ],
          },
          {
            kind: 'callout',
            tone: 'warning',
            title: 'Resposta 200 não significa "processado"',
            text: 'Webhooks de entrada e envios de formulário respondem antes de os fluxos rodarem. Confirmação de processamento tem que ser buscada em `flow_executions` ou nos logs de integração, não no status HTTP.',
          },
        ],
      },
    ],
    secondary: [
      {
        id: 'stack',
        title: 'Stack',
        blocks: [
          {
            kind: 'table',
            columns: ['Camada', 'Tecnologia', 'Observação'],
            rows: [
              ['API', 'NestJS 10 (Node.js, TypeScript)', 'Prefixo global + versionamento por URI'],
              ['ORM', 'TypeORM + PostgreSQL', '41 tabelas; migrations em `src/database/migrations`'],
              ['Mensageria', 'RabbitMQ (amqplib)', 'Filas duráveis com dead-letter automática'],
              ['Agendamento', '@nestjs/schedule', '13 rotinas cron ativas'],
              ['Log', 'nestjs-pino', 'JSON em produção, `pino-pretty` em desenvolvimento'],
              ['Métricas', 'prom-client', 'Exposto em `/metrics` para o Prometheus'],
              ['Frontend', 'React 18 + Vite + Tailwind', 'React Query para estado de servidor'],
              ['Editor de fluxos', '@xyflow/react', 'Mesma biblioteca usada nos diagramas desta documentação'],
              ['Mobile', 'Expo', 'Registro de push token e consulta'],
            ],
          },
        ],
      },
      {
        id: 'convencoes-api',
        title: 'Convenções da API',
        blocks: [
          {
            kind: 'list',
            items: [
              'Todas as rotas ficam sob `/{API_PREFIX}/v1` — o prefixo vem da variável `API_PREFIX` e o versionamento é por URI (`VersioningType.URI`, versão padrão `1`).',
              'Autenticação por `Authorization: Bearer <access token>`; o refresh token trafega em cookie httpOnly.',
              'Rate limit global de 100 requisições por minuto (`ThrottlerGuard` registrado como `APP_GUARD`). Rotas públicas têm limites próprios, mais baixos.',
              '`helmet` e CORS restrito à lista em `CORS_ORIGIN` (aceita múltiplas origens separadas por vírgula).',
              'Listagens paginadas devolvem `{ data, total, page, limit, totalPages }`.',
              'Swagger disponível em `/{API_PREFIX}/v1/docs` — **apenas fora de produção**.',
            ],
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'Uploads públicos',
            text: 'Arquivos enviados por formulários públicos são servidos estaticamente em `/{API_PREFIX}/v1/public/uploads`, apontando para `uploads/public-forms` no disco do container.',
          },
        ],
      },
      {
        id: 'bootstrap',
        title: 'Inicialização',
        blocks: [
          {
            kind: 'paragraph',
            text: 'No `bootstrap()`, antes de abrir a porta, o backend executa duas rotinas idempotentes: `UsersService.ensureSeedAdmin()` (garante o administrador inicial) e `seedSettings()` (insere as configurações padrão com `ON CONFLICT DO NOTHING`).',
          },
          {
            kind: 'paragraph',
            text: 'As migrations rodam automaticamente apenas quando `DB_AUTO_MIGRATE=true`. `DB_SYNC` controla o `synchronize` do TypeORM e deve permanecer desligado em produção.',
          },
          {
            kind: 'files',
            items: [
              { path: 'backend/src/main.ts', note: 'bootstrap, prefixo, CORS, Swagger, seeds' },
              { path: 'backend/src/app.module.ts', note: 'módulos, TypeORM, logger, throttler' },
              { path: 'backend/src/config/validate-env.ts', note: 'validação das variáveis de ambiente' },
            ],
          },
        ],
      },
    ],
  },

  {
    slug: 'seguranca-rbac',
    title: 'Autenticação, perfis e permissões',
    group: 'fundamentos',
    icon: ShieldCheck,
    summary:
      'Login por senha ou Google, tokens, o perfil (o que é da plataforma) e o vínculo pessoa × processo (o que cada pessoa pode em cada processo).',
    tags: [
      'rbac',
      'jwt',
      'permissão',
      'perfil',
      'role',
      'vínculo',
      'processo',
      'escopo',
      'segurança',
      'login',
      'senha',
      'password_defined_at',
    ],
    sourcePaths: {
      backend: 'backend/src/modules/auth, backend/src/modules/roles, backend/src/common/guards',
      frontend: 'frontend/src/app/auth-context.tsx',
    },
    uiRoutes: ['/administracao/permissoes', '/administracao/usuarios', '/definir-senha'],
    primary: [
      {
        id: 'como-funciona',
        title: 'Da senha à decisão de acesso',
        blocks: [
          { kind: 'diagram', id: 'auth-rbac' },
          {
            kind: 'paragraph',
            text: 'O acesso é decidido em três estágios. Um pedido só chega ao serviço se passar pelos dois primeiros, e o terceiro decide sobre qual processo — e altera o resultado das listas.',
          },
          {
            kind: 'steps',
            steps: [
              {
                title: 'Autenticação — quem é você',
                text: 'O `JwtAuthGuard` valida a assinatura e a expiração do access token. A `JwtStrategy` ainda confere o `token_version` do usuário: se ele foi incrementado, o token é rejeitado mesmo dentro da validade.',
              },
              {
                title: 'Autorização — o que você pode fazer',
                text: 'O `PermissionsGuard` lê a permissão exigida pela rota (`@RequirePermission`). Permissão de sistema vem do perfil (`role_permissions`); permissão de processo é conferida como "tem em algum processo", porque a rota ainda não sabe de qual se trata. Sem ela, 403.',
              },
              {
                title: 'Processo — em qual processo',
                text: 'O serviço pergunta ao `ProcessAccessService` se a pessoa tem o código NAQUELE processo (o do formulário, do card ou do anexo) e, nas listas, filtra pelos processos dela. Sem vínculo, o processo não existe para a pessoa.',
              },
            ],
          },
        ],
      },
      {
        id: 'senha-local',
        title: 'Senha local para contas nascidas do Google',
        blocks: [
          {
            kind: 'paragraph',
            text: 'O login Google provisiona o usuário na primeira entrada (`upsertUserFromGoogleLogin`) e grava um `password_hash` aleatório, já que a coluna é obrigatória. Esse hash não corresponde a nenhuma senha conhecida: sem um passo extra, a conta só teria a porta do Google. É o que a coluna `users.password_defined_at` resolve — ela distingue "tem senha de verdade" de "tem hash de preenchimento".',
          },
          {
            kind: 'steps',
            steps: [
              {
                title: 'Callback do Google decide o destino',
                text: 'O `UserResponseDto` expõe `hasPassword` (derivado de `password_defined_at`). A página `/login/google/callback` manda para `/definir-senha` quando ele é `false`, e para `/inicio` caso contrário.',
              },
              {
                title: 'Cadastro em POST /auth/password',
                text: 'A rota exige JWT e valida a senha com o mesmo regex do cadastro de usuário. Se `password_defined_at` já estiver preenchido, o campo `currentPassword` passa a ser obrigatório e é conferido com `bcrypt.compare` — a rota serve tanto para cadastrar quanto para trocar.',
              },
              {
                title: 'Sessões antigas caem',
                text: 'Ao salvar, o serviço revoga os refresh tokens do usuário e incrementa o `token_version`; em seguida emite um par novo para a sessão que fez a operação. Quem estava logado em outro dispositivo precisa entrar de novo.',
              },
            ],
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'A tela é um convite, não um bloqueio',
            text: 'Nada no backend exige senha local para operar o sistema: `/definir-senha` tem um "Agora não" e a verificação acontece só no callback do Google, então quem pula volta a ser convidado no próximo login pelo Google. A rota também é acessível diretamente por quem já tem senha, funcionando como tela de troca.',
          },
          {
            kind: 'callout',
            tone: 'warning',
            title: 'O backfill da migration é assimétrico de propósito',
            text: 'A migration `UserPasswordDefinedAt` preenche `password_defined_at` apenas para quem tem `google_sub IS NULL` — nesses casos a senha só pode ser real. Para contas já vinculadas ao Google não há como separar hash aleatório de senha escolhida, e elas ficam `NULL`: o custo de errar para esse lado é um convite a mais, enquanto o inverso deixaria o usuário sem nunca ver a tela.',
          },
        ],
      },
      {
        id: 'escopos',
        title: 'O vínculo pessoa × processo',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Cada pessoa tem um vínculo com cada processo a que tem acesso (`form_members`), com as permissões dela naquele processo (`form_member_permissions`). Ter o vínculo já é ver o processo; o resto vem das caixinhas, agrupadas em Solicitações, Comentários e anexos, Aprovações, Respostas, Indicadores, Estrutura, Automação e Acesso. O catálogo está em `process-permission-catalog.ts`.',
          },
          {
            kind: 'table',
            columns: ['Quem', 'O que vê', 'Onde se configura'],
            rows: [
              ['Membro do processo', 'O processo e o que as permissões do vínculo deixam', 'Usuários › Processos, ou Criador › Pessoas com acesso'],
              ['Quem criou o processo', 'Tudo nele, inclusive quem tem acesso', 'Automático ao criar'],
              ['Perfil com `processes.full_access`', 'Todos os processos, sem vínculo', 'Perfis e Permissões'],
              ['Quem abriu o pedido ou é responsável', 'Aquele card (só ver)', '—'],
              ['Quem foi chamado a aprovar', 'A aprovação e o card dela', 'Fase ou fluxo que pede a aprovação'],
            ],
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'Escopo só em "ver solicitações"',
            text: 'Quase toda permissão do vínculo é marcada ou não. A exceção é "ver solicitações": `all` vê todos os cards do processo; `own`, só os que a pessoa abriu ou dos quais é responsável. Agir num card (atuar, reatribuir…) pede o código E ver o card.',
          },
          {
            kind: 'callout',
            tone: 'warning',
            title: 'Códigos antigos ainda aceitos',
            text: 'Rotas e telas antigas continuam perguntando `solicitations.manage`, `responses.view_detail`, `automations.manage` e `standard_questions.manage`. Eles valem pelos novos (abrir/atuar/reatribuir, ver respostas, gerenciar fluxos) — ver `PROCESS_PERMISSION_ALIASES`. A área não dá mais acesso: continua como classificação e critério de visibilidade de fase.',
          },
        ],
      },
      {
        id: 'perfis',
        title: 'Perfis são dados, não código',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Perfis vivem na tabela `roles` e podem ser criados pela tela de Permissões. O catálogo de permissões, por outro lado, é fixo no código (`PERMISSION_CATALOG`) — cada permissão nova exige deploy, mas concedê-la ou revogá-la é operação de banco.',
          },
          {
            kind: 'paragraph',
            text: 'Editar as permissões de um perfil vale já na requisição seguinte de todos os seus usuários: o `PermissionsService` mantém um cache em memória por código de perfil e o invalida a cada alteração. Já **trocar o perfil de um usuário** muda o claim `role` dentro do JWT, então exige nova emissão de token — por isso `UsersService.update()` incrementa o `token_version`, encerrando as sessões daquele usuário.',
          },
          {
            kind: 'live',
            source: 'roles',
            title: 'Perfis cadastrados neste ambiente',
            description: 'Dados reais de /roles, incluindo quantas permissões cada perfil concede.',
          },
        ],
      },
    ],
    secondary: [
      {
        id: 'tokens',
        title: 'Tokens e sessão',
        blocks: [
          {
            kind: 'list',
            items: [
              'Access token JWT de curta duração, enviado no header `Authorization`.',
              'Refresh token opaco, persistido com hash em `refresh_tokens` e entregue em cookie httpOnly; `RefreshTokenService.rotate()` troca o token a cada uso.',
              '`users.token_version` é o botão de pânico: qualquer incremento invalida todos os access tokens já emitidos para aquele usuário.',
              '`LoginRateLimitService` bloqueia tentativas por e-mail em memória e limpa as expiradas a cada minuto.',
              'Login com Google passa por `GoogleProfileService.ensureAllowedDomain()` — domínios fora da lista são recusados.',
              '`users.password_defined_at` marca quem escolheu a própria senha; `NULL` significa hash aleatório gravado no provisionamento pelo Google.',
            ],
          },
          {
            kind: 'endpoints',
            items: [
              { method: 'POST', path: '/auth/login', description: 'Autentica por e-mail e senha; emite access + refresh.', public: true },
              { method: 'POST', path: '/auth/refresh', description: 'Rotaciona o refresh token e emite um novo access token.', note: 'Protegido pelo `JwtRefreshGuard`, que lê o cookie.' },
              { method: 'POST', path: '/auth/password', description: 'Cadastra ou troca a senha local do usuário autenticado.', note: '`currentPassword` só é exigido quando `password_defined_at` já está preenchido. Revoga as demais sessões e devolve um par de tokens novo.' },
              { method: 'POST', path: '/auth/logout', description: 'Revoga o refresh token da sessão atual.' },
              { method: 'GET', path: '/auth/me', description: 'Dados do usuário autenticado e suas permissões resolvidas.' },
              { method: 'GET', path: '/auth/google/login-url', description: 'Monta a URL de login OAuth do Google.' },
              { method: 'GET', path: '/auth/google/status', description: 'Situação da conta Google vinculada ao usuário.' },
              { method: 'POST', path: '/auth/google/disconnect', description: 'Desvincula a conta Google e apaga os tokens salvos.' },
            ],
          },
          {
            kind: 'events',
            emits: ['auth.login', 'auth.password_set', 'auth.google_connect', 'auth.google_disconnect'],
          },
          {
            kind: 'paragraph',
            text: '`auth.password_set` carrega `wasChange`, e o `AuditListener` o converte em duas ações distintas na auditoria: `password_set` no primeiro cadastro e `password_change` na troca.',
          },
        ],
      },
      {
        id: 'catalogo',
        title: 'Catálogo de permissões',
        blocks: [
          {
            kind: 'paragraph',
            text: 'O catálogo abaixo vem direto de `GET /permissions`, ou seja, é exatamente o que o backend deste ambiente reconhece. Permissões marcadas como não escapáveis são booleanas: conceder equivale a escopo `all`.',
          },
          {
            kind: 'live',
            source: 'permissions',
            title: 'Catálogo de permissões (ao vivo)',
            description: 'Fonte: PERMISSION_CATALOG, exposto em GET /permissions.',
          },
        ],
      },
      {
        id: 'entidades-rbac',
        title: 'Entidades',
        blocks: [
          {
            kind: 'entities',
            items: [
              {
                table: 'users',
                entity: 'UserEntity',
                description: 'Usuário da plataforma. `role` é o código do perfil (FK para `roles`).',
                columns: [
                  { name: 'role', type: 'varchar', note: 'código do perfil; entra no JWT' },
                  { name: 'token_version', type: 'int', note: 'incrementar invalida as sessões do usuário' },
                  { name: 'password_defined_at', type: 'timestamptz', note: 'NULL = senha nunca escolhida; vira `hasPassword` na API' },
                  { name: 'area_id', type: 'uuid', note: 'base do escopo `area`' },
                  { name: 'google_refresh_token', type: 'text', note: 'criptografado; nunca exposto pela API' },
                ],
              },
              {
                table: 'roles',
                entity: 'RoleEntity',
                description: 'Perfil de acesso. `is_system` protege os perfis padrão contra exclusão.',
              },
              {
                table: 'role_permissions',
                entity: 'RolePermissionEntity',
                description: 'Concessão de uma permissão a um perfil, com o escopo escolhido.',
              },
              {
                table: 'refresh_tokens',
                entity: 'RefreshTokenEntity',
                description: 'Refresh tokens ativos, com IP e user-agent de emissão.',
              },
            ],
          },
          {
            kind: 'endpoints',
            items: [
              { method: 'GET', path: '/permissions', description: 'Catálogo completo de permissões.', permission: 'roles.manage' },
              { method: 'GET', path: '/roles', description: 'Lista os perfis com contagem de usuários.', permission: 'roles.manage' },
              { method: 'POST', path: '/roles', description: 'Cria um perfil.', permission: 'roles.manage' },
              { method: 'PUT', path: '/roles/:code/permissions', description: 'Substitui o conjunto de permissões do perfil.', permission: 'roles.manage', note: 'Invalida o cache do `PermissionsService` para o perfil.' },
              { method: 'PATCH', path: '/roles/:role/users/:userId', description: 'Move um usuário para outro perfil.', permission: 'roles.manage' },
              { method: 'DELETE', path: '/roles/:code', description: 'Remove um perfil não-sistema.', permission: 'roles.manage' },
            ],
          },
          {
            kind: 'files',
            items: [
              { path: 'backend/src/modules/auth/auth.service.ts', note: '`login`, `refresh` e `setPassword`' },
              { path: 'frontend/src/modules/auth/hooks/use-set-password-form.ts', note: 'validação da tela de senha' },
              { path: 'backend/src/common/constants/permission-catalog.ts', note: 'catálogo fixo' },
              { path: 'backend/src/common/guards/permissions.guard.ts', note: 'decisão de acesso' },
              { path: 'backend/src/modules/access/process-access.service.ts', note: 'ponto único: "pode X neste processo?" e os filtros de lista' },
              { path: 'backend/src/common/constants/process-permission-catalog.ts', note: 'permissões do vínculo, modelos prontos e apelidos' },
              { path: 'backend/src/modules/roles/permissions.service.ts', note: 'resolução e cache de escopo' },
            ],
          },
        ],
      },
    ],
  },

  {
    slug: 'eventos-e-filas',
    title: 'Eventos, filas e rotinas agendadas',
    group: 'fundamentos',
    icon: GitBranch,
    summary:
      'O barramento de eventos de domínio, o uso do RabbitMQ com dead-letter e o inventário das rotinas cron.',
    tags: ['evento', 'rabbitmq', 'fila', 'dlq', 'cron', 'assíncrono', 'job'],
    sourcePaths: { backend: 'backend/src/common/events, backend/src/modules/queue' },
    primary: [
      {
        id: 'eventos',
        title: 'Eventos de domínio',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Serviços não chamam uns aos outros para efeitos colaterais. Eles emitem um evento e seguem em frente. Quem se interessa registra um listener. É isso que permite, por exemplo, que uma resposta de formulário gere ao mesmo tempo uma solicitação, uma execução de fluxo, uma automação e uma chamada de conector — sem que `ResponsesService` conheça nenhum deles.',
          },
          {
            kind: 'paragraph',
            text: 'Todos os eventos herdam de `DomainEvent`, que carrega `occurredAt` e `actorId`. O emissor é o `EventEmitter2` configurado com `wildcard: true`.',
          },
          {
            kind: 'callout',
            tone: 'warning',
            title: 'Eventos são em memória',
            text: 'O `EventEmitter2` roda no mesmo processo e não persiste nada. Se o processo cair entre o commit e o listener, aquele efeito colateral se perde. Trabalho que não pode ser perdido é publicado no RabbitMQ pelo listener — que é justamente o que os listeners de fluxo fazem.',
          },
        ],
      },
      {
        id: 'filas',
        title: 'Filas',
        blocks: [
          {
            kind: 'paragraph',
            text: 'O `RabbitMqService` publica mensagens JSON persistentes (`deliveryMode: 2`) em filas duráveis, declaradas sob demanda. Cada fila recebe automaticamente uma dead-letter queue com o sufixo `.dead`: mensagens que falham repetidamente saem do caminho principal em vez de travar o consumo.',
          },
          {
            kind: 'list',
            items: [
              'Execução de fluxos — publicada pelos listeners de resposta, solicitação, aprovação, webhook, SLA e gatilho agendado.',
              'Retentativa de operações ERP — `ERP_RETRY_QUEUE`, consumida pelo `ErpRetryConsumer`.',
            ],
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'RabbitMQ desligado não derruba a API',
            text: 'Se a conexão não estiver disponível, `publishJson` devolve `false` e registra a métrica com resultado `disabled`/`failed`. A requisição do usuário continua funcionando; o trabalho assíncrono é que deixa de acontecer.',
          },
          {
            kind: 'paragraph',
            text: 'O `DlqMonitorService` varre as dead-letter queues a cada 5 minutos e publica o tamanho de cada uma como métrica, além de expor `GET /admin/flows/dlq` para inspeção manual.',
          },
        ],
      },
    ],
    secondary: [
      {
        id: 'inventario-eventos',
        title: 'Inventário de eventos',
        blocks: [
          {
            kind: 'table',
            columns: ['Evento', 'Emitido por', 'Consumido por'],
            rows: [
              ['`forms.created` … `forms.archived`', 'FormsService', 'AuditListener'],
              ['`forms.google_sheet_created`', 'GoogleWorkspaceService', 'AuditListener'],
              ['`forms.google_sync_reenqueued` / `..._reprocessed`', 'GoogleWorkspaceService', 'AuditListener'],
              ['`responses.submitted`', 'ResponsesService', 'Auditoria, Solicitações, Fluxos, Automações, Conectores'],
              ['`responses.exported`', 'ResponsesService', 'AuditListener'],
              ['`solicitations.created`', 'SolicitationsService', 'Auditoria, Fluxos'],
              ['`solicitations.status_changed`', 'SolicitationsService', 'AuditListener'],
              ['`solicitations.assignee_changed`', 'SolicitationsService', 'AuditListener'],
              ['`solicitations.priority_changed`', 'SolicitationsService', 'AuditListener'],
              ['`solicitations.moved`', 'SolicitationsService', 'Auditoria, Fluxos'],
              ['`solicitations.sla.warning` / `.breached`', 'SlaCalculatorService', 'FlowsSlaListener'],
              ['`approvals.created` … `approvals.cancelled`', 'ApprovalsService', 'Auditoria, FlowsApprovalListener'],
              ['`webhooks.received`', 'InboundWebhookService', 'FlowsWebhookListener'],
              ['`erp.auth.failed`', 'ErpConnectorService', 'ErpAuthFailedListener'],
              ['`auth.login`, `auth.password_set`, `auth.google_*`', 'AuthService', 'AuditListener'],
              ['`users.created` / `updated` / `deactivated`', 'UsersService', 'AuditListener'],
            ],
          },
        ],
      },
      {
        id: 'crons',
        title: 'Rotinas agendadas',
        blocks: [
          {
            kind: 'table',
            columns: ['Frequência', 'Rotina', 'O que faz'],
            rows: [
              ['30 s', '`GoogleSheetsSyncService.runSyncCycle`', 'Processa a fila de linhas a escrever no Google Sheets'],
              ['1 min', '`LoginRateLimitService.sweepExpired`', 'Limpa bloqueios de login expirados'],
              ['1 min', '`FlowsScheduledTriggerService.pollDueFlows`', 'Dispara fluxos com gatilho agendado vencido'],
              ['5 min', '`DlqMonitorService.pollDlqMetrics`', 'Mede o tamanho das dead-letter queues'],
              ['5 min', '`ErpConnectorService.checkErpRetries`', 'Reenfileira operações ERP pendentes de retentativa'],
              ['5 min', '`OutboundWebhookService.retryPendingDeliveries`', 'Retenta entregas de webhook de saída'],
              ['10 min', '`ErpConnectorService.checkAllConnectorsHealth`', 'Verifica a saúde de todos os conectores ERP'],
              ['30 min', '`SlaCalculatorService.checkSlaDeadlines`', 'Avalia SLA, emite alerta e violação (lotes de 100)'],
              ['30 min', '`ErpConnectorService.refreshExpiringTokens`', 'Renova tokens ERP prestes a expirar'],
              ['30 min', '`FlowsErpReconciliationService.reconcilePendingItems`', 'Rede de segurança para webhooks perdidos (desligada por padrão)'],
              ['03:00', '`GoogleSyncCleanupService.cleanupOldJobs`', 'Remove jobs antigos de sincronização'],
              ['03:00', '`ErpConnectorService.cleanupOldLogs`', 'Remove logs de operação ERP antigos'],
            ],
          },
          {
            kind: 'files',
            items: [
              { path: 'backend/src/modules/queue/rabbitmq.service.ts', note: 'publicação, consumo, reconexão e DLQ' },
              { path: 'backend/src/common/events/', note: 'classes de evento de domínio' },
              { path: 'backend/src/modules/flows/dlq-monitor.service.ts', note: 'monitoramento da DLQ' },
            ],
          },
        ],
      },
    ],
  },

  {
    slug: 'modelo-de-dados',
    title: 'Modelo de dados',
    group: 'fundamentos',
    icon: Database,
    summary:
      'As 41 tabelas agrupadas por domínio, com as chaves e convenções que se repetem em todas elas.',
    tags: ['banco', 'tabela', 'entidade', 'typeorm', 'postgres', 'schema', 'migration'],
    sourcePaths: { backend: 'backend/src/database/entities' },
    primary: [
      {
        id: 'convencoes',
        title: 'Convenções',
        blocks: [
          {
            kind: 'list',
            items: [
              'Chave primária sempre `uuid` gerado pelo banco.',
              'Colunas em `snake_case`; propriedades da entidade em `camelCase`.',
              '`created_at` / `updated_at` automáticos via `CreateDateColumn` / `UpdateDateColumn`.',
              'Exclusão é lógica na maior parte do sistema (`is_active`, status `archived`), não `DELETE`.',
              'Campos flexíveis usam `jsonb` — `flows.nodes`, `solicitations.metadata`, `flow_executions.node_results`.',
              'Segredos (tokens Google, credenciais ERP) são gravados criptografados e nunca voltam nas respostas da API.',
            ],
          },
        ],
      },
      {
        id: 'grupos',
        title: 'Tabelas por domínio',
        blocks: [
          {
            kind: 'table',
            columns: ['Domínio', 'Tabelas'],
            rows: [
              ['Acesso', '`users`, `roles`, `role_permissions`, `refresh_tokens`, `areas`'],
              [
                'Formulários',
                '`forms`, `form_versions`, `form_sections`, `form_fields`, `form_field_options`, `form_section_branches`',
              ],
              ['Respostas', '`submissions`, `submission_items`, `submission_progress`'],
              [
                'Processos',
                '`solicitations`, `solicitation_history`, `solicitation_comments`, `kanban_phases`, `kanban_phase_fields`, `kanban_phase_field_values`',
              ],
              ['Aprovações', '`approvals`, `approval_steps`, `approval_decisions`'],
              ['Automação', '`flows`, `flow_executions`, `automation_rules`, `automation_executions`, `form_connectors`'],
              [
                'Integrações',
                '`erp_connectors`, `erp_operation_templates`, `erp_operation_logs`, `webhook_endpoints`, `webhook_deliveries`, `inbound_webhook_events`, `whatsapp_messages`, `google_sheets_sync_jobs`',
              ],
              ['Plataforma', '`attachments`, `notifications`, `push_tokens`, `audit_events`, `app_settings`'],
            ],
          },
        ],
      },
    ],
    secondary: [
      {
        id: 'centrais',
        title: 'Tabelas centrais',
        blocks: [
          {
            kind: 'entities',
            items: [
              {
                table: 'solicitations',
                entity: 'SolicitationEntity',
                description: 'O registro em torno do qual gira a operação: Kanban, SLA, aprovações, integrações e rastreamento público.',
                columns: [
                  { name: 'origin_type', type: 'varchar', note: '`manual`, `form_submission` ou `webhook`' },
                  { name: 'idempotency_key', type: 'varchar', note: 'evita duplicar em reenvio de webhook' },
                  { name: 'tracking_token', type: 'uuid único', note: 'acesso público em `/acompanhar/:token`' },
                  { name: 'metadata', type: 'jsonb', note: 'campos livres mapeados do payload de origem' },
                  { name: 'external_refs', type: 'jsonb', note: 'IDs em sistemas externos (ex.: retorno de operação do ERP)' },
                  { name: 'sla_due_at', type: 'timestamptz', note: 'base do cálculo de alerta e violação' },
                ],
              },
              {
                table: 'flows',
                entity: 'FlowEntity',
                description: 'Um fluxo automatizado. O grafo inteiro vive em duas colunas `jsonb`.',
                columns: [
                  { name: 'nodes / edges', type: 'jsonb', note: 'nós e conexões do editor' },
                  { name: 'form_id', type: 'uuid', note: 'escopo do gatilho; não é sobrescrito pelo autosave do editor' },
                  { name: 'next_run_at', type: 'timestamptz', note: 'usado pelo gatilho agendado' },
                  { name: 'consecutive_failure_count', type: 'int', note: 'falhas seguidas do agendamento' },
                ],
              },
              {
                table: 'flow_executions',
                entity: 'FlowExecutionEntity',
                description: 'Registro de cada execução, com o resultado nó a nó — é aqui que se investiga um fluxo que "não fez nada".',
                columns: [
                  { name: 'node_results', type: 'jsonb', note: 'status, saída, erro e duração por nó' },
                  { name: 'parent_flow_id', type: 'uuid', note: 'preenchido quando veio de `action_run_flow`' },
                ],
              },
              {
                table: 'submissions',
                entity: 'SubmissionEntity',
                description: 'Resposta de um formulário, sempre amarrada à versão do formulário respondida.',
                columns: [
                  { name: 'form_version_id', type: 'uuid', note: 'garante que a resposta não muda quando o formulário muda' },
                  { name: 'idempotency_key', type: 'varchar', note: 'protege contra envio duplicado' },
                ],
              },
              {
                table: 'approvals',
                entity: 'ApprovalEntity',
                description: 'Pedido de aprovação de uma solicitação, composto por passos (`approval_steps`).',
                columns: [
                  { name: 'mode', type: 'varchar', note: '`parallel` (padrão) ou `sequential`' },
                  { name: 'required_decisions', type: 'int', note: 'quantas aprovações fecham o pedido' },
                ],
              },
            ],
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'Migrations',
            text: 'Ficam em `backend/src/database/migrations`. Em produção o container não tem `ts-node`: as migrations precisam estar compiladas e são aplicadas pelo processo de deploy, com `DB_AUTO_MIGRATE` controlando a execução automática.',
          },
        ],
      },
    ],
  },

  {
    slug: 'frontend',
    title: 'Arquitetura do frontend',
    group: 'fundamentos',
    icon: MonitorSmartphone,
    summary:
      'Como a SPA está organizada, o padrão módulo → hook → serviço e o mapa de cada módulo de UI para o backend.',
    tags: ['react', 'spa', 'vite', 'react query', 'tailwind', 'rota', 'ui'],
    sourcePaths: { frontend: 'frontend/src' },
    primary: [
      {
        id: 'organizacao',
        title: 'Organização',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Cada domínio da UI vive em `src/modules/<domínio>` e repete a mesma estrutura interna, o que torna qualquer módulo previsível de navegar:',
          },
          {
            kind: 'table',
            columns: ['Pasta', 'Responsabilidade'],
            rows: [
              ['`services/`', 'Chamadas HTTP tipadas, usando a instância `api` (axios) compartilhada'],
              ['`hooks/`', 'React Query: `useQuery`/`useMutation` e invalidação de cache'],
              ['`views/`', 'Composição da tela — é o que a página em `src/pages` renderiza'],
              ['`components/`', 'Peças reutilizáveis daquele domínio'],
              ['`types.ts`', 'Tipos compartilhados do domínio'],
            ],
          },
          {
            kind: 'list',
            items: [
              '`src/pages/*` são invólucros finos: existem para o roteador poder carregá-las sob demanda (`lazy`).',
              '`src/app/router.tsx` concentra as rotas; `RequireAuth` faz a proteção por autenticação e por permissão.',
              '`src/lib/query-keys.ts` centraliza as chaves do React Query — usar a chave certa é o que faz o cache invalidar corretamente.',
              'Tema claro/escuro sai de variáveis CSS mapeadas em tokens do Tailwind (`bg-surface-*`, `text-tx-*`, `border-*`); cores fixas em componentes quebram um dos dois temas.',
            ],
          },
        ],
      },
      {
        id: 'mapa',
        title: 'Mapa de módulos da UI',
        blocks: [
          {
            kind: 'table',
            columns: ['Módulo (frontend)', 'Rotas', 'Backend correspondente'],
            rows: [
              ['`auth`', '`/login`, callback do Google', '`auth`'],
              ['`home`, `dashboard`', '`/inicio`, `/dashboard`', '`dashboard`, `analytics`'],
              ['`forms`, `builder`', '`/formularios`, `/builder`', '`forms`, `kanban-phases`, `automations`, `connectors`'],
              ['`public-form`', '`/f/:formId`, `/public/formulario/:formId`', '`forms` (público), `responses`'],
              ['`responses`', '`/respostas`', '`responses`, `analytics`'],
              ['`solicitations`', '`/solicitacoes`, `/kanban`, `/acompanhar/:token`', '`solicitations`, `attachments`'],
              ['`approvals`', '`/aprovacoes`', '`approvals`'],
              ['`flows`', '`/flows`, `/flows/:id`', '`flows`'],
              ['`integrations`', '`/integracoes`', '`integrations` (webhooks, WhatsApp)'],
              ['`reports`', 'modal de exportação', '`reports`'],
              ['`design-system`', '`/design-system` (público)', '— (só frontend: vitrine do pacote `@tijucas/ui`)'],
              ['`admin`', '`/administracao/*`', '`users`, `roles`, `areas`, `settings`, `audit`, `observability`, `erp`'],
            ],
          },
        ],
      },
    ],
    secondary: [
      {
        id: 'padroes',
        title: 'Padrões que valem para todo o frontend',
        blocks: [
          {
            kind: 'list',
            items: [
              'Estado de servidor é do React Query; `useState` fica para estado de UI. Não duplicar dados da API em estado local.',
              'A instância `api` já injeta o access token e trata refresh — chamadas devem passar por ela, nunca por `fetch` direto.',
              'Itens de navegação declaram `permissions`; `filterByPermission` esconde o que o usuário não pode acessar. Isso é conveniência de UI: a decisão real continua no backend.',
              'Páginas pesadas entram no roteador via `lazy()` + `Suspense` com `PageSkeleton`.',
            ],
          },
          {
            kind: 'files',
            items: [
              { path: 'frontend/src/app/router.tsx', note: 'rotas e proteção por permissão' },
              { path: 'frontend/src/app/auth-context.tsx', note: 'sessão, `hasPermission`' },
              { path: 'frontend/src/services/api.ts', note: 'axios com token e refresh' },
              { path: 'frontend/src/lib/query-keys.ts', note: 'chaves do React Query' },
              { path: 'frontend/tailwind.config.cjs', note: 'tokens de tema' },
            ],
          },
        ],
      },
    ],
  },

  {
    slug: 'observabilidade-operacao',
    title: 'Observabilidade e operação',
    group: 'fundamentos',
    icon: Boxes,
    summary:
      'Métricas Prometheus, health checks, logs estruturados e o roteiro de investigação quando algo não acontece.',
    tags: ['métrica', 'prometheus', 'grafana', 'health', 'log', 'dlq', 'troubleshooting', 'suporte'],
    sourcePaths: { backend: 'backend/src/modules/observability, backend/src/modules/health' },
    uiRoutes: ['/administracao/observabilidade', '/administracao/mapa-servicos', '/administracao/ferramentas'],
    primary: [
      {
        id: 'sinais',
        title: 'Onde olhar',
        blocks: [
          {
            kind: 'table',
            columns: ['Sinal', 'Onde', 'Serve para'],
            rows: [
              ['Resumo administrativo', 'Administração → Observabilidade', 'Visão rápida de solicitações, aprovações, fluxos e webhooks'],
              ['Mapa de serviços', 'Administração → Mapa de serviços', 'Estado de cada container do docker-compose e como eles se conectam'],
              ['Métricas Prometheus', '`GET /metrics`', 'Séries temporais para Grafana e alertas'],
              ['Health check', '`GET /health`, `/health/ready`, `/health/live`', 'Sonda de container e balanceador'],
              ['Logs', 'stdout do container (pino JSON)', 'Rastrear uma requisição pelo `reqId`'],
              ['Auditoria', 'Administração → Auditoria', 'Quem fez o quê, com ator e horário'],
              ['Execuções de fluxo', '`GET /flows/:id/executions`', 'Resultado nó a nó de cada execução'],
              ['DLQ', '`GET /admin/flows/dlq`', 'Mensagens que falharam repetidamente'],
            ],
          },
          {
            kind: 'live',
            source: 'metrics-summary',
            title: 'Resumo operacional deste ambiente',
            description: 'Fonte: GET /admin/metrics/summary.',
          },
        ],
      },
      {
        id: 'mapa-servicos',
        title: 'Mapa de serviços',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Mostra os 11 containers do `docker-compose.yml`, as conexões entre eles e o estado de cada um: **ativo**, **sob demanda**, **degradado** ou **fora do ar**. A tela consulta `GET /admin/service-map/status` a cada 15 s, com a permissão `observability.view_metrics`. O backend faz as checagens em paralelo, com 2,5 s de limite cada, e guarda o resultado por 10 s.',
          },
          {
            kind: 'list',
            items: [
              '**Sob demanda:** `pgadmin` e `erp-mysql-dev` só sobem com os perfis opcionais `tools` e `erp-dev`. Sem resposta, aparecem como sob demanda, nunca como fora do ar.',
              '**Degradado:** RabbitMQ com mais mensagens nas filas que `SERVICE_MAP_RABBIT_QUEUE_WARN` (padrão 1000); erp-lookup lento (mais de 2 s) ou sem banco do ERP; backend acima dos limites de memória ou disco do `/health`.',
              '**Fora do ar:** o serviço não respondeu ou deu erro. O `postgres-exporter` fica fora do ar quando o alvo `postgres` está `down` no Prometheus.',
              'Os endereços checados vêm das variáveis `SERVICE_MAP_*` do backend; vazias, valem os nomes da rede do compose (`http://rabbitmq:15672`, `http://prometheus:9090`…).',
            ],
          },
        ],
      },
      {
        id: 'roteiro',
        title: 'Roteiro: "configurei e não aconteceu nada"',
        blocks: [
          {
            kind: 'steps',
            steps: [
              {
                title: 'O gatilho chegou?',
                text: 'Para webhook, confira `GET /webhooks/events` — evento com status `ignored` normalmente é assinatura HMAC inválida. Para formulário, confira se a resposta foi gravada.',
              },
              {
                title: 'Algum fluxo casou com o gatilho?',
                text: 'O fluxo precisa estar ativo e o `formId` efetivo precisa bater. Lembre-se: `formId` nulo é curinga, não filtro — um gatilho sem escopo dispara para o sistema inteiro.',
              },
              {
                title: 'A execução foi criada?',
                text: 'Sem registro em `flow_executions`, o problema está antes do motor: fila indisponível ou nenhum fluxo casado.',
              },
              {
                title: 'Qual nó falhou?',
                text: '`node_results` traz status, erro e duração por nó. Um nó que falha não interrompe os anteriores, mas interrompe o ramo que sai dele.',
              },
              {
                title: 'A mensagem foi para a DLQ?',
                text: 'Falhas repetidas de consumo terminam na fila `.dead`. O `DlqMonitorService` mede o tamanho dela a cada 5 minutos.',
              },
            ],
          },
        ],
      },
    ],
    secondary: [
      {
        id: 'metricas',
        title: 'Famílias de métricas',
        blocks: [
          {
            kind: 'list',
            items: [
              'HTTP: duração das requisições e requisições em voo por método.',
              'Banco: contagem de consultas, erros e consultas lentas (limite em `DB_SLOW_QUERY_THRESHOLD_MS`, padrão 500 ms).',
              'RabbitMQ: estado da conexão, publicações e mensagens consumidas por fila e resultado; tamanho das DLQs.',
              'Fluxos: execuções por fluxo e status; execuções por tipo de nó.',
              'Solicitações: total por status, por área, por status de SLA, violações, tempo até conclusão, movimentações no Kanban.',
              'Aprovações: pendentes e decididas por tipo de decisão.',
              'Integrações: entregas de webhook, eventos recebidos, mensagens WhatsApp, disponibilidade e latência dos conectores ERP, falhas de autenticação.',
            ],
          },
          {
            kind: 'endpoints',
            items: [
              { method: 'GET', path: '/metrics', description: 'Exposição Prometheus. Fora do rate limit global.', public: true },
              { method: 'GET', path: '/health', description: 'Health check completo (Terminus), inclui a sonda de admin semeado.', public: true },
              { method: 'GET', path: '/health/ready', description: 'Readiness probe.', public: true },
              { method: 'GET', path: '/health/live', description: 'Liveness probe.', public: true },
              { method: 'GET', path: '/admin/metrics/summary', description: 'Resumo consolidado para a tela de Observabilidade.', permission: 'observability.view_metrics' },
              { method: 'GET', path: '/admin/flows/dlq', description: 'Tamanho das dead-letter queues.', permission: 'system.maintenance' },
              { method: 'GET', path: '/admin/google-sync/health', description: 'Saúde da fila de sincronização com o Google Sheets.', permission: 'system.maintenance' },
            ],
          },
          {
            kind: 'callout',
            tone: 'danger',
            title: 'O que nunca aparece em log',
            text: 'O logger redige `authorization`, `cookie`, `set-cookie`, `password`, `passwordHash`, tokens Google, `apiKey`, `signingSecret`, `appToken`, `userToken` e `sessionToken`. Ao adicionar um campo sensível novo, inclua-o na lista de `redact` em `app.module.ts`.',
          },
        ],
      },
    ],
  },
];
