# Motor de fluxos — como funciona hoje

> Documento técnico extraído do código (commit `a9394b1`, **antes** do módulo de notificações).
> Todas as referências `arquivo:linha` apontam para esse estado. Onde o módulo de notificações
> alterou algum ponto, a seção correspondente em [`modulo_notificacoes.md`](modulo_notificacoes.md)
> indica o que mudou.

## 1. Visão geral do sistema

| Aspecto | Evidência |
|---|---|
| Monorepo: `backend/` (NestJS 10 + TypeORM 0.3 + PostgreSQL 16), `frontend/` (React 18 + Vite 5 + `@xyflow/react` 12 + TanStack Query + Tailwind), `mobile/` (Expo/React Native) | `backend/package.json`, `frontend/package.json:18-44`, `mobile/` |
| Infra por `docker-compose.yml` com *profiles*: `app` (postgres, rabbitmq, evolution-api, backend, frontend), `observability` (prometheus, grafana, postgres-exporter), `tools` (pgadmin) | `docker-compose.yml:4,29,55,106,150,178,197,227,252` |
| Entrada do backend: `bootstrap()` — helmet, CORS, prefixo global, versionamento URI (`/api/v1`), `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`), Swagger fora de produção, seed do admin e das configurações | `backend/src/main.ts:15-80` |
| Composição: `AppModule` importa ~30 módulos de domínio; `ScheduleModule.forRoot()` (crons), `ThrottlerModule` global (100 req/min), `EventEmitterModule` (eventos de domínio), `LoggerModule` (pino, com `redact`) | `backend/src/app.module.ts:54,55,70` |
| Persistência: PostgreSQL via TypeORM; schema **só** por migration em produção (`DB_SYNC=false`), `migrationsRun` condicionado a `DB_AUTO_MIGRATE` | `app.module.ts:104,106`, `backend/src/database/migrations/README.md` |
| Autenticação: JWT (`JwtAuthGuard`) + autorização por permissão/escopo (`PermissionsGuard`, `@RequirePermission('flows.manage')`); escopo `all`/`own`/`assigned` por perfil, semeado em migration (`RolesAndPermissions`) | `common/guards/permissions.guard.ts`, `migrations/1786000000000-RolesAndPermissions.ts:66-119` |
| Síncrono × assíncrono: eventos de domínio (`@OnEvent`) → publicação em RabbitMQ (fila durável + DLQ + TTL 24 h + retry exponencial 3×) **com fallback inline** se o broker estiver indisponível | `flows.listener.ts:34-45`, `queue/rabbitmq.service.ts:229-241,245-258` |
| Tarefas agendadas: `@Cron` (`FlowsScheduledTriggerService.pollDueFlows`, a cada minuto) | `flows-scheduled-trigger.service.ts:31` |
| Integrações externas: WhatsApp (Evolution API / mock), ERP (Protheus), Google Sheets/OAuth, LOPS IA, webhooks de entrada/saída, SMTP (nodemailer), Expo Push | `modules/integrations/**`, `modules/notifications/expo-push.service.ts`, `flows/mailer/flow-mailer.service.ts` |
| Logs/observabilidade: `Logger` do Nest + pino (`redact` de authorization/cookie/senhas/`*.apiKey`/`*.signingSecret`…), métricas `prom-client` em `MetricsService`, Grafana provisionado | `app.module.ts:70-83`, `modules/observability/metrics.service.ts` |
| Testes: Jest unitário (`*.spec.ts` ao lado do código, limiar de cobertura global em `jest.config.ts`) + suíte de integração contra Postgres real (`test/integration/*.integration.spec.ts`, `npm run test:integration`, job `integration` do CI) + Vitest no frontend | `backend/jest.config.ts`, `backend/test/jest.integration.config.ts`, `.github/workflows/ci.yml` |

## 2. Estrutura de um fluxo

### 2.1 Modelo de dados

