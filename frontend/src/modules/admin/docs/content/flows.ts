import { Workflow } from 'lucide-react';
import type { DocArticle } from '../../../docs-kit';

export const FLOWS_ARTICLE: DocArticle = {
  slug: 'fluxos',
  title: 'Fluxos (motor de automação)',
  group: 'automacao',
  icon: Workflow,
  summary:
    'O grafo de gatilhos, condições e ações que conecta formulários, solicitações, aprovações e sistemas externos.',
  tags: [
    'fluxo',
    'flow',
    'automação',
    'gatilho',
    'trigger',
    'nó',
    'node',
    'condição',
    'ação',
    'interpolação',
    'execução',
  ],
  sourcePaths: { backend: 'backend/src/modules/flows', frontend: 'frontend/src/modules/flows' },
  uiRoutes: ['/flows', '/flows/:id'],
  primary: [
    {
      id: 'conceito',
      title: 'O que é um fluxo',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Um fluxo é um grafo desenhado no editor: **gatilhos** definem quando ele roda, **condições** dividem o caminho e **ações** produzem efeito. O grafo inteiro é gravado em duas colunas `jsonb` (`nodes` e `edges`) da tabela `flows` — não existe tabela por tipo de nó.',
        },
        { kind: 'diagram', id: 'motor-flows' },
        {
          kind: 'paragraph',
          text: 'Entre o evento e a execução existe sempre uma fila. O listener apenas descobre quais fluxos casam com o evento e publica um job no RabbitMQ; quem executa é o `FlowsConsumer`. Por isso um fluxo nunca atrasa a requisição do usuário — e por isso o resultado precisa ser conferido em `flow_executions`, não na resposta HTTP.',
        },
      ],
    },
    {
      id: 'gatilhos',
      title: 'Gatilhos',
      blocks: [
        {
          kind: 'table',
          columns: ['Gatilho', 'Dispara quando', 'Escopo'],
          rows: [
            ['`trigger_form_submit`', 'Uma resposta é enviada', 'Formulário do nó, ou o do fluxo'],
            ['`trigger_webhook_received`', 'Chega um webhook em um endpoint', 'Endpoint configurado no nó'],
            ['`trigger_solicitation_created`', 'Uma solicitação é criada', 'Formulário da solicitação'],
            ['`trigger_solicitation_moved`', 'Uma solicitação muda de status', 'Formulário da solicitação'],
            ['`trigger_approval_completed`', 'Uma aprovação é aprovada ou reprovada', 'Formulário da solicitação'],
            ['`trigger_sla_warning`', 'O SLA passa do limite de alerta', 'Formulário da solicitação'],
            ['`trigger_sla_breached`', 'O SLA é violado', 'Formulário da solicitação'],
            ['`trigger_scheduled`', 'Chega a hora agendada', 'Não usa formulário'],
          ],
        },
        {
          kind: 'callout',
          tone: 'danger',
          title: 'A regra que mais causa surpresa: `formId` nulo é curinga',
          text: 'Em `findActiveFlowEntries`, um gatilho sem formulário definido casa com eventos de **qualquer** formulário. Um `trigger_approval_completed` sem escopo, por exemplo, dispara para toda aprovação concluída no sistema, não só para as do processo que você tinha em mente.',
        },
        {
          kind: 'paragraph',
          text: 'O escopo efetivo é resolvido em `getEffectiveTriggerFormId`, nesta ordem: `data.formId` do nó de gatilho → `flows.form_id` (coluna do fluxo) → nulo. Como o autosave do editor reescreve o conteúdo dos nós a cada salvamento, **a coluna do fluxo é a amarração mais confiável** — ela nunca é tocada pelo canvas.',
        },
        {
          kind: 'paragraph',
          text: 'Um fluxo pode ter **vários gatilhos**: cada um é uma entrada ligada ao ponto onde o processo começa por ela — por exemplo, o envio do formulário entra pela aprovação da Logística e um lote de pedidos recebido por webhook entra direto no Financeiro. Cada gatilho confere os próprios filtros; se mais de um aceita o mesmo evento, o fluxo roda uma vez, pelo mais específico. Só pode haver um gatilho agendado por fluxo.',
        },
        {
          kind: 'paragraph',
          text: 'No webhook, **Lote** aponta uma lista do payload (ex.: `pedidos`): cada item vira uma execução, com o item em `{{item}}` (ou `payload.campo`), até 500 por chamada. Uma solicitação criada por fluxo tem origem `webhook`: marque só **Envio de formulário** no gatilho de solicitação criada para ela não entrar de novo pelo começo.',
        },
        {
          kind: 'paragraph',
          text: 'O gatilho agendado aceita intervalo (`a cada N minutos/horas/dias`) ou expressão cron de 5 ou 6 campos, com fuso configurável (padrão `America/Sao_Paulo`). Um cron de 1 minuto varre até 50 fluxos vencidos por vez, usando `next_run_at`; falhas seguidas ficam contabilizadas em `consecutive_failure_count`.',
        },
      ],
    },
    {
      id: 'condicoes',
      title: 'Condições',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Nós de condição têm duas saídas — `yes` e `no` — e são o único ponto em que o grafo se divide. Um nó de ação sempre segue por todas as arestas que saem dele.',
        },
        {
          kind: 'table',
          columns: ['Condição', 'Avalia'],
          rows: [
            ['`condition_field_value`', 'Um campo da resposta que originou o fluxo'],
            ['`condition_response_value`', 'Um caminho na resposta do último `action_http_check`'],
            ['`condition_solicitation_status`', 'Status atual da solicitação'],
            ['`condition_solicitation_priority`', 'Prioridade, com comparação por ranking'],
            ['`condition_always_true`', 'Sempre segue pela saída `yes` (útil para juntar ramos)'],
          ],
        },
        {
          kind: 'list',
          items: [
            'Operadores: `equals`, `not_equals`, `contains`, `greater_than`, `less_than`, `is_empty`, `is_not_empty`.',
            'Comparações numéricas entendem o formato brasileiro: `18.500,00` é interpretado como 18500.',
            'Comparação de prioridade usa ranking, então `greater_than: medium` inclui `high` e `urgent`.',
          ],
        },
      ],
    },
    {
      id: 'acoes',
      title: 'Ações',
      blocks: [
        {
          kind: 'table',
          columns: ['Ação', 'Efeito'],
          rows: [
            ['`action_send_email`', 'Envia e-mail com assunto e corpo interpolados'],
            ['`action_notification`', 'Notificação por canal (sistema, e-mail ou WhatsApp) para um ou vários destinatários, com rastreio por tentativa, retentativa, idempotência e agendamento (ver "Notificações")'],
            ['`action_notify_users`', 'Cria notificação in-app para usuários escolhidos'],
            ['`action_webhook`', 'POST/GET/PUT/PATCH para uma URL, com assinatura e retentativas'],
            ['`action_http_check`', 'Chamada HTTP cuja resposta fica disponível para `condition_response_value`'],
            ['`action_google_sheets`', 'Acrescenta uma linha em uma planilha'],
            ['`action_update_solicitation_status`', 'Altera o status da solicitação'],
            ['`action_move_kanban_card`', 'Move o card de coluna/fase'],
            ['`action_assign_responsible`', 'Define o responsável'],
            ['`action_create_approval`', 'Abre uma aprovação e pausa o fluxo até a decisão (ver "Execução"). Aprovadores: fixos, **"Quem aprova a fase"** (perfis e usuários configurados na fase — a do gatilho de fase ou a do último "Mover para fase" antes do nó), do payload do webhook ou do e-mail que o solicitante informou num campo (`approverSourceMode: field`). Aprovador sem usuário decide por um link pessoal enviado por e-mail (`approverEmails` na lista fixa, ou `allowExternalApprovers` nos modos campo/dinâmico) — ver `Docs/aprovacao_externa_por_link.md`. **"Avisar quem aprova por e-mail"** (botão "Editar e-mail": assunto, texto, variáveis e prévia) manda a cada aprovador com usuário um e-mail com o link `{{approval_link}}`, que abre a decisão direto em Aprovações'],
            ['`action_move_phase`', 'Move o card para uma fase (respeita a trava de aprovação da fase atual). Daí em diante o fluxo **está** na fase de destino: um "Criar aprovação" com "Quem aprova a fase" logo depois vai para quem aprova ESSA fase'],
            ['`action_wait_for_phase_fields`', 'Pausa até os campos de uma fase serem salvos no card'],
            ['`action_create_solicitation_from_payload`', 'Cria solicitação a partir do JSON recebido'],
            ['`action_forward_to_process`', '**Encaminhar para outro processo**: cria no processo de destino um card com **envio de verdade** (aparece em Respostas e Registros), o mesmo solicitante e as respostas do card atual — campos de mesmo código vão sozinhos; os demais por mapeamento (campo da origem ou texto com `{{variáveis}}`). Seleção casa pelo valor ou pelo rótulo da opção; o cálculo do destino é refeito; anexos são copiados (arquivo novo). Os dois cards ficam ligados ("Veio de" / "Encaminhado para"). Cada card vai **uma vez** para cada processo. Os nós seguintes continuam no card de origem'],
            ['`action_send_whatsapp`', 'Envia mensagem ao solicitante, ao responsável ou a um número'],
            ['`action_erp_operation`', 'Executa um template de operação de um conector ERP'],
            ['`action_run_flow`', 'Chama outro fluxo, em modo síncrono ou assíncrono'],
          ],
        },
        {
          kind: 'callout',
          tone: 'success',
          title: 'Exemplo: processo por aprovações (cancelamento de pedido)',
          text: 'Gatilho "Solicitação criada" com dois ramos: (1) Notificação WhatsApp no grupo, em segundo plano; (2) Mover para "Logística" → Criar aprovação (Quem aprova a fase, avisar por e-mail) → Resultado da aprovação: aprovado → Mover para "Financeiro" → Criar aprovação → aprovado → Notificação por e-mail aos setores → Mover para "Concluído". No ramo "não", avisar o solicitante e marcar a solicitação como rejeitada. Quem aprova cada etapa é configurado na própria fase (engrenagem → Acesso e aprovação), não no fluxo.',
        },
        {
          kind: 'callout',
          tone: 'info',
          title: 'Criação de solicitação a partir de payload',
          text: 'O nó mapeia caminhos do JSON (`header.numeroPedido`, `valores.total`…) para título, descrição e chaves de `metadata`. O caminho escolhido como chave de idempotência é o que impede que um reenvio do mesmo evento crie uma segunda solicitação.',
        },
      ],
    },
    {
      id: 'notificacoes',
      title: 'Notificações (nó "Notificação")',
      blocks: [
        {
          kind: 'paragraph',
          text: 'O nó `action_notification` envia uma notificação por um canal — `in_app` (o sino do topo), `email` ou `whatsapp` — para um ou vários destinatários. Ele convive com os nós antigos (`action_send_email`, `action_notify_users`, `action_send_whatsapp`), que continuam funcionando como antes.',
        },
        {
          kind: 'list',
          items: [
            'Destinatários: usuários do sistema, solicitante, responsável da solicitação, e-mail/telefone fixo, valor de um campo do formulário ou um caminho do payload do webhook. O que não puder ser resolvido (ex.: solicitação sem responsável) fica registrado como falha — nunca some.',
            'WhatsApp para **grupo**: no destinatário fixo, informe o ID do grupo (termina em `@g.us`) ou use "Escolher grupo do WhatsApp", que lista os grupos da instância da Evolution API (`GET /integrations/whatsapp/groups`).',
            'Conteúdo em texto puro com `{{variáveis}}`, resolvidas em passada única: nenhum HTML é interpretado e um valor nunca é reexpandido. Variável inexistente vira vazio e é apontada na prévia do editor.',
            'Envio imediato (o fluxo espera o resultado da 1ª tentativa) ou em segundo plano / com atraso de até 7 dias (o fluxo segue e um worker envia depois).',
            'Falha permanente (endereço inválido, canal não configurado, 4xx do provedor) falha o nó. Falha transitória (rede, 5xx, 429) é reenviada em segundo plano, com intervalo crescente, e não interrompe o fluxo. "Continuar o fluxo se falhar" faz o motor seguir mesmo com o nó em `failed` — a falha continua na execução.',
            'Idempotência: uma notificação por execução + nó (ou pela chave do template, ex.: `aviso-{{solicitation_number}}`). Reprocessar a execução não reenvia a quem já recebeu.',
            '"Enviado" significa que o provedor ACEITOU a mensagem (SMTP/Evolution API); só o canal do sistema comprova entrega. Em produção, canal sem provedor configurado FALHA (not_configured) em vez de simular o envio.',
            'Cada notificação é rastreável até fluxo, execução e nó (`notification_messages`), com um registro por destinatário e por tentativa; o histórico da execução no editor mostra tudo isso, com cancelar/reenviar para quem tem `flows.manage`.',
            'No teste manual do fluxo o nó roda em dry-run: renderiza e valida, mas não envia nem grava.',
          ],
        },
        {
          kind: 'callout',
          tone: 'info',
          title: 'Privacidade',
          text: 'Quem só pode ver o fluxo (`flows.view`) enxerga estados e erros com endereços mascarados e sem o conteúdo; conteúdo e endereços completos exigem `flows.manage`. Logs e o `output` do nó nunca trazem e-mail, telefone ou texto da mensagem. Notificações concluídas são expurgadas após `NOTIFICATIONS_RETENTION_DAYS` (90 por padrão).',
        },
      ],
    },
    {
      id: 'interpolacao',
      title: 'Variáveis de interpolação',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Campos de texto das ações aceitam `{{variavel}}`. Além das variáveis nomeadas abaixo, qualquer `{{codigo}}` não reconhecido é resolvido contra os campos da resposta e, em seguida, contra `metadata` do contexto — é assim que `{{decision}}`, por exemplo, chega ao corpo de um retorno de aprovação. Os **campos de fase** já salvos no card (ex.: `{{romaneio}}`) também entram, e servem nas condições; num código repetido vale o do formulário.',
        },
        {
          kind: 'code',
          code: `{{responder_name}}                 nome de quem respondeu o formulário
{{responder_email}}                e-mail de quem respondeu
{{form_name}}                      nome do formulário
{{submitted_at}}                   data/hora do envio (pt-BR)
{{solicitation_number}}            id da solicitação
{{solicitation_title}}             título
{{solicitation_status}}            status atual
{{solicitation_priority}}          prioridade
{{solicitation_requester_name}}    solicitante
{{solicitation_requester_email}}   e-mail do solicitante
{{solicitation_responsible_name}}  responsável atribuído
{{tracking_url}}                   link público de acompanhamento
{{approval_link}}                  link que abre a decisão da aprovação em Aprovações
{{approval_title}}                 título da aprovação do contexto
{{approval_description}}           descrição da aprovação
{{approval_status}}                resultado da aprovação (approved/rejected)
{{campo}}                          campo da resposta OU campo de fase já salvo no card
{{campo_codigo}}                   código no ERP de um campo "Lista do ERP"
{{qualquer_campo}}                 campo da resposta ou chave de metadata`,
          caption: 'FlowExecutionEngine.interpolate()',
        },
        {
          kind: 'callout',
          tone: 'warning',
          title: 'Sem tradução de valores',
          text: 'As variáveis devolvem o valor cru gravado. `{{solicitation_status}}` produz `waiting_approval`, e a decisão de uma aprovação produz `approved`/`rejected` em inglês. Se o destino externo espera outro vocabulário, a conversão precisa ser feita do lado de lá ou com um nó intermediário.',
        },
      ],
    },
    {
      id: 'execucao',
      title: 'Execução, limites e depuração',
      blocks: [
        {
          kind: 'steps',
          steps: [
            {
              title: 'Percurso do grafo',
              text: 'A execução começa nos nós de gatilho e caminha pelas arestas. Cada nó grava status, saída, erro e duração em `node_results`.',
            },
            {
              title: 'Aprovação pausa, não conclui',
              text: 'Ao alcançar `action_create_approval`, a execução para ali: grava `status: waiting_approval` e `paused_node_id` na execução, sem seguir para os nós seguintes. Quando a aprovação é decidida, `FlowsApprovalListener` retoma a partir daquele nó — via `FlowExecutionEngine.resumeFrom` — e só então os ramos de aprovado/reprovado rodam. Antes dessa pausa existir, os nós depois de `action_create_approval` executavam na hora, antes de qualquer decisão humana.',
            },
            {
              title: 'Falha não derruba o fluxo inteiro',
              text: 'Um nó que falha é marcado como `failed` e interrompe apenas o ramo que sai dele. Os nós já executados permanecem — inclusive seus efeitos colaterais, que não são revertidos.',
            },
            {
              title: 'Teste sem efeito real',
              text: '`POST /flows/:id/test` executa o fluxo com um contexto informado, permitindo validar mapeamentos e condições antes de ativar.',
            },
            {
              title: 'Onde investigar',
              text: '`GET /flows/:id/executions` traz o histórico com o resultado nó a nó. É o primeiro lugar a olhar quando "o fluxo não fez nada".',
            },
          ],
        },
        {
          kind: 'table',
          columns: ['Limite', 'Valor', 'Por quê'],
          rows: [
            ['Nós por fluxo', '100', 'Limite de validação na gravação'],
            ['Profundidade de percurso', '50 níveis', 'Proteção contra ciclos no grafo'],
            ['Sub-fluxos aninhados', '5 níveis', '`action_run_flow`; além disso, repetir um fluxo na pilha é recursão e falha'],
            ['Encadeamento por eventos', '3 níveis', 'Ações que emitem eventos que disparam outros fluxos'],
            ['Fluxos agendados por minuto', '50', 'Lote do cron de gatilho agendado'],
          ],
        },
        {
          kind: 'callout',
          tone: 'success',
          title: 'Reconciliação como rede de segurança',
          text: 'Para integrações que dependem de webhook, o `FlowsErpReconciliationService` (desligado por padrão) consulta periodicamente uma lista de pendências no ERP e reexecuta o mesmo fluxo para cada item. Como reaproveita o fluxo original, herda a idempotência dele em vez de duplicar regras.',
        },
      ],
    },
    {
      id: 'fluxos-ambiente',
      title: 'Fluxos deste ambiente',
      blocks: [
        {
          kind: 'live',
          source: 'flows',
          title: 'Fluxos cadastrados',
          description: 'Fonte: GET /flows. Um fluxo inativo nunca casa com gatilho algum.',
        },
      ],
    },
  ],
  secondary: [
    {
      id: 'endpoints-flows',
      title: 'Endpoints',
      blocks: [
        {
          kind: 'endpoints',
          items: [
            { method: 'GET', path: '/flows', description: 'Lista paginada de fluxos.', permission: 'flows.view' },
            { method: 'GET', path: '/forms/:formId/flows', description: 'Fluxos de um formulário.', permission: 'flows.view' },
            { method: 'GET', path: '/flows/:id', description: 'Fluxo com nós, arestas e viewport.', permission: 'flows.view' },
            { method: 'POST', path: '/flows', description: 'Cria fluxo avulso (sem formulário).', permission: 'flows.manage' },
            { method: 'POST', path: '/forms/:formId/flows', description: 'Cria fluxo já amarrado a um formulário.', permission: 'flows.manage' },
            { method: 'PATCH', path: '/flows/:id', description: 'Salva o grafo e os metadados.', permission: 'flows.manage' },
            { method: 'PATCH', path: '/flows/:id/active', description: 'Ativa ou desativa o fluxo.', permission: 'flows.manage' },
            { method: 'DELETE', path: '/flows/:id', description: 'Remove o fluxo.', permission: 'flows.manage' },
            { method: 'POST', path: '/flows/:id/test', description: 'Executa o fluxo com um contexto de teste.', permission: 'flows.manage' },
            { method: 'GET', path: '/flows/:id/executions', description: 'Histórico de execuções, com resultado por nó.', permission: 'flows.view' },
            { method: 'POST', path: '/flows/notifications/preview', description: 'Prévia da mensagem do nó de notificação, com valores de exemplo.', permission: 'flows.manage' },
            { method: 'GET', path: '/flows/:flowId/notifications', description: 'Notificações geradas pelo fluxo (filtro por execução e status); conteúdo e endereços completos só com flows.manage.', permission: 'flows.view' },
            { method: 'GET', path: '/flows/:flowId/notifications/:notificationId', description: 'Detalhe de uma notificação, com destinatários e tentativas.', permission: 'flows.view' },
            { method: 'POST', path: '/flows/:flowId/notifications/:notificationId/cancel', description: 'Cancela o que ainda não foi enviado (pendente/agendado).', permission: 'flows.manage' },
            { method: 'POST', path: '/flows/:flowId/notifications/:notificationId/retry', description: 'Reenvia os destinatários que falharam por motivo recuperável.', permission: 'flows.manage' },
            { method: 'GET', path: '/notifications/inbox', description: 'Caixa de entrada do usuário autenticado (paginada).' },
            { method: 'GET', path: '/notifications/inbox/unread-count', description: 'Quantidade de notificações internas não lidas.' },
            { method: 'PATCH', path: '/notifications/inbox/:id/read', description: 'Marca uma notificação interna como lida.' },
            { method: 'POST', path: '/notifications/inbox/read-all', description: 'Marca todas as notificações internas como lidas.' },
            { method: 'GET', path: '/admin/flows/dlq', description: 'Estado das dead-letter queues de fluxo.', permission: 'system.maintenance' },
            { method: 'POST', path: '/admin/flows/migrate-form-ids', description: 'Copia `flows.form_id` para os nós `trigger_form_submit` que estiverem sem escopo.', permission: 'system.maintenance' },
          ],
        },
        {
          kind: 'events',
          listens: [
            'responses.submitted',
            'solicitations.created',
            'solicitations.moved',
            'approvals.approved',
            'approvals.rejected',
            'solicitations.sla.warning',
            'solicitations.sla.breached',
            'webhooks.received',
          ],
        },
      ],
    },
    {
      id: 'entidades-flows',
      title: 'Entidades',
      blocks: [
        {
          kind: 'entities',
          items: [
            {
              table: 'flows',
              entity: 'FlowEntity',
              description: 'O fluxo e seu grafo.',
              columns: [
                { name: 'nodes', type: 'jsonb', note: 'array de `FlowNode` (id, type, position, data)' },
                { name: 'edges', type: 'jsonb', note: 'array de `FlowEdge` (source, sourceHandle, target)' },
                { name: 'form_id', type: 'uuid', note: 'escopo do gatilho; preservado pelo autosave do editor' },
                { name: 'is_active', type: 'boolean', note: 'fluxo inativo não casa com nenhum gatilho' },
                { name: 'next_run_at', type: 'timestamptz', note: 'próxima execução do gatilho agendado' },
              ],
            },
            {
              table: 'notification_messages',
              entity: 'NotificationMessageEntity',
              description: 'Uma notificação solicitada por um nó (conteúdo já renderizado, canal e correlação).',
              columns: [
                { name: 'flow_id / flow_execution_id / node_id', type: 'uuid / varchar', note: 'origem — rastreia a notificação até o fluxo, a execução e o nó' },
                { name: 'status', type: 'varchar', note: 'agregado dos destinatários: pending, scheduled, processing, sent, delivered, partially_sent, failed, cancelled' },
                { name: 'idempotency_key', type: 'varchar', note: 'único — a mesma chave devolve a notificação já criada (reprocesso não reenvia)' },
                { name: 'max_attempts / backoff_seconds', type: 'smallint / int', note: 'política de retentativa do nó' },
              ],
            },
            {
              table: 'notification_recipients',
              entity: 'NotificationRecipientEntity',
              description: 'Um destinatário: unidade de entrega e fila do worker.',
              columns: [
                { name: 'status', type: 'varchar', note: 'scheduled, pending, processing, sent, delivered, failed, cancelled (transições validadas)' },
                { name: 'next_attempt_at', type: 'timestamptz', note: 'quando fica elegível: 1ª tentativa programada ou próxima retentativa' },
                { name: 'address', type: 'varchar', note: 'e-mail/telefone normalizado — dado pessoal, mascarado na API e expurgado com a notificação' },
                { name: 'provider_message_id', type: 'varchar', note: 'id devolvido pelo provedor' },
              ],
            },
            {
              table: 'notification_attempts',
              entity: 'NotificationAttemptEntity',
              description: 'Cada tentativa de envio, para auditoria.',
              columns: [
                { name: 'status', type: 'varchar', note: 'started, success, failed, abandoned' },
                { name: 'error_category / error_message', type: 'varchar', note: 'categoria e erro sanitizado (sem e-mail, telefone, URL ou segredo)' },
              ],
            },
            {
              table: 'flow_executions',
              entity: 'FlowExecutionEntity',
              description: 'Uma execução do fluxo.',
              columns: [
                { name: 'node_results', type: 'jsonb', note: '`{ nodeId, status, output, error, durationMs }` por nó' },
                { name: 'event_name', type: 'varchar', note: 'evento que originou a execução' },
                { name: 'parent_flow_id', type: 'uuid', note: 'preenchido quando chamado por `action_run_flow`' },
                {
                  name: 'status',
                  type: 'varchar',
                  note: 'inclui `waiting_approval` (parada em `action_create_approval`, esperando decisão), `waiting_phase_fields` e `waiting_subflow` (pai de um `action_run_flow` síncrono esperando o filho terminar)',
                },
                {
                  name: 'paused_node_id',
                  type: 'varchar',
                  note: 'id do nó de aprovação onde a execução parou; é por onde `resumeFrom` retoma',
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'arquivos-flows',
      title: 'Arquivos-chave',
      blocks: [
        {
          kind: 'files',
          items: [
            { path: 'backend/src/modules/flows/flow-execution.engine.ts', note: 'percurso do grafo, execução dos nós, interpolação e a pausa/retomada em `action_create_approval` (`resumeFrom`)' },
            { path: 'backend/src/modules/notifications/', note: 'módulo de notificações: canais (in_app, e-mail, WhatsApp), despacho/worker, estados, retentativa, renderização segura e caixa de entrada (ver Docs/modulo_notificacoes.md)' },
            { path: 'backend/src/modules/flows/notification/', note: 'o nó action_notification: executor, resolução de destinatários e validação estática' },
            { path: 'backend/src/modules/flows/flows.service.ts', note: 'CRUD, validação do grafo, casamento de gatilho e `resumePausedExecution`' },
            { path: 'backend/src/modules/flows/flows-approval.listener.ts', note: 'ao decidir uma aprovação, retoma toda execução parada nela' },
            { path: 'backend/src/modules/flows/types/flow.types.ts', note: 'tipos de nó e formato de `data` de cada um' },
            { path: 'backend/src/modules/flows/flows.consumer.ts', note: 'consumo dos jobs da fila, inclusive o job de retomada (`FlowResumeJob`)' },
            { path: 'backend/src/modules/flows/flows-scheduled-trigger.service.ts', note: 'gatilho agendado' },
            { path: 'backend/src/modules/flows/flows-erp-reconciliation.service.ts', note: 'reconciliação opcional' },
            { path: 'frontend/src/modules/flows/', note: 'editor visual (@xyflow/react)' },
          ],
        },
      ],
    },
  ],
};
