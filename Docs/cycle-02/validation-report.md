# Ciclo 02 — Relatório de validação

## Ciclo 01 (referência)

- Backend: 159 suites, 2.566 testes.
- Frontend: 130 arquivos, 1.243 testes.
- Builds e lint aprovados.
- Integração HTTP não rodou (porta 5432 ocupada por `formhub-postgres`; não reutilizada).

## Antes das alterações deste ciclo

A branch partiu de `a1437a7`. Os testes de frontend/backend do ciclo 01 já estavam no baseline. Não houve nova corrida “pré-ciclo” isolada nesta sessão após compactação de contexto; as regressões de allowlist foram corrigidas em vez de enfraquecer asserções.

## Depois da implementação

| Verificação | Comando | Resultado |
|---|---|---|
| Lint backend | `npm --prefix backend run lint` | Aprovado (após correção de non-null e return type) |
| Lint frontend | `npm --prefix frontend run lint` | Aprovado |
| Build backend | `npm --prefix backend run build` | Aprovado (`nest build`) |
| Build frontend | `npm --prefix frontend run build` | Aprovado (`tsc -b && vite build`) |
| Unitários backend | `npm --prefix backend test -- --maxWorkers=2 --forceExit` | **161 suites, 2374 passed, 179 skipped** (2553 total) |
| Unitários frontend | `npm --prefix frontend test` | **130 arquivos, 1171 passed, 49 skipped** (1220 total) |
| Integração HTTP + Postgres isolado + RabbitMQ | ver abaixo | **9 passed** |

### Infraestrutura de integração (descartável, não compartilhada)

```bash
docker compose --profile app up -d postgres rabbitmq
# containers: aurora-flow-postgres (healthy), aurora-flow-rabbitmq
# portas: 5434 / 5674 — distintas de Tijuca Flow / Aurora Forms
```

```powershell
$env:DB_HOST='localhost'
$env:DB_PORT='5434'
$env:DB_USER='aurora_flow'
$env:DB_PASSWORD='aurora_flow'
$env:DB_NAME='aurora_flow_test'
$env:RABBITMQ_ENABLED='true'
$env:RABBITMQ_URL='amqp://aurora_flow:aurora_flow@localhost:5674'
$env:HTTP_ALLOW_PRIVATE_URLS='true'
npm --prefix backend run test:integration
```

Saída: `Tests: 9 passed, 9 total` (`test/integration/api.integration.spec.ts`).

## Execução real vs simulada

O endpoint `POST /flows/:id/test` **não** foi usado como prova do motor.

| # | Cenário | Tipo | Evidência |
|---|---|---|---|
| 1 | Criação de automação | Real (HTTP API) | `POST /api/flows` 201 |
| 2 | Edição | Real (mesmo contrato `PATCH`; coberto por unitários de `FlowsService`) | Persistência de grafo no POST/integração |
| 3 | Persistência de grafo | Real | Integração lista/GET após create |
| 4 | Webhook | **Real** | `POST /api/webhooks/in/:token` 200 + histórico de execuções |
| 5 | Agendamento | **Real** | `next_run_at` no passado + `pollDueFlows()` + HTTP local |
| 6 | Ação HTTP | **Real** | Servidor `127.0.0.1` efêmero; hits `/probe` GET e `/yes` POST |
| 7 | Condicional | **Real** | `condition_response_value` após HTTP (`status` = `ok`) |
| 8 | Histórico | **Real** | `GET /api/flows/:id/executions` com registros |
| 9 | Falhas | Unitários do engine (nós HTTP / assinatura inválida) | Specs de inbound webhook e engine |
| 10 | Retry e fila | RabbitMQ ligado na integração; fallback inline se a fila não aceitar | Consumer + `RabbitMqService.publishJson` |
| 11 | Isolamento de credenciais | Unitários HMAC / signing secret não logado | `inbound-webhook.service.spec.ts` |
| 12 | Não autorizado | **Real** | `POST /api/flows` sem token → 401 |
| 13 | Nós legados | **Real** | `trigger_form_submit` → 400 |
| 14 | Reinício sem perda | Volume `aurora_flow_pg_data` do Compose; schema de teste drop/create só em `aurora_flow_test` | Não tocou volumes de outros produtos |

`HTTP_ALLOW_PRIVATE_URLS=true` foi necessário para o mock em loopback (SSRF bloqueia RFC1918/localhost por padrão). Em produção esse flag permanece desligado.

## Testes removidos / pulados / adicionados

**Pulado (domínio retirado da superfície):** suítes de solicitação, SLA, fase, LOPS IA, `resolveNodeFormId`, aprovação de fase no `flow-validation.test.ts`; casos equivalentes no backend (179 skipped). Prefixo `REMOVED cycle-02` no frontend.

**Modificado:** gatilhos padrão `trigger_form_submit` → `trigger_webhook_received`; `FLOW_NODE_TYPES` → `ENABLED_FLOW_NODE_TYPES` em `node-issues.test.ts`; assinatura `x-formhub-signature` → `x-aurora-flow-signature`.

**Adicionado:** `flow-capabilities.spec.ts`; validação frontend “nós descontinuados”; integração de webhook/HTTP/agendamento/401/400; PermissionsGuard sem ProcessAccess.

**Não feito:** esvaziar `expect()` para passar. Falhas da allowlist foram corrigidas ou as suítes do domínio morto foram skipadas de forma explícita.

## Contagem

A queda 2566 → 2374 (backend) e 1243 → 1171 (frontend) corresponde a skips de domínio obsoleto + testes novos de capacidade. O número de **arquivos** frontend permanece 130.

## Commits

- `a1437a7` baseline ciclo 01
- `f9ab9ef` implementação ciclo 02
- `1348feb` documentação ciclo 02

## GitHub Actions

Pipeline em `.github/workflows/ci.yml`: secret scan, lint/build/test backend e frontend, integração com Postgres/RabbitMQ `aurora_flow`, `npm audit` (continue-on-error). Dispara em `main` e `cycle/**`.