*Fluxo* — `FlowEntity` (`database/entities/flow.entity.ts`, tabela `flows`):
`id`, `form_id` (opcional), `name` (único por criador), `is_active`, `next_run_at`/`last_run_at`/`consecutive_failure_count`
(gatilho agendado), **`nodes` (jsonb)**, **`edges` (jsonb)**, `viewport` (jsonb), `created_by`.

Nós e arestas **não são tabelas**: vivem como JSON dentro do fluxo (`flow.entity.ts:45-48`).

*Nó* — `FlowNode` (`flows/types/flow.types.ts:94`):

```ts
{ id: string; type: FlowNodeType; position: {x,y}; data: FlowNodeData }
```

*Aresta* — `FlowEdge` (`flow.types.ts:101`): `{ id, source, sourceHandle?, target }`.
`sourceHandle` só é significativo nas condições (`'yes'`/`'no'`).

*Execução* — `FlowExecutionEntity` (`flow-execution.entity.ts`, tabela `flow_executions`): `flow_id`, `submission_id`,
`event_name`, `solicitation_id`, `approval_id`, `status`
(`pending|running|success|failed|skipped|partial_failure|waiting_approval|waiting_phase_fields|waiting_subflow`),
`paused_node_id`, `waiting_phase_id`, `started_at`, `completed_at`, **`node_results` (jsonb)**, `error_message`,
`parent_flow_id`/`parent_execution_id` (sub-fluxos). Único parcial `UQ_flow_executions_flow_submission` (`flow_id`,`submission_id`
quando não nulo **e** `event_name = 'responses.submitted'` — migration `1788600000000-FlowExecutionSubmitOnlyUniqueness`).

### 2.2 Tipos de nó suportados (`flow.types.ts:11-45`)

* **Gatilhos (10)**: `trigger_form_submit`, `trigger_webhook_received`, `trigger_solicitation_created`,
  `trigger_solicitation_moved`, `trigger_approval_completed`, `trigger_sla_warning`, `trigger_sla_breached`,
  `trigger_scheduled`, `trigger_attachment_uploaded`, `trigger_phase_field_saved`.
* **Condições (6)**: `condition_field_value`, `condition_always_true`, `condition_solicitation_status`,
  `condition_solicitation_priority`, `condition_response_value`, `condition_approval_result`.
* **Ações (16)**: `action_send_email`, `action_webhook`, `action_http_check`, `action_notify_users`,
  `action_google_sheets`, `action_update_solicitation_status`, `action_move_kanban_card`, `action_create_approval`,
  `action_create_solicitation_from_payload`, `action_assign_responsible`,
  `action_send_whatsapp`, `action_erp_operation`, `action_ai_agent` (“LOPS IA”),
  `action_wait_for_phase_fields`, `action_move_phase`, `action_run_flow`.

### 2.3 Criar / editar / salvar / ativar

* `POST /flows` e `POST /forms/:formId/flows` (permissão `flows.manage`) → `FlowsService.create` (`flows.service.ts:137`).
* `PATCH /flows/:id` → `update` (`flows.service.ts:164`). O editor salva o canvas inteiro (nodes/edges/viewport) a cada gravação.
* `PATCH /flows/:id/active` → `toggleActive` (`flows.service.ts:203`) — **inverte** `is_active`; não revalida os nós.
* **Validação no backend** — somente em `create`/`update` quando `nodes` vem no corpo, por `validateFlowStructure`
  (`flows.service.ts:849`): máximo de 100 nós (`MAX_FLOW_NODES`), **pelo menos um gatilho** (no máximo um agendado; nenhuma aresta chegando num gatilho), tipo conhecido
  (`FLOW_NODE_TYPES`), ids de nó únicos, dados por tipo em `validateNodeData` (`flows.service.ts:888`, um `switch` por
  `node.type`) e, em `validateFlowEdges`, arestas apontando para nós existentes e **sem ciclo**. Um `update` que traz só
  `edges` é conferido contra os nós já salvos. `action_send_email` (destinatário), `action_webhook` (URL),
  `action_notify_users` (usuários) e `condition_field_value` (campo e operador) seguem as mesmas exigências do editor.
  `default: return` — tipos sem `case` não são validados.
