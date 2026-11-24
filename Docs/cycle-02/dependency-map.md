# Ciclo 02 — Mapa de dependências do motor

## Núcleo desejado

Definições de fluxo, nós, conexões, gatilhos, contexto de execução, eventos, payloads, variáveis, credenciais, resultados, histórico, retry e erros.

Arquivos centrais:

- `backend/src/app.module.ts`
- `backend/src/modules/flows/flows.module.ts`
- `backend/src/modules/flows/flow-execution.engine.ts`
- `backend/src/modules/flows/flows.service.ts`
- `backend/src/modules/flows/flows.controller.ts`
- `backend/src/modules/flows/flow-capabilities.ts`
- `backend/src/modules/automations/automations.module.ts` (regras antigas; não é o editor visual)

## Dependências eliminadas da superfície (HTTP e DI ativo)

Módulos **não** importados em `AppModule`:

- Forms, Responses, Public form, Solicitations, Approvals, Kanban, Access, Dashboards, Records, Reports, AI builder, Mobile-related controllers, process listeners.

`FlowsModule` **não** importa Solicitations/Approvals/LopsAi nem registra listeners de processo.

Rotas de UI de formulário/kanban/solicitações redirecionam para `/inicio` ou `/flows`.

Paleta visual: apenas nós em `ENABLED_FLOW_NODE_TYPES`.

## Dependências isoladas (código ainda no repositório)

O motor ainda **compila** ramos de nós de processo (move kanban, criar solicitação, aprovação, LOPS IA). Esses ramos:

1. Não passam em `isEnabledFlowNodeType` — `executeNode` lança erro explícito.
2. Não passam no DTO da API (`@IsIn(ENABLED_FLOW_NODE_TYPES)`).
3. Usam `SolicitationsService` / `ApprovalsService` via `@Optional()`; se invocados, `processSolicitations()` / `processApprovals()` falham com mensagem clara.

TypeORM ainda registra entidades de formulário/processo (`backend/src/database/entities/index.ts`) porque o schema histórico e o engine legado as referenciam. **Não** há baseline destrutiva de migrations neste ciclo.

## Nós habilitados

`trigger_webhook_received`, `trigger_scheduled`, `condition_always_true`, `condition_field_value`, `condition_response_value`, `action_send_email`, `action_webhook`, `action_http_check`, `action_notify_users`, `action_google_sheets`, `action_send_whatsapp`, `action_erp_operation`, `action_run_flow`, `action_notification`.

`action_erp_operation` permanece: é conector HTTP genérico, não lookup de campo de formulário.

## Integração entre produtos

Contrato versionado em `backend/src/modules/integrations/platform-boundaries.ts` (`contractVersion: "1"`). Não há cliente fictício de Aurora Forms.

## Fronteira justificada

Não extraímos um pacote “core” separado: o custo de mover o engine inteiro superaria o ganho neste ciclo. A fronteira efetiva é a **allowlist de nós** + **módulos fora do `AppModule`** + **serviços de processo opcionais**.
