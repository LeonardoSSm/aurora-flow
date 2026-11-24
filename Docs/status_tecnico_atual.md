# Status tecnico atual do FormHub

Data da auditoria: 2026-05-15

## Escopo

Auditoria tecnica inicial do monorepo FormHub, sem criacao de novas funcionalidades. O projeto possui backend NestJS em `backend/` e frontend React/Vite em `frontend/`.

## Comandos executados

| Comando | Resultado |
| --- | --- |
| `Test-Path node_modules`, `Test-Path backend\node_modules`, `Test-Path frontend\node_modules` | Todos retornaram `True`; instalacao nao foi necessaria. |
| `npm install` | Nao executado; dependencias da raiz ja estavam instaladas. |
| `npm --prefix backend install` | Nao executado; dependencias do backend ja estavam instaladas. |
| `npm --prefix frontend install` | Nao executado; dependencias do frontend ja estavam instaladas. |
| `npm --prefix backend run build` | Passou. |
| `npm --prefix backend test` | Falhou inicialmente por specs desatualizadas de `FormListQuery`; corrigido sem alterar regra de negocio. Resultado final: passou, 15 suites e 250 testes. |
| `npm --prefix frontend run build` | Passou. Vite emitiu aviso de chunk acima de 500 kB. |
| `npm --prefix frontend test` | Passou, 6 arquivos e 51 testes. |
| `npm run build` | Passou, executando build do backend e do frontend. Mesmo aviso de chunk grande no frontend. |
| `npm --prefix backend run lint` | Falhou inicialmente por tipo de retorno ausente no controller de automacoes e mock nao usado em spec; corrigido. Resultado final: passou. |
| `npm --prefix frontend run lint` | Passou. |
| `docker compose ps` | Confirmou containers locais em execucao para PostgreSQL, RabbitMQ, Prometheus, Grafana e postgres-exporter. |
| `docker compose config --services` | Confirmou servicos `postgres`, `postgres-exporter`, `rabbitmq`, `prometheus` e `grafana`. |

## Correcoes tecnicas realizadas

- Ajustadas specs de formularios para refletir a assinatura atual de `FormListQuery`, que recebe apenas o repositorio de formularios.
- Atualizado teste de listagem de formularios para validar os campos agregados atuais (`submissionCount` e `latestVersionNumber`) retornados pela query.
- Removido mock nao utilizado em spec de seguranca por linha de formularios.
- Adicionados tipos de retorno explicitos em metodos do controller de automacoes para satisfazer o lint.

Nenhuma entidade, modulo funcional ou fluxo de negocio novo foi criado.

## Resultado de build, testes e lint

- Backend build: passou.
- Backend test: passou.
- Backend lint: passou.
- Frontend build: passou com aviso de bundle grande.
- Frontend test: passou.
- Frontend lint: passou.
- Build da raiz: passou.

## Modulos existentes no backend

- `analytics`
- `audit`
- `auth`
- `automations`
- `connectors`
- `dashboard`
- `flows`
- `forms`
- `google-workspace`
- `health`
- `observability`
- `queue`
- `responses`
- `roles`
- `settings`
- `users`

## Telas existentes no frontend

- `admin-audit-page.tsx`
- `admin-overview-page.tsx`
- `admin-page.tsx`
- `admin-permissions-page.tsx`
- `admin-settings-page.tsx`
- `admin-users-page.tsx`
- `builder-page.tsx`
- `dashboard-page.tsx`
- `flow-editor-page.tsx`
- `flows-page.tsx`
- `forms-page.tsx`
- `google-auth-callback-page.tsx`
- `login-page.tsx`
- `public-form-page.tsx`
- `responses-page.tsx`

## Migrations existentes

- `1777911403160-InitialSchema.ts`
- `1778174474562-SubmissionAuditFields.ts`
- `1778767239016-AppSettings.ts`
- `1778783727962-AutomationRules.ts`
- `1778800702193-FieldVisibilityRules.ts`
- `1778810106862-FlowsAndExecutions.ts`
- `1778815100000-NullableFlowFormId.ts`
- `1778815200000-UniqueFlowNamePerCreator.ts`
- `1778815300000-ResponseIdempotencyAndFlowExecutionUniqueness.ts`

Tambem existe `backend/src/database/migrations/README.md`.

## Docker Compose local

O `docker-compose.yml` sobe localmente:

- PostgreSQL: container `formhub-postgres`, porta `5432`, status healthy.
- RabbitMQ: container `formhub-rabbitmq`, portas `5672`, `15672` e `15692`, status healthy.
- Prometheus: container `formhub-prometheus`, porta `9090`.
- Grafana: container `formhub-grafana`, porta `3001`.
- Postgres exporter: container `formhub-postgres-exporter`, porta `9187`.

Observacao: o Docker emite aviso de que o atributo `version` no `docker-compose.yml` esta obsoleto.

## Riscos tecnicos encontrados

- O frontend gera aviso de bundle grande no build (`index` acima de 500 kB). Isso pode afetar carregamento inicial e deve ser tratado com code splitting ou ajuste de chunks.
- O `docker-compose.yml` ainda usa o atributo `version`, que hoje e aceito, mas obsoleto.
- Ha risco operacional no RabbitMQ quando uma fila ja existente foi criada com argumentos diferentes dos esperados pela aplicacao, especialmente TTL. Em ambiente local anterior foi observado erro `PRECONDITION_FAILED` por divergencia de `x-message-ttl`.
- A area de fluxos e automacoes possui telas e entidades, mas ainda precisa de cobertura mais forte de testes para execucao real de acoes, gatilhos e condicoes.
- Alguns conectores e acoes aparecem na experiencia de fluxo, mas dependem de integracoes externas ou implementacoes complementares para ficarem totalmente operacionais em producao.
- O repositorio esta em desenvolvimento ativo com muitas alteracoes no working tree; qualquer ajuste futuro deve preservar alteracoes existentes e evitar refactors amplos sem necessidade.

## Proximos ajustes recomendados

- Adicionar testes de integracao para listagem, criacao, atualizacao e execucao de fluxos.
- Cobrir o motor de automacoes com cenarios de gatilhos, condicoes e acoes, incluindo falhas e idempotencia.
- Padronizar argumentos das filas RabbitMQ ou documentar procedimento de recriacao/migracao de filas locais.
- Aplicar code splitting nas principais rotas do frontend para reduzir o bundle inicial.
- Remover o atributo obsoleto `version` do `docker-compose.yml` apos validacao.
- Revisar a experiencia de acoes, gatilhos e condicoes para separar claramente o que esta funcional do que ainda depende de integracao externa.