* **Validação no frontend** — `validateFlow()` (`frontend/src/modules/flows/lib/flow-validation.ts`) bloqueia o salvamento
  de nós não configurados, desconectados e ciclos.
* **Ativar** não tem etapa de validação própria: a garantia é “o que foi salvo passou em `validateFlowStructure`”.
  `update` com `isActive: true` só recalcula `next_run_at` (`flows.service.ts:196-198`).

### 2.4 Como um novo tipo de nó é registrado (não há registry dinâmico)

Não existe interface/contrato de nó nem *registry*: cada tipo é registrado **editando 6 pontos em cada lado**.

Backend:
1. união `FlowNodeType` + array `FLOW_NODE_TYPES` (`flow.types.ts:11,62`);
2. interface `Action…Data` + união `FlowNodeData` (`flow.types.ts:108`);
3. ramo `else if (node.type === '…')` em `FlowExecutionEngine.executeNode` (`flow-execution.engine.ts:161-247`);
4. método `executeX` privado no engine;
5. `case` em `FlowsService.validateNodeData` (`flows.service.ts:888`);
6. providers no `FlowsModule` se o nó precisar de serviço novo (`flows.module.ts`).

Frontend: `FlowNodeType`/`FLOW_NODE_TYPES` (`flows/types/flow.types.ts`), `nodeTypes` do React Flow (`FlowCanvas.tsx:55-70`),
paleta (`NodeLibrary.tsx`), metadados/summary do cartão (`nodes/ActionNode.tsx`: `ACCENT`, `CATEGORY_LABEL`, `CONFIG`),
`NODE_META` + formulário no `NodeConfigPanel.tsx`, `defaultNodeData` (`hooks/useFlowEditor.ts:48-65`) e regra em `flow-validation.ts`.

## 3. Ciclo de vida da execução

```mermaid
flowchart TD
  E[Evento de domínio<br/>@OnEvent / webhook / cron] --> L[Listener do gatilho<br/>flows*.listener.ts]
  L --> F[FlowsService.findActiveFlowEntries<br/>fluxo + gatilho de entrada]
  F --> Q{RabbitMQ publica?}
  Q -- sim --> R[(fila formhub.flows.submission<br/>+ .dead)]
  R --> C[FlowsConsumer<br/>flows.consumer.ts:25]
  Q -- não --> I[execução inline]
  C --> J[FlowsService.executeContextJob<br/>flows.service.ts:636]
  I --> X
  J --> B[buildContextFromJob<br/>flows.service.ts:734]
  B --> X[FlowsService.executeFlowWithContext<br/>flows.service.ts:328]
  X --> S[startFlowExecution → status running<br/>flows.service.ts:694]
  S --> EN[FlowExecutionEngine.execute<br/>engine.ts:132]
  EN --> N[executeNode: gatilho → ... → filhos<br/>engine.ts:143]
  N -->|pausa| P[waiting_approval / waiting_phase_fields<br/>paused_node_id]
  P -->|aprovação decidida / fase salva| RS[resumePausedExecution<br/>flows.service.ts:431]
  RS --> RF[engine.resumeFrom<br/>engine.ts:339]
  N -->|fim do grafo| FIM[success | partial_failure | failed]
  RF --> FIM
```

1. **Evento** — ex.: `responses.submitted` (`flows.listener.ts:18`), `approvals.approved/rejected`
   (`flows-approval.listener.ts:41-42`), webhook recebido, SLA, anexo, fase salva, `@Cron` de agendados.
2. **Criação da execução** — `startFlowExecution` grava `FlowExecutionEntity{status:'running'}`
   (`flows.service.ts:694-723`). Só para `responses.submitted` a unicidade (`flow_id`,`submission_id`) impede reexecução
   da mesma submissão (`flows.service.ts:700-703,718`); os demais eventos da mesma solicitação (movida, anexo, fase
   salva, aprovação, SLA…) executam o fluxo a cada ocorrência.
