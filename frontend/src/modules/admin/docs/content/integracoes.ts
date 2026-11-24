import { Cable, MessageCircle, Sheet, Webhook } from 'lucide-react';
import type { DocArticle } from '../../../docs-kit';

export const INTEGRACOES_ARTICLES: DocArticle[] = [
  {
    slug: 'webhooks',
    title: 'Webhooks de entrada e de saída',
    group: 'integracoes',
    icon: Webhook,
    summary:
      'Recebimento de eventos externos com assinatura HMAC e envio de chamadas com retentativa em backoff.',
    tags: ['webhook', 'hmac', 'assinatura', 'entrega', 'retry', 'endpoint', 'token'],
    sourcePaths: { backend: 'backend/src/modules/integrations', frontend: 'frontend/src/modules/integrations' },
    uiRoutes: ['/administracao/webhooks'],
    primary: [
      {
        id: 'entrada',
        title: 'Entrada: recebendo eventos',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Cada origem externa ganha um **endpoint** com token próprio. A URL entregue ao sistema externo é `POST /webhooks/in/<token>` — o token identifica o endpoint e não deve ser tratado como público.',
          },
          {
            kind: 'paragraph',
            text: 'Quando o outro sistema só tem uma **lista** para mandar (ex.: números de pedido para cancelar), use `POST /webhooks/in/<token>/list` (botão "URL de lista"): aceita arquivo .txt/.csv, texto puro ou JSON, um valor por linha ou separados por vírgula/ponto e vírgula; num CSV com cabeçalho vale a coluna do pedido/número. Repetidos contam uma vez, o máximo é 500 por envio e a resposta diz quantos itens entraram. No fluxo, o gatilho de webhook com **Lote** = `itens` roda uma execução por item.',
          },
          {
            kind: 'paragraph',
            text: 'Para o webhook **abrir solicitações num processo**, no mapa do processo puxe a linha do "Webhook recebido" (ou "Agendado") até a fase: entra um "Criar solicitação" com o formulário do processo e a **fase de entrada**, e cada item já nasce nessa fase (sem passar pela primeira; os fluxos "Entrou na fase" dela disparam). No "Criar solicitação" se monta o título (ex.: `Pedido {{item}}`), as respostas do formulário e a chave que evita duplicar. As URLs do endpoint aparecem no próprio gatilho, para copiar.',
          },
          {
            kind: 'diagram',
            id: 'webhook-erp',
            caption:
              'Percurso completo de uma integração de ida e volta — é o desenho da integração com o Protheus, mas vale para qualquer sistema que abra pedido e espere a decisão de volta.',
          },
          {
            kind: 'steps',
            steps: [
              {
                title: 'Endpoint ativo?',
                text: 'Token desconhecido ou endpoint inativo devolve 404 — sem distinção entre os dois casos.',
              },
              {
                title: 'Assinatura, se houver segredo',
                text: 'Com `signing_secret` configurado, o corpo cru é validado por HMAC-SHA256 em comparação de tempo constante. O header aceita o formato `sha256=<hex>` ou o hex puro.',
              },
              {
                title: 'Registro sempre acontece',
                text: 'O evento é gravado em `inbound_webhook_events` mesmo quando a assinatura falha — nesse caso com status `ignored` e o motivo. É o histórico que permite diagnosticar integração mal configurada.',
              },
              {
                title: 'Disparo do fluxo',
                text: 'Se o endpoint tem "disparar fluxo" habilitado, emite `webhooks.received`, que os fluxos com `trigger_webhook_received` escutam.',
              },
            ],
          },
          {
            kind: 'callout',
            tone: 'warning',
            title: 'Sem segredo, sem verificação',
            text: 'Endpoint sem `signing_secret` aceita qualquer corpo enviado com o token. Para integrações em produção, configure o segredo.',
          },
          {
            kind: 'live',
            source: 'webhook-endpoints',
            title: 'Endpoints deste ambiente',
            description: 'Fonte: GET /webhooks/endpoints. Tokens não são exibidos aqui.',
          },
        ],
      },
      {
        id: 'saida',
        title: 'Saída: entregando eventos',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Chamadas de saída (do nó `action_webhook` e dos conectores de formulário) passam pelo `OutboundWebhookService`, que registra cada tentativa em `webhook_deliveries`: URL, método, corpo, status da resposta, número de tentativas e erro.',
          },
          {
            kind: 'list',
            items: [
              'Falha agenda nova tentativa com backoff crescente, até `max_attempts` (padrão 3).',
              'Um cron de 5 minutos reprocessa as entregas com `next_attempt_at` vencido.',
              '`POST /webhooks/deliveries/:id/retry` força uma nova tentativa imediata.',
              'Quando um segredo de assinatura é configurado no nó, a requisição sai assinada com o mesmo esquema HMAC-SHA256 usado na entrada.',
            ],
          },
        ],
      },
    ],
    secondary: [
      {
        id: 'ref-webhooks',
        title: 'Referência',
        blocks: [
          {
            kind: 'endpoints',
            items: [
              { method: 'POST', path: '/webhooks/in/:token', description: 'Recebe um evento externo.', public: true, rateLimit: '60/min' },
              { method: 'POST', path: '/webhooks/in/:token/list', description: 'Recebe só uma lista (ex.: números de pedido): arquivo .txt/.csv no campo "file", texto no corpo ou JSON. Os fluxos recebem { itens: [...] }; até 500 por envio.', public: true, rateLimit: '60/min' },
              { method: 'GET', path: '/webhooks/endpoints', description: 'Lista os endpoints.', permission: 'integrations.manage_channels', note: 'Quem não é admin vê apenas os endpoints que criou.' },
              { method: 'POST', path: '/webhooks/endpoints', description: 'Cria endpoint e gera o token.', permission: 'integrations.manage_channels' },
              { method: 'DELETE', path: '/webhooks/endpoints/:id', description: 'Desativa o endpoint.', permission: 'integrations.manage_channels' },
              { method: 'GET', path: '/webhooks/events', description: 'Eventos recebidos, com status e validade da assinatura.', permission: 'integrations.manage_channels' },
              { method: 'GET', path: '/webhooks/deliveries', description: 'Entregas de saída e suas tentativas.', permission: 'integrations.manage_channels' },
              { method: 'POST', path: '/webhooks/deliveries/:id/retry', description: 'Retenta uma entrega.', permission: 'integrations.manage_channels' },
            ],
          },
          { kind: 'events', emits: ['webhooks.received'] },
          {
            kind: 'entities',
            items: [
              {
                table: 'webhook_endpoints',
                entity: 'WebhookEndpointEntity',
                description: 'Endpoint de entrada.',
                columns: [
                  { name: 'token', type: 'varchar', note: 'compõe a URL pública' },
                  { name: 'signing_secret', type: 'varchar', note: 'ativa a verificação HMAC' },
                  { name: 'flow_trigger_enabled', type: 'boolean', note: 'se falso, apenas registra o evento' },
                ],
              },
              {
                table: 'inbound_webhook_events',
                entity: 'InboundWebhookEventEntity',
                description: 'Evento recebido, com corpo cru, headers filtrados e resultado da assinatura.',
              },
              {
                table: 'webhook_deliveries',
                entity: 'WebhookDeliveryEntity',
                description: 'Entrega de saída, com controle de tentativas e backoff.',
              },
            ],
          },
          {
            kind: 'files',
            items: [
              { path: 'backend/src/modules/integrations/inbound-webhook.service.ts' },
              { path: 'backend/src/modules/integrations/outbound-webhook.service.ts' },
              { path: 'backend/src/common/crypto/hmac.service.ts', note: 'assinatura e verificação' },
            ],
          },
        ],
      },
    ],
  },

  {
    slug: 'erp',
    title: 'Conectores ERP',
    group: 'integracoes',
    icon: Cable,
    summary:
      'Conexão autenticada com sistemas corporativos, com templates de operação, retentativa, saúde e proteção contra SSRF.',
    tags: ['erp', 'protheus', 'totvs', 'conector', 'template', 'ssrf', 'oauth', 'token'],
    sourcePaths: { backend: 'backend/src/modules/integrations/erp' },
    uiRoutes: ['/administracao/erp'],
    primary: [
      {
        id: 'conector-template',
        title: 'Conector e template',
        blocks: [
          {
            kind: 'paragraph',
            text: 'A configuração tem dois níveis. O **conector** representa o sistema: URL base, tipo de autenticação, credenciais e timeout. O **template de operação** representa uma chamada concreta naquele sistema: método, caminho, corpo com interpolação e quais códigos HTTP contam como sucesso.',
          },
          {
            kind: 'paragraph',
            text: 'Um nó `action_erp_operation` referencia o par conector + template. Toda execução grava uma linha em `erp_operation_logs` com URL, corpo enviado, resposta, duração e tentativas — inclusive as bem-sucedidas.',
          },
          {
            kind: 'table',
            columns: ['Tipo de autenticação', 'Como funciona'],
            rows: [
              ['`bearer_static`', 'Token fixo, informado no cadastro'],
              ['`oauth2_client`', 'Client credentials; o token é renovado automaticamente'],
              ['`basic_login`', 'Login e senha em um endpoint que devolve o token'],
            ],
          },
          {
            kind: 'callout',
            tone: 'danger',
            title: 'Credenciais são criptografadas e não voltam',
            text: 'Tokens e credenciais de refresh são gravados criptografados e mascarados como `***` em toda resposta da API. Não há endpoint que devolva o valor original — para trocar, informe o novo valor.',
          },
        ],
      },
      {
        id: 'ssrf',
        title: 'Restrição de destino (SSRF)',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Toda URL usada pelo módulo — ao criar o conector, ao executar, ao retentar e ao checar a saúde — passa por `validateInternalUrl`. A ideia é impedir que uma configuração transforme o backend em intermediário para alcançar endereços arbitrários.',
          },
          {
            kind: 'callout',
            tone: 'warning',
            title: 'Host externo precisa ser liberado',
            text: 'Endereços que não sejam internos precisam constar em `ALLOWED_ERP_HOSTS` (lista separada por vírgula). Sem isso, a criação do conector falha em produção mesmo que funcione em uma máquina local com outra configuração.',
          },
        ],
      },
      {
        id: 'resiliencia',
        title: 'Retentativa, renovação e saúde',
        blocks: [
          {
            kind: 'table',
            columns: ['Rotina', 'Frequência', 'O que faz'],
            rows: [
              ['`checkErpRetries`', '5 min', 'Reenfileira operações pendentes na fila de retentativa'],
              ['`checkAllConnectorsHealth`', '10 min', 'Testa cada conector e guarda o resultado em `last_health_check`'],
              ['`refreshExpiringTokens`', '30 min', 'Renova tokens prestes a expirar (autenticação dinâmica)'],
              ['`cleanupOldLogs`', 'Diária (03:00)', 'Remove logs antigos de operação'],
            ],
          },
          {
            kind: 'paragraph',
            text: 'Falha de autenticação emite `erp.auth.failed`, e o `ErpAuthFailedListener` notifica os responsáveis — credencial vencida é um problema de operação, não de fluxo.',
          },
          {
            kind: 'live',
            source: 'erp-connectors',
            title: 'Conectores deste ambiente',
            description: 'Fonte: GET /admin/erp/connectors. Credenciais aparecem mascaradas.',
          },
        ],
      },
    ],
    secondary: [
      {
        id: 'ref-erp',
        title: 'Referência',
        blocks: [
          {
            kind: 'endpoints',
            items: [
              { method: 'GET', path: '/admin/erp/connectors', description: 'Lista conectores (credenciais mascaradas).', permission: 'integrations.manage' },
              { method: 'POST', path: '/admin/erp/connectors', description: 'Cria conector.', permission: 'integrations.manage' },
              { method: 'PATCH', path: '/admin/erp/connectors/:id', description: 'Atualiza conector; revalida a saúde em segundo plano.', permission: 'integrations.manage' },
              { method: 'PATCH', path: '/admin/erp/connectors/:id/deactivate', description: 'Desativa o conector.', permission: 'integrations.manage' },
              { method: 'DELETE', path: '/admin/erp/connectors/:id', description: 'Remove o conector.', permission: 'integrations.manage' },
              { method: 'POST', path: '/admin/erp/connectors/:id/test', description: 'Testa alcance e credenciais.', permission: 'integrations.manage' },
              { method: 'GET', path: '/admin/erp/connectors/:id/templates', description: 'Templates do conector.', permission: 'integrations.manage' },
              { method: 'POST', path: '/admin/erp/connectors/:id/templates', description: 'Cria template de operação.', permission: 'integrations.manage' },
              { method: 'PATCH', path: '/admin/erp/templates/:id', description: 'Atualiza template.', permission: 'integrations.manage' },
              { method: 'DELETE', path: '/admin/erp/templates/:id', description: 'Desativa template.', permission: 'integrations.manage' },
              { method: 'GET', path: '/admin/erp/logs', description: 'Logs de operação.', permission: 'integrations.view_logs' },
              { method: 'POST', path: '/admin/erp/logs/:id/retry', description: 'Retenta uma operação registrada.', permission: 'integrations.manage' },
              { method: 'GET', path: '/admin/erp/health', description: 'Saúde de todos os conectores (com cache).', permission: 'integrations.view_logs' },
              { method: 'GET', path: '/admin/erp/connectors/:id/health', description: 'Saúde de um conector.', permission: 'integrations.view_logs' },
            ],
          },
          { kind: 'events', emits: ['erp.auth.failed'] },
          {
            kind: 'entities',
            items: [
              {
                table: 'erp_connectors',
                entity: 'ErpConnectorEntity',
                description: 'Sistema externo e suas credenciais.',
                columns: [
                  { name: 'bearer_token', type: 'text', note: 'criptografado' },
                  { name: 'refresh_credentials', type: 'text', note: 'JSON criptografado (client id/secret, login…)' },
                  { name: 'last_health_check', type: 'jsonb', note: 'resultado da última verificação' },
                ],
              },
              {
                table: 'erp_operation_templates',
                entity: 'ErpOperationTemplateEntity',
                description: 'Operação pré-configurada.',
                columns: [
                  { name: 'body_template', type: 'text', note: 'aceita interpolação `{{...}}`' },
                  { name: 'success_status_codes', type: 'jsonb', note: 'padrão `[200]`' },
                  { name: 'save_response_field', type: 'varchar', note: 'caminho a extrair da resposta e guardar' },
                ],
              },
              {
                table: 'erp_operation_logs',
                entity: 'ErpOperationLogEntity',
                description: 'Registro de cada chamada, com tentativas e vínculo à execução de fluxo.',
              },
            ],
          },
          {
            kind: 'code',
            code: `ALLOWED_ERP_HOSTS=            # hosts externos liberados (separados por vírgula)

# Reconciliação opcional (rede de segurança para webhooks perdidos)
ERP_RECONCILIATION_ENABLED=false
ERP_RECONCILIATION_TEMPLATE_ID=   # template que lista pendências
ERP_RECONCILIATION_FLOW_ID=       # fluxo que processa cada item
ERP_RECONCILIATION_ITEMS_PATH=    # caminho até o array na resposta`,
            caption: 'Variáveis de ambiente do módulo',
          },
        ],
      },
    ],
  },

  {
    slug: 'whatsapp',
    title: 'WhatsApp',
    group: 'integracoes',
    icon: MessageCircle,
    summary: 'Envio de mensagens ao solicitante ou ao responsável, com provedor plugável e modo mock.',
    tags: ['whatsapp', 'evolution', 'mensagem', 'notificação externa'],
    sourcePaths: { backend: 'backend/src/modules/integrations/whatsapp' },
    primary: [
      {
        id: 'whats-como',
        title: 'Como funciona',
        blocks: [
          {
            kind: 'paragraph',
            text: 'O provedor é escolhido por variável de ambiente e injetado por token (`WHATSAPP_PROVIDER`). Existem dois: `evolution`, que fala com a Evolution API, e `mock`, que apenas registra a mensagem — o padrão, para que ambientes de desenvolvimento não enviem nada de verdade.',
          },
          {
            kind: 'list',
            items: [
              'O nó `action_send_whatsapp` escolhe o destinatário: solicitante, responsável ou número informado.',
              'O telefone do solicitante é capturado do campo `telefone` da resposta quando a solicitação nasce de um formulário.',
              'Toda mensagem é registrada em `whatsapp_messages`, com provedor, status, ID externo e erro.',
              'A mensagem aceita interpolação e pode incluir o link de acompanhamento.',
            ],
          },
          {
            kind: 'code',
            code: `WHATSAPP_PROVIDER=mock            # ou "evolution"
WHATSAPP_EVOLUTION_BASE_URL=
WHATSAPP_EVOLUTION_API_KEY=
WHATSAPP_EVOLUTION_INSTANCE=formhub
WHATSAPP_TIMEOUT_MS=10000
WHATSAPP_FROM_NUMBER=`,
            caption: 'Configuração por ambiente',
          },
        ],
      },
    ],
    secondary: [
      {
        id: 'ref-whats',
        title: 'Referência',
        blocks: [
          {
            kind: 'endpoints',
            items: [
              { method: 'GET', path: '/integrations/whatsapp/messages', description: 'Histórico de mensagens.', permission: 'integrations.manage_channels' },
              { method: 'GET', path: '/integrations/whatsapp/status', description: 'Provedor ativo e se está configurado.', permission: 'integrations.manage_channels' },
            ],
          },
          {
            kind: 'entities',
            items: [
              {
                table: 'whatsapp_messages',
                entity: 'WhatsAppMessageEntity',
                description: 'Mensagem enviada, vinculada à solicitação e à execução de fluxo que a originou.',
              },
            ],
          },
        ],
      },
    ],
  },

  {
    slug: 'google-workspace',
    title: 'Google Workspace',
    group: 'integracoes',
    icon: Sheet,
    summary:
      'Login com Google, contas vinculadas por usuário e sincronização de respostas com o Google Sheets.',
    tags: ['google', 'oauth', 'sheets', 'planilha', 'sincronização', 'sso'],
    sourcePaths: { backend: 'backend/src/modules/google-workspace' },
    primary: [
      {
        id: 'oauth',
        title: 'OAuth e conta vinculada',
        blocks: [
          {
            kind: 'paragraph',
            text: 'A integração tem dois usos distintos do mesmo OAuth: **entrar** no sistema com a conta Google e **vincular** uma conta Google à sua conta existente, para que o sistema possa criar e escrever planilhas em seu nome.',
          },
          {
            kind: 'list',
            items: [
              'Somente contas do domínio configurado em `GOOGLE_WORKSPACE_DOMAIN` são aceitas.',
              'Os tokens (access e refresh) ficam criptografados com `GOOGLE_TOKEN_ENCRYPTION_KEY` e nunca aparecem em respostas ou logs.',
              'O `GoogleTokenService` renova o access token sob demanda, a partir do refresh token guardado.',
              'Cada formulário guarda qual usuário emprestou a conta (`google_linked_user_id`) — é essa conta que aparece como autora das escritas na planilha.',
            ],
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'Entrar pelo Google cria o usuário, não a senha',
            text: 'Na primeira entrada, `upsertUserFromGoogleLogin` provisiona a conta com perfil `editor` e um `password_hash` aleatório — nenhuma senha utilizável. Depois do callback, o front leva quem está nessa situação para `/definir-senha`, e só o cadastro feito ali habilita a entrada por e-mail e senha. O detalhe está em "Autenticação, perfis e permissões".',
          },
        ],
      },
      {
        id: 'sync',
        title: 'Sincronização com o Sheets',
        blocks: [
          {
            kind: 'paragraph',
            text: 'A escrita na planilha não acontece durante o envio da resposta. Cada resposta cria um **job** em `google_sheets_sync_jobs`, na mesma transação da resposta, e um cron de 30 segundos processa a fila.',
          },
          {
            kind: 'steps',
            steps: [
              { title: 'Job criado', text: 'Nasce com status `queued`, na transação do envio da resposta.' },
              { title: 'Ciclo de sincronização', text: 'A cada 30 s o serviço pega os jobs vencidos, garante os cabeçalhos da planilha e acrescenta a linha.' },
              { title: 'Falha', text: 'Reagenda com nova tentativa, até `max_attempts` (padrão 8), guardando o último erro.' },
              { title: 'Limpeza', text: 'Jobs antigos são removidos diariamente às 03:00.' },
            ],
          },
          {
            kind: 'callout',
            tone: 'info',
            title: 'Recuperação manual',
            text: '`reenqueue` recoloca na fila os jobs travados em `processing`; `reprocess` cria jobs para respostas que nunca chegaram à planilha. Ambos estão na tela do formulário e ficam registrados na auditoria.',
          },
        ],
      },
    ],
    secondary: [
      {
        id: 'ref-google',
        title: 'Referência',
        blocks: [
          {
            kind: 'endpoints',
            items: [
              { method: 'GET', path: '/auth/google/login-url', description: 'URL de login OAuth.' },
              { method: 'GET', path: '/auth/google/status', description: 'Situação da conta vinculada.' },
              { method: 'POST', path: '/auth/google/disconnect', description: 'Desvincula a conta e apaga os tokens.' },
              { method: 'GET', path: '/integrations/google/callback', description: 'Callback do OAuth.', public: true },
              { method: 'GET', path: '/admin/google-sync/health', description: 'Saúde da fila de sincronização.', permission: 'system.maintenance' },
            ],
          },
          { kind: 'events', emits: ['forms.google_sheet_created', 'forms.google_sync_reenqueued', 'forms.google_sync_reprocessed', 'auth.google_connect', 'auth.google_disconnect'] },
          {
            kind: 'entities',
            items: [
              {
                table: 'google_sheets_sync_jobs',
                entity: 'GoogleSheetsSyncJobEntity',
                description: 'Fila de linhas a escrever na planilha.',
                columns: [
                  { name: 'status', type: 'varchar', note: '`queued`, `processing`, `completed`, `failed`' },
                  { name: 'max_attempts', type: 'int', note: 'padrão 8' },
                  { name: 'next_attempt_at', type: 'timestamptz', note: 'controla o reagendamento' },
                ],
              },
            ],
          },
          {
            kind: 'code',
            code: `GOOGLE_WORKSPACE_DOMAIN=suaempresa.com.br
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_CALLBACK_URL=http://localhost:3000/api/v1/auth/google/callback
GOOGLE_TOKEN_ENCRYPTION_KEY=      # obrigatória quando o client id está definido`,
            caption: 'Configuração por ambiente',
          },
        ],
      },
    ],
  },
];
