# Ciclo 01 — Relatório de validação

Data: 2026-11-24  
Ambiente: máquina local Windows, pasta `E:\Desenvolvimento\aurora-flow`  
Git: esta pasta **não é um repositório Git** (sem remotes, sem push).

## Comandos e resultados

| Verificação | Comando | Resultado |
|---|---|---|
| ESLint backend | `npm --prefix backend run lint` | exit 0, `--max-warnings=0` |
| ESLint frontend | `npm --prefix frontend run lint` | exit 0, `--max-warnings=0` |
| Build backend | `npm --prefix backend run build` | exit 0 (`nest build`) |
| Build frontend | `npm --prefix frontend run build` | exit 0 (`tsc -b && vite build`, ~2732 módulos) |
| Testes unitários backend | `npx jest --maxWorkers=2` (após OOM por paralelismo) | **159 suites, 2566 testes, todos passaram** |
| Testes frontend | `npx vitest run` | **130 arquivos, 1243 testes, todos passaram** |
| Integração HTTP | `npm --prefix backend run test:integration` | **não executada**: depende de Postgres `formhub_test`; a porta 5432 já estava ocupada por um container `formhub-postgres` de outro compose local. Não foi destruído nem reutilizado para não misturar dados. |

A primeira tentativa de rodar Jest e Vitest **em paralelo** esgotou memória (workers `SIGTERM` / `Worker exited unexpectedly`). Não é falha de asserção. Reexecução sequencial com heap `4096` e `--maxWorkers=2` no Jest ficou verde.

Nenhum teste foi desativado para simular sucesso. Nenhuma regra de lint foi afrouxada neste ciclo para esconder erro.

## Inicialização da API

1. Container isolado `aurora-flow-postgres-local` (Postgres 16, porta **5433**, usuário/banco locais `formhub`) — não usa o Postgres já existente em 5432.
2. `RABBITMQ_ENABLED=false` no `.env` local (fila em fallback; RabbitMQ 5672 também já estava ocupado).
3. `GOOGLE_TOKEN_ENCRYPTION_KEY` vazio no `.env` / `.env.example` quando não há OAuth Google. O placeholder anterior (`change-me-32-bytes-base64`) quebrava o boot (decodificava para 18 bytes).
4. Correção do glob TypeORM CLI: `backend/src/database/data-source.ts` passou a carregar `migrations/*{.ts,.js}` (antes só `*.js`, então `migration:run` criava tabela vazia e saía com “No migrations are pending”).
5. `npm run migration:run` aplicou a cadeia até `SolicitationSourceLink1791600000000`.
6. `npm run start:dev` — log `Nest application successfully started`.

### Smoke HTTP (2026-11-24)

| Chamada | Evidência |
|---|---|
| `GET /api/v1/health` | `{"status":"ok","service":"aurora-flow-backend"}` |
| `POST /api/v1/auth/login` | seed `admin@aurora-flow.local` autenticou |
| `POST /api/v1/flows` | fluxo `Ciclo 01 smoke` id `7138ba08-75c8-4fb9-a297-4b4dc880f6c4` |
| `POST /api/v1/flows/:id/test` | `t1` (webhook) e `c1` (`condition_always_true`) com `status: success` |
| `GET /api/v1/forms` | **404** (superfície de formulários desativada) |
| `GET /api/v1/docs-json` | `title: "Aurora Flow API"` |

O teste de fluxo usou o modo de simulação da API (`/flows/:id/test`): não envia e-mail nem chama HTTP externo.

## Frontend

- Vite em `http://localhost:5173`.
- Título da página: **Aurora Flow**.
- Tela de login exibe wordmark `aurora` + `flow` (captura no navegador de automação).
- Login interativo no navegador **não foi preenchido por automação**: o campo senha é bloqueado pela política de ferramentas. Autenticação e persistência de fluxo foram validadas pela API acima.

Rotas de formulário/kanban no SPA redirecionam para `/inicio` ou `/flows` (ver testes `src/app/router.test.tsx`).

## Referências remanescentes (Tijuca / formulários)

Superfície ativa (login, menu, home, paleta, Swagger, seed admin, `org.name` padrão) usa Aurora Flow.

Ainda existem, de propósito, no código isolado:

- Pasta `frontend/src/brand/tijuca` (não é o brand exportado).
- Pacote de UI `@tijucas/ui` / design system (dependência visual compartilhada, não o produto Tijuca Flow).
- Prefixo Prometheus `formhub_*`, cookie `formhub_refresh`, filas `formhub.flows.submission`.
- Nomes Docker `formhub-*` e credenciais locais `formhub` no compose.
- Entidades, serviços, nós de processo e artigos de ajuda de formulário (HTTP desligado; testes unitários internos ainda passam).
- E-mails de pontuação / LOPS IA / aprovações externas em módulos com `controllers: []`.

## Impedimentos aceitos

- Sem Git neste diretório: isolamento já está garantido; não há remote para o repositório original.
- Integração Jest HTTP e RabbitMQ reais não rodaram neste ambiente por conflito de portas com containers `formhub-*` pré-existentes. Não foram removidos.
- Extração física do schema de formulários fica para ciclo posterior (risco ao `FlowExecutionEngine`).