3. **Montagem do contexto** — `FlowExecutionContext` (`flow.types.ts:498`): `eventName`, `flowId`, `flowExecutionId`,
   `submission`/`form`/`fields`, `solicitation`, `approval`, `attachment`, `metadata` (livre), `actorId`,
   `flowEventDepth`, `callStack`, `parentFlowId`. Em jobs de fila o contexto é **recarregado do banco** por
   `buildContextFromJob` (`flows.service.ts:734-800`); `engine.buildContext` consolida `fields` a partir dos itens da
   submissão (`engine.ts:350-363`).
4. **Primeiro nó** — o gatilho de entrada (`ctx.entryNodeId`). Um fluxo pode ter **vários gatilhos**, cada um ligado
   a um ponto do grafo (ex.: o envio do formulário entra pela Logística; um lote de pedidos por webhook entra direto no
   Financeiro). `findActiveFlowEntries` confere cada gatilho do tipo do evento com os próprios filtros (formulário,
   endpoint, fase, origem da solicitação) e escolhe **um** por fluxo: o mais específico, e no empate o primeiro. O job
   leva `entryNodeId`; se o gatilho sumiu do fluxo antes da execução, nada roda. Sem `entryNodeId` (job antigo, teste,
   sub-fluxo), vale o primeiro gatilho.
5. **Execução de cada nó** — `executeNode` (`engine.ts:143-307`): despacha por `node.type`, mede duração, registra
   `NodeExecutionResult{nodeId,status,output?,error?,durationMs}`, incrementa
   `metricsService.recordFlowNodeExecution` e loga (`flowId`,`executionId`,`nodeId`,`nodeType`,`status`,`durationMs`).
6. **Persistência dos resultados** — `flow_executions.node_results` recebe o array **ao final** da execução
   (ou na pausa); não há persistência incremental nó a nó (`flows.service.ts:394-399`).
7. **Seleção do próximo nó** — `traverseChildren` (`engine.ts:309-330`): segue as arestas cuja origem é o nó e cujo
   `sourceHandle` bate com o *handle* retornado (`'yes'`/`'no'` nas condições, `'default'` nas demais). **Detalhe
   importante:** com `handle === 'default'` *todas* as arestas de saída são seguidas, independentemente do
   `sourceHandle`, em profundidade (DFS), uma após a outra. Não há `visited` — um nó alcançável por dois caminhos
   executa duas vezes na mesma execução. Limite de profundidade 50 (`engine.ts:151`).
8. **Falhas** — ver §5.
9. **Finalização** — `success` (nenhum nó falhou) / `partial_failure` (≥ 1 nó falhou) / `failed` (exceção fora de nó)
   (`flows.service.ts:391-415`); métricas `recordFlowExecution`; em fluxos agendados, `updateScheduledTriggerHealth`
   desativa o fluxo após 5 execuções consecutivas não-`success` (`flows.service.ts:53,596-620`).

### 3.1 Pausa e retomada

`action_create_approval` (pendente) e `action_wait_for_phase_fields` retornam `output.paused=true`; o engine **para** de
percorrer o grafo (`engine.ts:266-284`) e `executeFlowWithContext` grava `status='waiting_*'` + `paused_node_id`
(`flows.service.ts:356-389`). Quando a aprovação é decidida (`FlowsApprovalListener` → job `flow_resume`) ou a fase é
salva, `resumePausedExecution`/`resumePausedPhaseFieldsExecution` recarregam o contexto, chamam `engine.resumeFrom` — que
**só percorre os filhos do nó pausado** (`engine.ts:339-348`) — e **anexam** os novos resultados aos anteriores
(`flows.service.ts:531-588`). A mesma linha de execução é reaproveitada.

Antes de retomar, `continuePausedExecution` **reserva** a execução com um UPDATE condicional (`waiting_* → running`): uma
decisão entregue duas vezes, ou dois eventos simultâneos, retomam uma vez só. Na retomada, a aprovação recém-decidida
(`ctx.resumedFromApprovalId`) nunca é tomada como "já existente" pelo próximo `action_create_approval`, e a busca de
aprovação existente é pelo título do próprio nó — alçadas em sequência criam cada uma a sua aprovação.

