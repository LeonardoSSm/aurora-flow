# Ciclo 02 — Decisões de arquitetura

## ADR-02-01 — Allowlist de capacidades, não reescrita do engine

**Contexto:** O `FlowExecutionEngine` mistura nós genéricos e nós de processo. Reescrevê-lo arriscaria regressões no retry, fila, interpolação e HTTP.

**Decisão:** `ENABLED_FLOW_NODE_TYPES` no backend (`flow-capabilities.ts`) e no frontend (`flow.types.ts`). Persistência e execução recusam o restante com erro explícito.

**Consequência:** Código morto de processo permanece até um ciclo de extração de schema. Não executa em produção do Aurora Flow.

## ADR-02-02 — Isolar, não apagar, entidades e migrations

**Contexto:** O pedido exige instalação independente sem apagar migrations históricas.

**Decisão:** Manter a cadeia de migrations. Instância nova aplica o histórico completo (incluindo tabelas de formulário vazias). Documentar baseline futura em `remaining-technical-debt.md`.

**Risco:** Schema maior que o necessário. Aceito até haver estratégia de squash com janela de migração.

## ADR-02-03 — ProcessAccess e Forms fora do grafo Nest ativo

**Contexto:** `PermissionsGuard`, `AuthService` e `GoogleOAuthService` injetavam `ProcessAccessService`. Com `AccessModule` fora do `AppModule`, o bootstrap quebrava.

**Decisão:** `@Optional()` nesses pontos. Sem o serviço, permissões de processo são negadas; login devolve permissões de papel via `PermissionsService`.

## ADR-02-04 — Independência operacional por nomes e portas

**Contexto:** Tijuca Flow / Aurora Forms na mesma máquina.

**Decisão:** Projeto Compose `aurora-flow`; portas 5434 / 5674 / 15674 / 3010 / 5174; banco/usuário `aurora_flow`; fila `aurora.flow.execution`; métricas `aurora_flow_*`; cookie `aurora_flow_refresh`. Tudo configurável por env.

## ADR-02-05 — Contrato de eventos sem produto vizinho fictício

**Decisão:** Documentar `AuroraFlowInboundEventV1`. O gatilho real continua sendo HTTP `POST /webhooks/in/:token`. Não implementar adaptador “Aurora Forms” sem contrato publicado por esse produto.

## ADR-02-06 — Testes de domínio removido são skip, não asserções esvaziadas

**Decisão:** `describe.skip('REMOVED cycle-02 …')` nos specs de nós de solicitação/SLA/fase. Specs de nós genéricos foram convertidos para webhook/agendamento. Inventário de ajuda ainda lista arquivos; contagens de testes caem de forma justificada.