**Sub-fluxo `sync` que pausa** — `action_run_flow` grava a execução do filho como `waiting_*` (com `approval_id` /
`waiting_phase_id` e `paused_node_id`), e o pai para no nó do sub-fluxo com `status='waiting_subflow'`. Quando o filho
termina (na retomada dele), `resumeParentAfterSubflow` retoma o pai daquele nó; se o filho falhou, o nó do pai é
registrado como falho ("Sub-fluxo falhou") e o pai termina em `partial_failure`. Em modo `async` o pai não espera.

> **Aprovador externo.** Em `action_create_approval`, e-mails sem usuário ativo (`approverEmails`, ou `allowExternalApprovers`
> nos modos campo/dinâmico) decidem por um link pessoal enviado por e-mail; a decisão emite os mesmos
> `approvals.approved|rejected` e a retomada acima é idêntica. Ver [`aprovacao_externa_por_link.md`](aprovacao_externa_por_link.md).

### 3.2 Teste manual

`POST /flows/:id/test` → `FlowsService.runTest` (`flows.service.ts:648`) executa o engine com uma submissão fictícia
(`id:'test-run'`, `metadata.testRun=true`, **sem** `flowExecutionId`) e **sem persistir** a execução — mas as ações **têm
efeito real** (e-mail é enviado, webhook é chamado).

## 4. Contrato real de um nó

Extraído do código — não há `interface Node`:

| Item | Contrato observado |
|---|---|
| Configuração | `node.data` (jsonb, tipo `FlowNodeData` = união de interfaces por tipo); persistida **dentro do fluxo** |
| Contexto | `FlowExecutionContext` **mutável e compartilhado** por todos os nós do caminho; um nó comunica ao próximo gravando em `ctx.metadata.*` (ex.: `lastCheckResponse`), `ctx.solicitation`, `ctx.approval`, `ctx.attachment` |
| Entrada | `ctx` (`fields`, `solicitation`, …) + `node.data`; variáveis `{{x}}` resolvidas por `engine.interpolate` (`engine.ts:454-484`) |
| Saída | `output?: unknown` (livre; ex.: `{provider, status}`); controle de fluxo por *handle* (`'default'`, `'yes'`, `'no'`) |
| Estados do resultado | `'success' \| 'failed' \| 'skipped'` (`flow.types.ts:490`) — `skipped` não é produzido hoje |
| Erro | qualquer `throw` dentro do nó vira `status:'failed'`, `error: err.message` (`engine.ts:287-306`) |
| Seguir ao próximo | só em caso de sucesso (`traverseChildren` na linha 286); **falha encerra aquele ramo** — irmãos continuam — e **não existe saída de erro** |
| Metadados persistidos | só `node_results` (jsonb) em `flow_executions`; o `ctx.metadata` **não** é persistido |
| Validação | estática, em `validateNodeData` (salvar) e `validateFlow` (frontend); em runtime cada `executeX` revalida o essencial e lança `Error` |
| Registro | manual (§2.4) |

### 4.1 Variáveis dinâmicas (`interpolate`, `engine.ts:454-484`)

`{{responder_name}}`, `{{responder_email}}`, `{{form_name}}`, `{{submitted_at}}`, `{{solicitation_number}}`,
`{{solicitation_title}}`, `{{solicitation_status}}`, `{{solicitation_priority}}`, `{{solicitation_requester_name}}`,
`{{solicitation_requester_email}}`, `{{solicitation_responsible_name}}`, `{{tracking_url}}` e, por fim, `{{codigo}}`
= `ctx.fields[codigo] ?? ctx.metadata[codigo] ?? ''`. Variável inexistente → **string vazia, silenciosamente**.
Substituição em *cadeia* de `replace`: o valor inserido por uma regra anterior pode ser reexpandido pelas seguintes
(ex.: um nome de respondente contendo `{{tracking_url}}`). Sem escape de HTML — `action_send_email` envia o corpo como
`html`.

### 4.2 Condições e ramificação

`condition_*` devolvem `'yes'`/`'no'` (`engine.ts:163-191`) e a travessia filtra pela aresta `sourceHandle`.
`condition_always_true` sempre `'yes'`. `compareValues` (`engine.ts:386-417`) converte tudo para string; números em
pt-BR (`18.500,00`) são tratados.

## 5. Falhas, retentativas e idempotência

| Situação | Comportamento atual |
|---|---|
| Exceção em nó | resultado `failed`, ramo encerrado, execução termina `partial_failure` (`engine.ts:287-306`, `flows.service.ts:391-399`) |
| Exceção fora de nó (ex.: profundidade > 50) | execução `failed` (`flows.service.ts:404-415`) |
| Falha de job na fila | `RabbitMqService.handleMessage`: reenfileira com backoff 1s/2s/4s até 3×, depois `nack` → DLQ (`rabbitmq.service.ts:217-242`). `executeFlowWithContext` captura quase tudo, então o retry é raro |
| Broker indisponível | publicação devolve `false` → execução **inline** (`flows.listener.ts:34-45`) |
| Reprocessamento | não existe “reexecutar execução”. `action_create_approval` e `createFromFlowPayload` têm idempotência própria (`engine.ts:736-745`, `idempotencyKey*`) |
| Nó `action_send_email`/`action_notify_users`/`action_send_whatsapp` | **sem idempotência**: um reprocessamento reenvia. `action_send_email` **ignora silenciosamente** o envio se o SMTP não está configurado (`flow-mailer.service.ts:27-30`); `action_send_whatsapp` devolve `status:'failed'` **sem lançar** (nó “success” com output `failed`) (`whatsapp-connector.service.ts:55-110`) |
| Retomada | só por pausa (§3.1); não há retomada após falha |

## 6. Como o frontend representa e configura os nós

* Estado do canvas: `useFlowEditor` (`frontend/src/modules/flows/hooks/useFlowEditor.ts`) — React Flow `nodes`/`edges`,
  autosave, undo (20 níveis), `defaultNodeData` por tipo.
* Visual: `TriggerNode` / `ConditionNode` (dois handles `yes`/`no`) / `ActionNode` (um handle de saída) — `nodes/*.tsx`.
* Configuração: `panels/NodeConfigPanel.tsx` (um componente de formulário por tipo; `set(key, value)` grava em `node.data`).
* Variáveis: `BUILTIN_VARS` + campos do formulário em `VariablesSection` (`NodeConfigPanel.tsx:425-492`).
* Execução: `FlowHistoryPanel` lista `flow_executions`; `FlowTestModal` chama `/flows/:id/test`.

## 7. Lacunas relevantes para notificações (achados)

1. **Três nós de comunicação sem contrato comum** (`action_send_email`, `action_notify_users`, `action_send_whatsapp`),
   cada um com sua semântica de falha e nenhum rastreável por execução (exceto `whatsapp_messages.flow_execution_id`).
2. **A notificação “interna” não tem leitor**: `action_notify_users` grava em `notifications`
   (`flow-execution.engine.ts:672-685`), mas nenhum endpoint ou tela lê essa tabela (a única rota `/notifications` é
   `push-token`). O requisito aparece em `Docs/resumo_geral_e_visao_futura_formhub.md:187,560,664`.
3. **E-mail “enviado” sem SMTP** e **WhatsApp “enviado” pelo mock** (a fábrica cai no mock se o Evolution não estiver
   configurado — `whatsapp.module.ts:31-44`) — hoje isso é indistinguível de entrega real.
4. **Sem idempotência** para reenvio e **sem retentativa** de provedor.
5. **Substituição de variáveis sem escape** e com reexpansão (§4.1).
6. **Falha de nó não pode ser tolerada** (`continueOnFailure` não existe): ou o ramo para, ou o nó precisa esconder o erro.
